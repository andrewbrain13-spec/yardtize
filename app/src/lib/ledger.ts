import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { planBilling } from "@/lib/billing";
import type { Listing, PlacementRequest } from "@/lib/supabase/types";

/**
 * Turns an approved placement into rows somebody can be billed from.
 *
 * Until now the billing plan was recomputed on every screen that needed a
 * figure. That is fine while nothing has been charged, and wrong the moment
 * anything has: a listing's rate can change, and a payment already taken has
 * to keep the amount it was taken at. Writing the schedule down at approval
 * freezes it, the same way the lease freezes its terms.
 *
 * Idempotent. Confirming a lease twice must not bill anybody twice, and the
 * check is a query rather than a hope.
 */
export async function writeSchedule(requestId: string): Promise<{ charges: number } | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { count } = await admin
    .from("charges")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);
  if ((count ?? 0) > 0) return { charges: 0 };

  const { data: requestRow } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!requestRow) return null;
  const request = requestRow as PlacementRequest;

  const { data: listingRow } = await admin
    .from("listings")
    .select("*")
    .eq("id", request.listing_id)
    .maybeSingle();
  if (!listingRow) return null;
  const listing = listingRow as Listing;

  const plan = planBilling({
    monthlyRateDollars: listing.monthly_rate ?? 0,
    startsOn: request.starts_on,
    endsOn: request.ends_on,
    install: request.install,
  });

  const { data: inserted, error } = await admin
    .from("charges")
    .insert(
      plan.charges.map((charge) => ({
        request_id: requestId,
        kind: charge.kind,
        amount_cents: charge.amountCents,
        fee_cents: charge.feeCents,
        owner_cents: charge.ownerCents,
        due_on: charge.dueOn,
        period_start: charge.periodStart,
        period_end: charge.periodEnd,
        status: "scheduled" as const,
      })),
    )
    .select("id, owner_cents, period_start, period_end");

  if (error || !inserted) return null;

  /*
   * A payout row per charge that owes the homeowner something. The deposit and
   * the install fee owe them nothing, so they get no payout — which is why
   * this filters rather than mirroring the charges one for one.
   */
  const owed = inserted.filter((c) => c.owner_cents > 0);
  if (owed.length > 0) {
    await admin.from("payouts").insert(
      owed.map((charge) => ({
        owner_id: listing.owner_id,
        request_id: requestId,
        charge_id: charge.id,
        amount_cents: charge.owner_cents,
        period_start: charge.period_start,
        period_end: charge.period_end,
        status: "scheduled" as const,
      })),
    );
  }

  return { charges: inserted.length };
}
