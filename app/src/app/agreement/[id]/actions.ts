"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
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
