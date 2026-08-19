"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  if (error) return { error: error.message };

  revalidatePath("/inbox");
  return {};
}
