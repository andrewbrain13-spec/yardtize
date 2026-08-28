/**
 * How much of a period's payout the homeowner actually earned.
 *
 * Deliberately free of Stripe and the database so it can be tested directly —
 * this is the arithmetic that decides what somebody is paid, and it should be
 * possible to check it without a network.
 *
 * The rule comes from the agreement, not from convenience: a placement pays
 * for the days the sign stands. Billing is monthly in advance, so the
 * advertiser's money arrives before the month is served; the homeowner's share
 * of it is settled after, for the days actually served. That ordering is the
 * whole reason a sign coming down on day three does not leave the platform
 * chasing money it has already paid out.
 */

import { daysBetween, parseDay } from "@/lib/scheduling";

export type SettlementInput = {
  /** The billing period this payout covers, half-open: [start, end). */
  periodStart: string;
  periodEnd: string;
  /** The full amount owed if the sign stood the whole period. */
  scheduledCents: number;
  /** When the sign actually went up. Null means it never did. */
  installedOn: string | null;
  /** When it came out of the ground, if it has. */
  removedOn: string | null;
  /** Today, so a caller can ask about a period that has not finished. */
  asOf: string;
};

export type Settlement =
  | { status: "not due"; reason: string }
  | { status: "void"; reason: string; daysStood: 0; daysInPeriod: number }
  | { status: "due"; cents: number; daysStood: number; daysInPeriod: number };

/** The later of two ISO days. */
const laterOf = (a: string, b: string): string => (parseDay(a) >= parseDay(b) ? a : b);
/** The earlier of two ISO days. */
const earlierOf = (a: string, b: string): string => (parseDay(a) <= parseDay(b) ? a : b);

export function settle(input: SettlementInput): Settlement {
  const { periodStart, periodEnd, scheduledCents, installedOn, removedOn, asOf } = input;

  const daysInPeriod = Math.max(1, daysBetween(periodStart, periodEnd));

  /*
   * Nothing settles until the period is over. Paying mid-period would mean
   * paying for days not yet stood, and then asking for some of it back if the
   * sign comes down — which is exactly the situation this ordering avoids.
   */
  if (parseDay(asOf) < parseDay(periodEnd)) {
    return { status: "not due", reason: `period runs to ${periodEnd}` };
  }

  if (!installedOn) {
    return {
      status: "void",
      reason: "the sign was never recorded as installed",
      daysStood: 0,
      daysInPeriod,
    };
  }

  /*
   * The overlap between the period and the time the sign was actually up.
   * A sign installed late earns from the day it went up; one removed early
   * earns to the day it came down. Both ends are clamped to the period, so a
   * placement spanning several periods contributes only its own days to each.
   */
  const standFrom = laterOf(periodStart, installedOn);
  const standTo = earlierOf(periodEnd, removedOn ?? periodEnd);

  const daysStood = parseDay(standTo) <= parseDay(standFrom)
    ? 0
    : daysBetween(standFrom, standTo);

  if (daysStood === 0) {
    return {
      status: "void",
      reason: removedOn
        ? `the sign was down for the whole of ${periodStart} to ${periodEnd}`
        : `the sign went up after ${periodEnd}`,
      daysStood: 0,
      daysInPeriod,
    };
  }

  /*
   * Round rather than truncate, and never pay more than was scheduled. The
   * clamp matters at the boundary: a full period should settle at exactly the
   * scheduled amount, not a cent over from rounding.
   */
  const cents = Math.min(
    scheduledCents,
    Math.round((scheduledCents * daysStood) / daysInPeriod),
  );

  return { status: "due", cents, daysStood, daysInPeriod };
}

/**
 * How long after the sign comes down the deposit is returned.
 *
 * A settling period, not a holding fee: it exists so a homeowner who finds
 * damage has a few days to say so before the money goes back. Seven days is
 * long enough to walk out and look at the lawn, short enough that it does not
 * read as the platform sitting on somebody's $500.
 */
export const DEPOSIT_SETTLING_DAYS = 7;

export type DepositVerdict =
  | { status: "refund" }
  | { status: "wait"; reason: string }
  | { status: "held"; reason: string };

export function depositDue(input: {
  removedOn: string | null;
  holdReason: string | null;
  asOf: string;
}): DepositVerdict {
  if (input.holdReason) return { status: "held", reason: input.holdReason };
  if (!input.removedOn) return { status: "wait", reason: "the sign is still up" };

  const elapsed = daysBetween(input.removedOn, input.asOf);
  if (elapsed < DEPOSIT_SETTLING_DAYS) {
    return {
      status: "wait",
      reason: `${DEPOSIT_SETTLING_DAYS - elapsed} more day(s) to raise damage`,
    };
  }
  return { status: "refund" };
}
