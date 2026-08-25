import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { planBilling } from "@/lib/billing";
import { daysBetween, today, parseDay } from "@/lib/scheduling";
import type { Listing, PlacementRequest } from "@/lib/supabase/types";

/**
 * What a homeowner has earned and what is coming.
 *
 * Derived from the placements themselves rather than from the payouts table,
 * because no money has moved yet — Stripe is not wired. Once it is, the same
 * shape gets filled from real transfers and the arithmetic here becomes the
 * projection it is compared against.
 *
 * Earned means accrued: a placement pays for the days the sign has actually
 * stood, so a three-month booking a week old has earned a week. Anything else
 * would tell a homeowner they are owed money they have not yet earned, which
 * is a worse surprise than the reverse.
 */

export type EarningLine = {
  requestId: string;
  yard: string;
  advertiser: string;
  startsOn: string;
  endsOn: string;
  status: PlacementRequest["status"];
  monthlyRateCents: number;
  /** Accrued so far, by days stood. */
  earnedCents: number;
  /** The whole term, if it runs to the end. */
  termTotalCents: number;
  daysElapsed: number;
  daysTotal: number;
  /** The sign is out of the ground: nothing further will accrue. */
  finished: boolean;
};

export type Earnings = {
  lines: EarningLine[];
  earnedToDateCents: number;
  /** Still to accrue on placements already agreed. */
  bookedAheadCents: number;
  /** What a full month across every live placement comes to. */
  monthlyRunRateCents: number;
};

export async function earningsFor(ownerId: string): Promise<Earnings | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: listingRows } = await admin
    .from("listings")
    .select("*")
    .eq("owner_id", ownerId);
  const listings = (listingRows ?? []) as Listing[];
  if (listings.length === 0) {
    return { lines: [], earnedToDateCents: 0, bookedAheadCents: 0, monthlyRunRateCents: 0 };
  }

  const byId = new Map(listings.map((l) => [l.id, l]));

  const { data: requestRows } = await admin
    .from("requests")
    .select("*")
    .in("listing_id", [...byId.keys()])
    // Only what a homeowner has actually agreed to. A pending request is not
    // income, and showing it as such would be the platform talking somebody
    // into counting on money that may never arrive.
    .in("status", ["approved", "active", "completed"])
    .order("starts_on", { ascending: false });

  const now = today();
  const lines: EarningLine[] = [];

  for (const request of (requestRows ?? []) as PlacementRequest[]) {
    const listing = byId.get(request.listing_id);
    if (!listing) continue;

    const plan = planBilling({
      monthlyRateDollars: listing.monthly_rate ?? 0,
      startsOn: request.starts_on,
      endsOn: request.ends_on,
      install: request.install,
    });

    const daysTotal = Math.max(1, daysBetween(request.starts_on, request.ends_on));

    /*
     * A removed sign stops earning on the day it came out of the ground, not
     * on the day the term would have ended — that is what the agreement's
     * proration clause says, and the earnings screen should not quietly
     * disagree with the document.
     */
    const effectiveEnd = request.removed_at ? request.removed_at.slice(0, 10) : now;
    const elapsed =
      parseDay(effectiveEnd) < parseDay(request.starts_on)
        ? 0
        : Math.min(daysBetween(request.starts_on, effectiveEnd), daysTotal);

    lines.push({
      requestId: request.id,
      yard: listing.headline ?? `${listing.city} yard`,
      advertiser: request.advertiser_name,
      startsOn: request.starts_on,
      endsOn: request.ends_on,
      status: request.status,
      monthlyRateCents: (listing.monthly_rate ?? 0) * 100,
      earnedCents: Math.round((plan.ownerTotalCents * elapsed) / daysTotal),
      termTotalCents: plan.ownerTotalCents,
      daysElapsed: elapsed,
      daysTotal,
      finished: Boolean(request.removed_at) || request.status === "completed",
    });
  }

  const earnedToDateCents = lines.reduce((sum, l) => sum + l.earnedCents, 0);
  /*
   * Only placements that can still accrue. A sign that has come down — at term
   * end or early through a takedown — will never earn the rest of its term,
   * and counting it here would tell a homeowner money is coming that isn't.
   * That is the direction of error worth being careful about.
   */
  const bookedAheadCents = lines
    .filter((l) => !l.finished)
    .reduce((sum, l) => sum + Math.max(0, l.termTotalCents - l.earnedCents), 0);
  const monthlyRunRateCents = lines
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + l.monthlyRateCents, 0);

  return { lines, earnedToDateCents, bookedAheadCents, monthlyRunRateCents };
}
