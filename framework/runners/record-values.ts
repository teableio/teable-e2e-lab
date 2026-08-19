import type { RecordFlowFieldSpec } from "../types";

// Deterministic cell values as a pure function of (field, row, revision),
// ported from teable-api-lab's record cases. Revision 1 is what the seed
// writes; revision 2 is what the mutation under test writes.
//
// The load-bearing property: for every row and every field type, the revision 1
// value differs from the revision 2 value. Without it, "this row was never
// updated" is invisible on any cell where the two revisions coincide —
// checkbox is the obvious trap, which is why revision 2 inverts its parity.
// The property is guarded by record-values.test.js, not by trusting this file.
export type CellValue = string | number | boolean | undefined;

export const expectedCell = (
  field: RecordFlowFieldSpec,
  rowNumber: number,
  revision: 1 | 2,
): CellValue => {
  switch (field.type) {
    case "singleLineText":
      return revision === 1
        ? `${field.name}-${rowNumber}`
        : `${field.name}-${rowNumber}-r2`;
    case "longText":
      return revision === 1
        ? `${field.name} row ${rowNumber}\nline two`
        : `${field.name} row ${rowNumber}-r2\nline two`;
    case "number":
      return rowNumber * revision;
    case "checkbox": {
      const checkedOnEven = revision === 1;
      const isEven = rowNumber % 2 === 0;
      return isEven === checkedOnEven ? true : undefined;
    }
  }
};

// The row as the read path reports it: an empty checkbox is a MISSING KEY, not
// false and not null. Expected rows therefore omit empty cells entirely, and
// verification must also reject keys that appear in a scanned row but not in
// the expected one — comparing only expected keys would miss the whole class
// of "the cell that should have been cleared was not".
export const expectedRow = (
  fields: RecordFlowFieldSpec[],
  rowNumber: number,
  revision: 1 | 2,
): Record<string, CellValue> => {
  const row: Record<string, CellValue> = {};
  for (const field of fields) {
    const value = expectedCell(field, rowNumber, revision);
    if (value !== undefined) {
      row[field.name] = value;
    }
  }
  return row;
};

// The row as the write path must send it: every field written explicitly, with
// null naming the cells to clear. Omitting a field in a PATCH body keeps its
// old value, so the request shape and the expected shape are asymmetric on
// purpose (write null, read absent-key).
export const updatePayloadRow = (
  fields: RecordFlowFieldSpec[],
  rowNumber: number,
  revision: 1 | 2,
): Record<string, CellValue | null> => {
  const row: Record<string, CellValue | null> = {};
  for (const field of fields) {
    const value = expectedCell(field, rowNumber, revision);
    row[field.name] = value === undefined ? null : value;
  }
  return row;
};

// One scanned row compared against its expectation, both directions. Returns
// human-readable mismatch descriptions; empty means the row is exactly right.
export const diffRow = (
  fields: RecordFlowFieldSpec[],
  rowNumber: number,
  actual: Record<string, unknown>,
  expected: Record<string, CellValue>,
): string[] => {
  const mismatches: string[] = [];
  for (const field of fields) {
    const expectedValue = expected[field.name];
    const actualValue = actual[field.name];
    if (expectedValue === undefined) {
      if (actualValue !== undefined) {
        mismatches.push(
          `row ${rowNumber} ${field.name}: expected the key to be absent, got ${JSON.stringify(actualValue)}`,
        );
      }
      continue;
    }
    if (actualValue !== expectedValue) {
      mismatches.push(
        `row ${rowNumber} ${field.name}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
      );
    }
  }
  return mismatches;
};

// Whether a scanned row is still byte-for-byte the seed revision. Answers the
// question a truncated mismatch list cannot: "3 rows missed" and "all rows
// missed" look identical in a first-10 sample; only this count separates them.
export const rowMatchesRevision = (
  fields: RecordFlowFieldSpec[],
  rowNumber: number,
  actual: Record<string, unknown>,
  revision: 1 | 2,
): boolean =>
  diffRow(fields, rowNumber, actual, expectedRow(fields, rowNumber, revision))
    .length === 0;
