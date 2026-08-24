/**
 * What an advertiser actually got for their money.
 *
 * Every figure here is derived from the same two things the price was derived
 * from — the state's traffic count and the days the sign stood — so a report
 * can never claim more than the pricing model assumed. That symmetry is the
 * point: if the report and the invoice disagreed, one of them would be selling
 * something.
 *
 * These are modelled impressions, not measured ones. Nobody counts eyes on a
 * yard sign; the out-of-home industry prices on exactly this basis, and saying
 * so plainly is worth more than a number that pretends to precision.
 */

import { VISIBILITY_FACTOR } from "@/lib/rate";
import { daysBetween, today, parseDay } from "@/lib/scheduling";

export type Delivery = {
  /** Days the sign has actually stood, capped at the term. */
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  /** 0–1, for a progress bar. */
  progress: number;
  /** Vehicle passes credited so far, and across the whole term. */
  impressionsToDate: number;
  impressionsAtTermEnd: number;
  /** What a thousand credited impressions costs across the term. */
  effectiveCpmCents: number | null;
  status: "not started" | "running" | "finished";
};

export function computeDelivery(input: {
  aadt: number | null;
  startsOn: string;
  endsOn: string;
  /** What the advertiser has committed across the term, in cents. */
  paidCents: number;
  /** Defaults to today; injectable so the arithmetic is testable. */
  asOf?: string;
}): Delivery {
  const asOf = input.asOf ?? today();
  const daysTotal = Math.max(1, daysBetween(input.startsOn, input.endsOn));

  const elapsedRaw =
    parseDay(asOf) < parseDay(input.startsOn) ? 0 : daysBetween(input.startsOn, asOf);
  const daysElapsed = Math.min(Math.max(elapsedRaw, 0), daysTotal);
  const daysRemaining = daysTotal - daysElapsed;

  const perDay = (input.aadt ?? 0) * VISIBILITY_FACTOR;
  const impressionsToDate = Math.round(perDay * daysElapsed);
  const impressionsAtTermEnd = Math.round(perDay * daysTotal);

  return {
    daysElapsed,
    daysTotal,
    daysRemaining,
    progress: daysElapsed / daysTotal,
    impressionsToDate,
    impressionsAtTermEnd,
    /*
     * Cost per thousand, over the whole term on both sides of the division.
     *
     * The first version put the term's full cost over the impressions
     * delivered so far, which reported $24.77 three weeks into a three-month
     * placement — about four times the real rate, and falling every day. An
     * advertiser reading that would conclude they were being fleeced, and the
     * number would keep changing under them for no reason they could see.
     *
     * Billing is monthly in advance, so cost and delivery accrue at
     * different rates day to day; the term basis is the one both sides agreed
     * on and the only one that holds still.
     */
    effectiveCpmCents:
      impressionsAtTermEnd > 0
        ? Math.round((input.paidCents / impressionsAtTermEnd) * 1000)
        : null,
    status: daysElapsed === 0 ? "not started" : daysRemaining === 0 ? "finished" : "running",
  };
}
