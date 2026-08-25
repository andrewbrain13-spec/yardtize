"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { notifyLeaseReviewed } from "@/lib/notifications";
import { writeSchedule } from "@/lib/ledger";

export type ReviewState = { status: "idle" | "done" | "error"; message?: string };

/**
 * The operator's decision on a signed copy.
 *
 * Approving is what takes a placement live: the lease moves to approved and
 * the request moves to active in the same action, because a confirmed
 * agreement and a live sign are the same event and letting them drift apart
 * would mean a sign in the ground with no countersigned agreement, or the
 * reverse.
 */
export async function reviewLease(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const session = await getSessionProfile();
  if (!session?.profile?.is_admin) return { status: "error", message: "Not permitted." };

  const admin = createAdminClient();
  if (!admin) return { status: "error", message: "SUPABASE_SECRET_KEY isn't set." };

  const leaseId = String(formData.get("leaseId") ?? "");
  const approve = formData.get("approve") === "true";
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);

  if (!approve && !note) {
    return { status: "error", message: "Say what was wrong — they need to know what to fix." };
  }

  const { data: lease } = await admin
    .from("leases")
    .select("id, request_id, status")
    .eq("id", leaseId)
    .maybeSingle();

  if (!lease) return { status: "error", message: "That agreement no longer exists." };
  if (lease.status !== "submitted") {
    return { status: "error", message: `This one is already ${lease.status.replace("_", " ")}.` };
  }

  const { error } = await admin
    .from("leases")
    .update({
      status: approve ? "approved" : "rejected",
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: approve ? note || null : note,
    })
    .eq("id", leaseId);

  if (error) return { status: "error", message: error.message };

  if (approve) {
    await admin.from("requests").update({ status: "active" }).eq("id", lease.request_id);

    /*
     * Countersigning is the moment the money becomes owed, so the schedule is
     * written now and frozen — a later change to the listing's rate must not
     * reach back into a placement somebody has signed.
     */
    await writeSchedule(lease.request_id);
  }

  const told = await notifyLeaseReviewed(
    lease.request_id,
    approve,
    note || null,
    await getSiteOrigin(),
  );
  if (!told.sent && told.reason === "failed") {
    console.error("[notify] lease-reviewed email failed:", told.detail);
  }

  revalidatePath("/admin/leases");
  revalidatePath("/admin");
  revalidatePath(`/agreement/${lease.request_id}`);
  return { status: "done" };
}
