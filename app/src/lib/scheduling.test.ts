/**
 * Checks on the date logic — the one part of this app where an off-by-one is
 * both easy to write and expensive: it means a sign standing a day past what a
 * city allows, or two advertisers sold the same week.
 *
 * Run with `npm test`.
 */
import {
  addDays,
  addMonths,
  checkAvailability,
  daysBetween,
  describeTerm,
  earliestStart,
  termFor,
} from "./scheduling";
import type { JurisdictionRules } from "./supabase/types";

// Overland Park's rhythm: 60 days on, then the yard sits empty for 30.
const OVERLAND_PARK = { display_period_days: 60, gap_days: 30 } as JurisdictionRules;

const checks: Array<[string, boolean, unknown, unknown]> = [];
const eq = (name: string, actual: unknown, expected: unknown) =>
  checks.push([name, JSON.stringify(actual) === JSON.stringify(expected), actual, expected]);

// Month arithmetic clamps to a short month rather than spilling into the next.
eq("31 Jan + 1 month lands on 28 Feb", addMonths("2026-01-31", 1), "2026-02-28");
eq("15 Mar + 3 months", addMonths("2026-03-15", 3), "2026-06-15");
eq("1 Dec + 12 months", addMonths("2026-12-01", 12), "2027-12-01");

// The election window is fixed, whatever start date was picked.
eq("election window ignores the chosen start", termFor({ startsOn: "2026-05-01", isElectionWindow: true }), {
  startsOn: "2026-09-19",
  endsOn: "2026-11-05",
});
eq("election window is 47 days", daysBetween("2026-09-19", "2026-11-05"), 47);

// Half-open ranges: ending and starting on the same day is back to back.
const booked = [{ startsOn: "2027-03-01", endsOn: "2027-04-01" }];
eq("an overlapping term is refused", checkAvailability({ startsOn: "2027-03-15", endsOn: "2027-04-15" }, booked).ok, false);
eq("a back-to-back term is allowed", checkAvailability({ startsOn: "2027-04-01", endsOn: "2027-05-01" }, booked).ok, true);

// City limits.
eq("61 days is over Overland Park's cap",
  checkAvailability({ startsOn: "2027-06-01", endsOn: addDays("2027-06-01", 61) }, [], OVERLAND_PARK).ok, false);
eq("60 days is exactly allowed",
  checkAvailability({ startsOn: "2027-06-01", endsOn: addDays("2027-06-01", 60) }, [], OVERLAND_PARK).ok, true);
eq("the 30-day gap is enforced",
  checkAvailability({ startsOn: "2027-04-10", endsOn: "2027-05-01" }, booked, OVERLAND_PARK).ok, false);
eq("and satisfied once it has passed",
  checkAvailability({ startsOn: "2027-05-01", endsOn: "2027-05-20" }, booked, OVERLAND_PARK).ok, true);
eq("earliest start accounts for the gap", earliestStart(booked, OVERLAND_PARK), "2027-05-01");

eq("a term reads as a human would write it",
  describeTerm({ startsOn: "2026-10-01", endsOn: "2027-01-01" }), "Oct 1, 2026 – Jan 1, 2027");

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
