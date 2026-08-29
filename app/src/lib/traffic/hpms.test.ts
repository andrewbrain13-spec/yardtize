import { strict as assert } from "node:assert";
import { describeRoad } from "./hpms";

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

console.log("\nnaming a road from federal data");

ok("a real name is used as it stands", () => {
  assert.equal(describeRoad({ ROUTE_NAME: "SOUTHWEST TRFY", F_SYSTEM: 3 }), "SOUTHWEST TRFY");
});

ok("surrounding whitespace is trimmed", () => {
  assert.equal(describeRoad({ ROUTE_NAME: "  Main St  " }), "Main St");
});

ok("a signed route number is offered as a route", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 70, F_SYSTEM: 1 }), "Route 70");
});

ok("three digits is still a plausible route", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 291, F_SYSTEM: 3 }), "Route 291");
});

console.log("\nwhat the data calls a name but isn't one");

ok("a bare number is not a road name — Tennessee's 3274", () => {
  // Was rendering a listing on a road called "3274".
  assert.equal(describeRoad({ ROUTE_NAME: "3274", F_SYSTEM: 4 }), "Minor arterial");
});

ok("an internal identifier is not a route — Texas's 258521", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 258521, F_SYSTEM: 3 }), "Principal arterial");
});

ok("nor is a four-digit one", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 2810, F_SYSTEM: 4 }), "Minor arterial");
});

ok("an empty name falls through", () => {
  assert.equal(describeRoad({ ROUTE_NAME: "   ", F_SYSTEM: 5 }), "Major collector");
});

ok("a zero route number is not a route", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 0, F_SYSTEM: 5 }), "Major collector");
});

ok("a decimal is not a signed route", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 12.5, F_SYSTEM: 4 }), "Minor arterial");
});

console.log("\nwhen nothing is known");

ok("no name, no number, no class — still says something true", () => {
  assert.equal(describeRoad({}), "Classified road");
});

ok("an unrecognised functional class does not print a blank", () => {
  assert.equal(describeRoad({ F_SYSTEM: 99 }), "Classified road");
});

ok("a name wins over a number", () => {
  assert.equal(describeRoad({ ROUTE_NAME: "Broadway", ROUTE_NUMBER: 70 }), "Broadway");
});

ok("a number wins over a functional class", () => {
  assert.equal(describeRoad({ ROUTE_NUMBER: 35, F_SYSTEM: 1 }), "Route 35");
});

console.log(`\n${failed ? `${failed} failed, ` : "all "}${passed} passed\n`);
process.exit(failed ? 1 : 0);
