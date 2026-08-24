/**
 * Checks on the delivery figures. Run with `npm test`.
 *
 * These numbers go in front of an advertiser deciding whether to renew, so the
 * failure that matters is over-reporting — claiming impressions on days the
 * sign was not standing.
 */
import { computeDelivery } from "./delivery";
import { VISIBILITY_FACTOR } from "./rate";

const checks: Array<[string, boolean, unknown, unknown]> = [];
const eq = (name: string, actual: unknown, expected: unknown) =>
  checks.push([name, JSON.stringify(actual) === JSON.stringify(expected), actual, expected]);

const KARNES = { aadt: 44400, startsOn: "2026-10-01", endsOn: "2027-01-01", paidCents: 759000 };

// Nothing is claimed before the sign goes up.
const before = computeDelivery({ ...KARNES, asOf: "2026-09-15" });
const atEndCpm = () => computeDelivery({ ...KARNES, asOf: "2027-01-01" }).effectiveCpmCents;
eq("nothing delivered before the start", before.impressionsToDate, 0);
eq("but the rate is already quotable", before.effectiveCpmCents, atEndCpm());
eq("status reads as not started", before.status, "not started");

// Partway through, credited at the same visibility factor the price used.
const midway = computeDelivery({ ...KARNES, asOf: "2026-11-01" });
eq("31 days elapsed", midway.daysElapsed, 31);
eq("credited at the pricing model's own factor",
  midway.impressionsToDate, Math.round(44400 * VISIBILITY_FACTOR * 31));
eq("status reads as running", midway.status, "running");

// At the end, and never beyond it.
const atEnd = computeDelivery({ ...KARNES, asOf: "2027-01-01" });
eq("elapsed stops at the term", atEnd.daysElapsed, 92);
eq("full-term impressions", atEnd.impressionsToDate, atEnd.impressionsAtTermEnd);
eq("status reads as finished", atEnd.status, "finished");

const wayAfter = computeDelivery({ ...KARNES, asOf: "2027-06-01" });
eq("a report pulled months later claims no more",
  wayAfter.impressionsToDate, atEnd.impressionsAtTermEnd);
eq("and no negative days remaining", wayAfter.daysRemaining, 0);

// A yard with no published count reports nothing rather than guessing.
const noData = computeDelivery({ ...KARNES, aadt: null, asOf: "2026-11-01" });
eq("no traffic data means no impressions claimed", noData.impressionsToDate, 0);
eq("and still no CPM", noData.effectiveCpmCents, null);

/*
 * The CPM is the term's cost over the term's impressions — both sides of the
 * division covering the same period. A cost-to-date over delivery-to-date
 * would swing wildly early on, because billing is monthly in advance while
 * delivery accrues daily.
 */
const termImpressions = Math.round(44400 * VISIBILITY_FACTOR * 92);
eq("CPM is quoted on the term", midway.effectiveCpmCents,
  Math.round((759000 / termImpressions) * 1000));
eq("and does not move as the term runs", atEnd.effectiveCpmCents, midway.effectiveCpmCents);
eq("it lands where the pricing model puts it",
  Math.round((midway.effectiveCpmCents ?? 0) / 100), 6);

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
