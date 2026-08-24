"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { getSiteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONSENT_TEXT } from "@/lib/signing";
import { notifyOperatorOfSignedLease } from "@/lib/notifications";

export type UploadState = { status: "idle" | "done" | "error"; message?: string };

/**
 * Attaches a signed copy to a lease.
 *
 * The file has already been put in the private bucket by the browser — a
 * server action carrying a 25 MB phone photograph through a form post is a
 * slow, fragile way to move bytes that Storage will accept directly. What this
 * does is the part that must not be client-side: recording the path against
 * the lease and moving it to `submitted`.
 *
 * The row-level policy allows a party to make exactly this transition and
 * nothing else, so a party cannot approve their own lease even by calling this
 * endpoint directly.
 */
export async function submitSignedLease(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const leaseId = String(formData.get("leaseId") ?? "");
  const path = String(formData.get("path") ?? "").trim();

  if (!path) return { status: "error", message: "Attach the signed copy first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Please sign in." };

  const { error } = await supabase
    .from("leases")
    .update({
      status: "submitted",
      signed_path: path,
      signed_by: user.id,
      signed_at: new Date().toISOString(),
      review_note: null,
    })
    .eq("id", leaseId);

  if (error) {
    return {
      status: "error",
      message:
        "That couldn't be recorded. If the agreement has already been approved, there is nothing left to send.",
    };
  }

  const { data: lease } = await supabase
    .from("leases")
    .select("request_id")
    .eq("id", leaseId)
    .maybeSingle();

  if (lease) {
    const notified = await notifyOperatorOfSignedLease(lease.request_id, await getSiteOrigin());
    if (!notified.sent && notified.reason === "failed") {
      console.error("[notify] signed-lease email failed:", notified.detail);
    }
  }

  revalidatePath("/agreement");
  return { status: "done" };
}


export type SignState = { status: "idle" | "signed" | "error"; message?: string };

/**
 * Signs an agreement in the app.
 *
 * Which party the signer is gets resolved here from the placement, never taken
 * from the form — a browser that could name its own side could sign as the
 * other one. The consent wording, the address and the browser are stamped
 * server-side for the same reason.
 *
 * Once both sides have signed, the agreement moves to review on its own. The
 * operator still confirms before a sign goes in the ground; what disappears is
 * the printer.
 */
export async function signLease(_prev: SignState, formData: FormData): Promise<SignState> {
  const leaseId = String(formData.get("leaseId") ?? "");
  const typedName = String(formData.get("typedName") ?? "").trim();
  const drawnMark = String(formData.get("drawnMark") ?? "").trim() || null;
  const consented = formData.get("consented") === "on";

  if (typedName.length < 2) return { status: "error", message: "Type your full name to sign." };
  if (!consented) {
    return { status: "error", message: "Tick the box to confirm you mean this as your signature." };
  }
  // A drawn mark is a data URL from a canvas. Anything else does not belong in
  // a document, and an unbounded string does not belong in a row.
  if (drawnMark && (!drawnMark.startsWith("data:image/png;base64,") || drawnMark.length > 200_000)) {
    return { status: "error", message: "That drawn signature didn't come through. Try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Please sign in." };

  const admin = createAdminClient();
  if (!admin) return { status: "error", message: "Signing isn't available on this deployment." };

  const { data: lease } = await admin
    .from("leases")
    .select("id, request_id, status")
    .eq("id", leaseId)
    .maybeSingle();
  if (!lease) return { status: "error", message: "That agreement no longer exists." };
  if (lease.status === "approved") {
    return { status: "error", message: "This agreement is already confirmed." };
  }

  const { data: request } = await admin
    .from("requests")
    .select("requester_id, listing_id")
    .eq("id", lease.request_id)
    .maybeSingle();
  const { data: listing } = request
    ? await admin.from("listings").select("owner_id").eq("id", request.listing_id).maybeSingle()
    : { data: null };

  const party =
    listing?.owner_id === user.id
      ? "owner"
      : request?.requester_id === user.id
        ? "advertiser"
        : null;

  if (!party) return { status: "error", message: "You're not a party to this agreement." };

  const headerBag = await headers();
  // x-forwarded-for is a list; the first entry is the client as the edge saw it.
  const ip = (headerBag.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  const { error } = await admin.from("lease_signatures").upsert(
    {
      lease_id: leaseId,
      signer_id: user.id,
      party,
      typed_name: typedName,
      drawn_mark: drawnMark,
      consent_text: CONSENT_TEXT,
      ip,
      user_agent: headerBag.get("user-agent")?.slice(0, 400) ?? null,
      signed_at: new Date().toISOString(),
    },
    { onConflict: "lease_id,signer_id" },
  );

  if (error) return { status: "error", message: "That couldn't be recorded. Try again." };

  /*
   * Both signatures present means the agreement is ready for review. Counted
   * by distinct party rather than by row, so two signatures from the same side
   * could never stand in for both.
   */
  const { data: signatures } = await admin
    .from("lease_signatures")
    .select("party")
    .eq("lease_id", leaseId);

  const parties = new Set((signatures ?? []).map((s) => s.party));
  if (parties.size === 2 && lease.status !== "submitted") {
    const { error: moveError } = await admin
      .from("leases")
      .update({
        status: "submitted",
        signed_at: new Date().toISOString(),
        signed_by: user.id,
        review_note: null,
      })
      .eq("id", leaseId);

    /*
     * Checked rather than assumed. This update failed silently for a while —
     * a constraint written for the upload flow required a file that in-app
     * signing never produces — and the only symptom was an agreement that
     * both parties had signed sitting at "awaiting signature".
     */
    if (moveError) {
      console.error("[lease] could not move to review:", moveError.message);
      return {
        status: "error",
        message: "Your signature was recorded, but sending it for review failed. We've been told.",
      };
    }

    const notified = await notifyOperatorOfSignedLease(lease.request_id, await getSiteOrigin());
    if (!notified.sent && notified.reason === "failed") {
      console.error("[notify] signed-lease email failed:", notified.detail);
    }
  }

  revalidatePath(`/agreement/${lease.request_id}`);
  return { status: "signed" };
}
