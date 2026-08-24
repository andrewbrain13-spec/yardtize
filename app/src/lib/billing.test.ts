/**
 * Checks on the money. Run with `npm test`.
 *
 * The invariant worth protecting: what the advertiser pays equals what the
 * homeowner receives plus Yardtize's fee plus anything refundable. If that
 * ever stops holding, somebody is short.
 */
import { planBilling, formatCents, dollarsToCents } from "./billing";

const checks: Array<[string, boolean, unknown, unknown]> = [];
const eq = (name: string, actual: unknown, expected: unknown) =>
  checks.push([name, JSON.stringify(actual) === JSON.stringify(expected), actual, expected]);

// --- the anchor corner, three months, advertiser installs -----------------
const karnes = planBilling({
  monthlyRateDollars: 2300,
  startsOn: "2026-10-01",
  endsOn: "2027-01-01",
  install: "self",
});

eq("three months bills three times, plus the deposit", karnes.charges.length, 4);
eq("the homeowner receives their full listed rate", karnes.ownerTotalCents, dollarsToCents(6900));
eq("the fee is 10% on top", karnes.feeTotalCents, dollarsToCents(690));
eq("the deposit is refundable, not income", karnes.refundableCents, dollarsToCents(500));
eq("total = owner + fee + deposit",
  karnes.totalCents,
  karnes.ownerTotalCents + karnes.feeTotalCents + karnes.refundableCents);
eq("only the first month and the deposit are due at approval",
  karnes.dueNowCents, dollarsToCents(2530 + 500));
eq("which reads as", formatCents(karnes.dueNowCents), "$3,030.00");

// A year does not arrive as one invoice.
const year = planBilling({
  monthlyRateDollars: 2300,
  startsOn: "2026-10-01",
  endsOn: "2027-10-01",
  install: "self",
});
eq("twelve months bills twelve times", year.charges.filter((c) => c.kind === "placement").length, 12);
eq("but only one month is due now", year.dueNowCents, dollarsToCents(2530 + 500));
eq("even though the term totals", formatCents(year.totalCents), "$30,860.00");

// --- the election window is 47 days, not a whole number of months ---------
const election = planBilling({
  monthlyRateDollars: 1000,
  startsOn: "2026-09-19",
  endsOn: "2026-11-05",
  install: "self",
});
const electionPlacement = election.charges.filter((c) => c.kind === "placement");
eq("it bills as one full month and a part", electionPlacement.length, 2);
eq("prorated at a thirtieth of the rate per day",
  electionPlacement[1].ownerCents, dollarsToCents(1000 * (17 / 30)));
eq("total owner take", electionPlacement.reduce((t, c) => t + c.ownerCents, 0),
  dollarsToCents(1000) + dollarsToCents(1000 * (17 / 30)));

// --- a short month is still a whole month --------------------------------
const february = planBilling({
  monthlyRateDollars: 300,
  startsOn: "2026-01-31",
  endsOn: "2026-02-28",
  install: "self",
});
eq("31 Jan to 28 Feb is one full month, not 28/30ths",
  february.charges.filter((c) => c.kind === "placement")[0].ownerCents, dollarsToCents(300));

// --- platform install is Yardtize's revenue, not the homeowner's ----------
const platform = planBilling({
  monthlyRateDollars: 500,
  startsOn: "2026-06-01",
  endsOn: "2026-07-01",
  install: "platform",
});
eq("install is charged once", platform.charges.filter((c) => c.kind === "install").length, 1);
eq("at 99 each way", platform.charges.find((c) => c.kind === "install")?.amountCents, dollarsToCents(198));
eq("and none of it is the homeowner's", platform.ownerTotalCents, dollarsToCents(500));
eq("nothing is refundable when Yardtize installs", platform.refundableCents, 0);
eq("total balances", platform.totalCents,
  platform.ownerTotalCents + platform.feeTotalCents + platform.refundableCents);

// --- no fractional cents anywhere ----------------------------------------
const odd = planBilling({
  monthlyRateDollars: 333,
  startsOn: "2026-03-01",
  endsOn: "2026-06-01",
  install: "self",
});
eq("every amount is a whole number of cents",
  odd.charges.every((c) => Number.isInteger(c.amountCents) && Number.isInteger(c.feeCents)), true);
eq("and the odd rate still balances", odd.totalCents,
  odd.ownerTotalCents + odd.feeTotalCents + odd.refundableCents);

let failed = 0;
for (const [name, ok, actual, expected] of checks) {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n          got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
  }
}
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
