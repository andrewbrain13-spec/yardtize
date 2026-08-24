/**
 * What an advertiser owes, when, and what the homeowner gets.
 *
 * Money is integer cents everywhere. Dollars-as-floats works right up until
 * 10% of $2,300 lands as 229.99999999999997 and a ledger stops balancing;
 * there is no reason to invite it.
 *
 * The model, stated plainly because everything else follows from it:
 *
 *   The homeowner receives their listed rate, in full.
 *   The advertiser pays that rate plus Yardtize's fee on top.
 *
 * So a $2,300 yard earns its owner $2,300 a month and costs the advertiser
 * $2,530. The alternative — skimming the fee out of the homeowner's rate —
 * would mean the number on a listing is not the number they are paid, which
 * is a thing homeowners notice and resent.
 *
 * Billing is monthly in advance, not the whole term upfront. A twelve-month
 * booking on the anchor corner would otherwise open with a $30,860 invoice.
 */

import { addMonths, daysBetween, describeDay } from "@/lib/scheduling";
import { SERVICE_FEE_RATE, SELF_INSTALL_DEPOSIT, PLATFORM_INSTALL_EACH_WAY } from "@/lib/booking";
import type { InstallChoice } from "@/lib/supabase/types";

export const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

/** Half-up, so a half-cent always rounds the same way rather than to even. */
const round = (n: number): number => Math.floor(n + 0.5);

export const formatCents = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** A month of placement is priced at a thirtieth of the monthly rate per day. */
const DAYS_PER_MONTH = 30;

export type ChargeKind = "placement" | "deposit" | "install";

export type PlannedCharge = {
  kind: ChargeKind;
  /** What the advertiser is billed, fee included. */
  amountCents: number;
  /** Yardtize's share of it. */
  feeCents: number;
  /** What the homeowner is owed from it. */
  ownerCents: number;
  /** The day it is charged. */
  dueOn: string;
  periodStart: string;
  periodEnd: string;
  label: string;
};

export type BillingPlan = {
  charges: PlannedCharge[];
  /** Everything the advertiser will pay across the term. */
  totalCents: number;
  /** The part they pay on approval. */
  dueNowCents: number;
  /** Everything the homeowner will receive. */
  ownerTotalCents: number;
  feeTotalCents: number;
  /** Held, then returned — never income. */
  refundableCents: number;
};

export type BillingInput = {
  monthlyRateDollars: number;
  startsOn: string;
  endsOn: string;
  install: InstallChoice;
};

/**
 * Splits a term into billing periods.
 *
 * Whole months where the term is whole months, which is the ordinary case. A
 * term that is not — the 47-day election window — bills as one period prorated
 * by days, rather than as "1.6 months", which is not a thing anyone can be
 * invoiced for.
 */
function periods(startsOn: string, endsOn: string): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  let cursor = startsOn;

  // Guard against a pathological term producing an unbounded loop.
  for (let i = 0; i < 60 && cursor < endsOn; i++) {
    const next = addMonths(cursor, 1);
    out.push({ start: cursor, end: next > endsOn ? endsOn : next });
    cursor = next;
  }

  return out.length ? out : [{ start: startsOn, end: endsOn }];
}

export function planBilling(input: BillingInput): BillingPlan {
  const rateCents = dollarsToCents(input.monthlyRateDollars);
  const charges: PlannedCharge[] = [];

  for (const [i, period] of periods(input.startsOn, input.endsOn).entries()) {
    const days = daysBetween(period.start, period.end);
    // A full month bills as a full month even when it is 28 or 31 days long;
    // only a genuinely partial period is prorated.
    const full = addMonths(period.start, 1) <= period.end;
    const ownerCents = full ? rateCents : round((rateCents * days) / DAYS_PER_MONTH);
    const feeCents = round(ownerCents * SERVICE_FEE_RATE);

    charges.push({
      kind: "placement",
      ownerCents,
      feeCents,
      amountCents: ownerCents + feeCents,
      dueOn: period.start,
      periodStart: period.start,
      periodEnd: period.end,
      label: full
        ? `Placement · ${describeDay(period.start)} – ${describeDay(period.end)}`
        : `Placement · ${describeDay(period.start)} – ${describeDay(period.end)} (${days} days)`,
    });

    void i;
  }

  if (input.install === "self") {
    charges.push({
      kind: "deposit",
      amountCents: dollarsToCents(SELF_INSTALL_DEPOSIT),
      feeCents: 0,
      ownerCents: 0,
      dueOn: input.startsOn,
      periodStart: input.startsOn,
      periodEnd: input.endsOn,
      label: "Refundable damage deposit",
    });
  } else {
    charges.push({
      kind: "install",
      amountCents: dollarsToCents(PLATFORM_INSTALL_EACH_WAY * 2),
      feeCents: dollarsToCents(PLATFORM_INSTALL_EACH_WAY * 2),
      ownerCents: 0,
      dueOn: input.startsOn,
      periodStart: input.startsOn,
      periodEnd: input.endsOn,
      label: "Install and removal by Yardtize",
    });
  }

  const sum = (pick: (c: PlannedCharge) => number) =>
    charges.reduce((total, c) => total + pick(c), 0);

  const firstDue = charges[0]?.dueOn;

  return {
    charges,
    totalCents: sum((c) => c.amountCents),
    dueNowCents: charges
      .filter((c) => c.dueOn === firstDue)
      .reduce((total, c) => total + c.amountCents, 0),
    ownerTotalCents: sum((c) => c.ownerCents),
    feeTotalCents: sum((c) => c.feeCents),
    refundableCents: sum((c) => (c.kind === "deposit" ? c.amountCents : 0)),
  };
}
