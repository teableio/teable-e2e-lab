import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diffRow,
  expectedCell,
  expectedRow,
  updatePayloadRow,
} from "./record-values.ts";

const FIELDS = [
  { name: "Title", type: "singleLineText" },
  { name: "Description", type: "longText" },
  { name: "Score", type: "number" },
  { name: "Active", type: "checkbox" },
];

// The load-bearing property everything in record-flow rests on: a row that was
// never updated must be visibly wrong on EVERY cell. If any (field, row) pair
// kept the same value across the revision bump, a partial update could hide
// there.
test("no cell survives a revision bump", () => {
  for (let row = 1; row <= 500; row += 1) {
    for (const field of FIELDS) {
      const before = expectedCell(field, row, 1);
      const after = expectedCell(field, row, 2);
      assert.notDeepEqual(
        before,
        after,
        `${field.type} row ${row}: revision 1 and 2 coincide (${JSON.stringify(before)})`,
      );
    }
  }
});

test("expected rows omit empty cells, payload rows write null for them", () => {
  // Row 1 is odd: checkbox unchecked at revision 1, checked at revision 2.
  const expectedSeed = expectedRow(FIELDS, 1, 1);
  assert.equal("Active" in expectedSeed, false);
  const payloadSeed = updatePayloadRow(FIELDS, 1, 1);
  assert.equal(payloadSeed.Active, null);

  const expectedUpdated = expectedRow(FIELDS, 1, 2);
  assert.equal(expectedUpdated.Active, true);
});

test("diffRow catches values, missing keys, and keys that should be absent", () => {
  const expected = expectedRow(FIELDS, 2, 2);
  // Row 2 is even: checkbox checked at revision 1, must be ABSENT at rev 2.
  assert.equal("Active" in expected, false);

  const correct = { ...expected };
  assert.deepEqual(diffRow(FIELDS, 2, correct, expected), []);

  const wrongValue = { ...expected, Score: -1 };
  assert.equal(diffRow(FIELDS, 2, wrongValue, expected).length, 1);

  const staleCheckbox = { ...expected, Active: true };
  assert.equal(diffRow(FIELDS, 2, staleCheckbox, expected).length, 1);

  const missingKey = { ...expected };
  delete missingKey.Title;
  assert.equal(diffRow(FIELDS, 2, missingKey, expected).length, 1);
});
