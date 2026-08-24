"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { notifyRequesterOfDecision } from "@/lib/notifications";
import type { RequestStatus } from "@/lib/supabase/types";

export type DecisionState = { error?: string };

/**
 * Moves a placement request along: requested → approved → active, or declined.
 *
 * Row-level security already limits updates to the owner of the yard, but the
 * transition itself is checked here too — a request should never jump straight
 * from "requested" to "active" without the homeowner having approved it.
 */
const ALLOWED: Record<string, RequestStatus[]> = {
  requested: ["approved", "declined"],
  approved: ["active", "declined"],
  active: ["completed"],
};

export async function decideRequest(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const id = String(formData.get("requestId") ?? "");
  const next = String(formData.get("next") ?? "") as RequestStatus;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { data: current } = await supabase
    .from("requests")
    .select("id, status, listing_id")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { error: "That request no longer exists." };

  if (!ALLOWED[current.status]?.includes(next)) {
    return { error: `A ${current.status} request can't be moved to ${next}.` };
  }

  // Confirm the caller owns the yard before touching anything.
  const { data: listing } = await supabase
    .from("listings")
    .select("owner_id")
    .eq("id", current.listing_id)
    .maybeSingle();

  if (!listing || listing.owner_id !== user.id) {
    return { error: "Only the owner of this yard can answer that request." };
  }

  const { error } = await supabase.from("requests").update({ status: next }).eq("id", id);

  if (error) {
    /*
     * 23P01 is the exclusion constraint from migration 0010: this yard already
     * has an approved sign over some of those days. It is reachable whenever
     * two requests for overlapping weeks are both sitting in the inbox and the
     * owner says yes to both — which is exactly the case the constraint exists
     * for, and exactly the case a check-then-write in application code would
     * miss under a race.
     */
    if (error.code === "23P01") {
      return {
        error:
          "Those dates clash with a placement you've already approved on this yard. One sign at a time — decline this one, or ask them for different dates.",
      };
    }
    return { error: error.message };
  }

  /*
   * Only the two decisions the advertiser is waiting on get an email. Moving a
   * placement to active or completed is the homeowner's own bookkeeping, and
   * mailing about it would train people to ignore us.
   */
  if (next === "approved" || next === "declined") {
    const result = await notifyRequesterOfDecision(id, next, await getSiteOrigin());
    if (!result.sent && result.reason === "failed") {
      console.error("[notify] decision email failed:", result.detail);
    }
  }

  revalidatePath("/inbox");
  return {};
}
