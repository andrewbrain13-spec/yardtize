import { strict as assert } from "node:assert";
import { settle, depositDue, DEPOSIT_SETTLING_DAYS } from "./settlement";

let passed = 0;
let failed = 0;

function ok(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

const base = {
  periodStart: "2026-08-01",
  periodEnd: "2026-09-01",
  scheduledCents: 230000,
  installedOn: "2026-08-01",
  removedOn: null as string | null,
  asOf: "2026-09-01",
};

console.log("\nsettlement — a full period");

ok("pays exactly the scheduled amount", () => {
  const s = settle(base);
  assert.equal(s.status, "due");
  if (s.status === "due") assert.equal(s.cents, 230000);
});

ok("counts every day of the period", () => {
  const s = settle(base);
  if (s.status === "due") {
    assert.equal(s.daysStood, 31);
    assert.equal(s.daysInPeriod, 31);
  }
});

console.log("\nsettlement — nothing settles early");

ok("a period still running is not due", () => {
  const s = settle({ ...base, asOf: "2026-08-20" });
  assert.equal(s.status, "not due");
});

ok("not even on its last day", () => {
  const s = settle({ ...base, asOf: "2026-08-31" });
  assert.equal(s.status, "not due");
});

ok("due the day the period closes", () => {
  const s = settle({ ...base, asOf: "2026-09-01" });
  assert.equal(s.status, "due");
});

console.log("\nsettlement — a sign that came down early");

ok("pays only the days it stood", () => {
  // Up 1 Aug, down 11 Aug: 10 days of 31.
  const s = settle({ ...base, removedOn: "2026-08-11" });
  assert.equal(s.status, "due");
  if (s.status === "due") {
    assert.equal(s.daysStood, 10);
    assert.equal(s.cents, Math.round((230000 * 10) / 31));
  }
});

ok("and that is less than the whole period", () => {
  const s = settle({ ...base, removedOn: "2026-08-11" });
  if (s.status === "due") assert.ok(s.cents < 230000);
});

ok("a sign down before the period starts earns nothing", () => {
  const s = settle({ ...base, removedOn: "2026-07-20" });
  assert.equal(s.status, "void");
});

ok("and says so in words an operator can read", () => {
  const s = settle({ ...base, removedOn: "2026-07-20" });
  if (s.status === "void") assert.ok(s.reason.length > 10);
});

console.log("\nsettlement — a sign that went up late");

ok("earns from the day it went up, not the day it was booked", () => {
  // Booked from 1 Aug, actually installed 16 Aug: 16 days of 31.
  const s = settle({ ...base, installedOn: "2026-08-16" });
  assert.equal(s.status, "due");
  if (s.status === "due") assert.equal(s.daysStood, 16);
});

ok("a sign installed after the period earns nothing for it", () => {
  const s = settle({ ...base, installedOn: "2026-09-15" });
  assert.equal(s.status, "void");
});

ok("a sign never installed earns nothing", () => {
  const s = settle({ ...base, installedOn: null });
  assert.equal(s.status, "void");
  if (s.status === "void") assert.equal(s.daysStood, 0);
});

console.log("\nsettlement — the platform never overpays");

ok("a sign up before the period is still capped at the period", () => {
  const s = settle({ ...base, installedOn: "2026-06-01" });
  if (s.status === "due") {
    assert.equal(s.daysStood, 31);
    assert.equal(s.cents, 230000);
  }
});

ok("a sign removed after the period is capped at the period", () => {
  const s = settle({ ...base, removedOn: "2026-12-01" });
  if (s.status === "due") {
    assert.equal(s.daysStood, 31);
    assert.equal(s.cents, 230000);
  }
});

ok("rounding never pays out more than was scheduled", () => {
  // A scheduled amount that divides badly across the period.
  for (let day = 1; day <= 31; day++) {
    const removed = `2026-08-${String(day).padStart(2, "0")}`;
    const s = settle({ ...base, scheduledCents: 99999, removedOn: removed });
    if (s.status === "due") assert.ok(s.cents <= 99999, `day ${day} paid ${s.cents}`);
  }
});

ok("the prorated parts never exceed the whole across a split period", () => {
  // A sign down mid-period: the paid part plus the unpaid part is the whole.
  const s = settle({ ...base, removedOn: "2026-08-16" });
  if (s.status === "due") {
    const unpaid = 230000 - s.cents;
    assert.equal(s.cents + unpaid, 230000);
    assert.ok(unpaid > 0);
  }
});

console.log("\ndeposit — when it goes back");

ok("not while the sign is still up", () => {
  const v = depositDue({ removedOn: null, holdReason: null, asOf: "2026-09-01" });
  assert.equal(v.status, "wait");
});

ok("not during the settling period", () => {
  const v = depositDue({ removedOn: "2026-09-01", holdReason: null, asOf: "2026-09-03" });
  assert.equal(v.status, "wait");
});

ok("returned once the settling period is over", () => {
  const v = depositDue({
    removedOn: "2026-09-01",
    holdReason: null,
    asOf: `2026-09-0${1 + DEPOSIT_SETTLING_DAYS}`,
  });
  assert.equal(v.status, "refund");
});

ok("silence returns the money — a hold has to be written down", () => {
  const v = depositDue({ removedOn: "2026-09-01", holdReason: null, asOf: "2026-10-01" });
  assert.equal(v.status, "refund");
});

ok("an operator hold stops it, and carries its reason", () => {
  const v = depositDue({
    removedOn: "2026-09-01",
    holdReason: "Lawn damage reported by owner, photos on file",
    asOf: "2026-10-01",
  });
  assert.equal(v.status, "held");
  if (v.status === "held") assert.match(v.reason, /Lawn damage/);
});

ok("a hold applies even before the sign comes down", () => {
  const v = depositDue({ removedOn: null, holdReason: "Dispute open", asOf: "2026-09-01" });
  assert.equal(v.status, "held");
});

console.log(`\n${failed ? `${failed} failed, ` : "all "}${passed} passed\n`);
process.exit(failed ? 1 : 0);
