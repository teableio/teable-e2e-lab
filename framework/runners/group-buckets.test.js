import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bucketProblems,
  bucketRows,
  bucketTitles,
  localDayOf,
} from "./group-buckets.ts";

const SHANGHAI = "Asia/Shanghai";

// 2025-11-30 and 2025-12-01, local midnight in Asia/Shanghai.
const VALID = [
  {
    localDay: "2025-11-30",
    instant: "2025-11-29T16:00:00.000Z",
    localHours: [0, 9, 23],
  },
  {
    localDay: "2025-12-01",
    instant: "2025-11-30T16:00:00.000Z",
    localHours: [0, 9, 23],
  },
];

test("a well-formed bucket list has no problems", () => {
  assert.deepEqual(bucketProblems(VALID, SHANGHAI), []);
});

// Property 2: at least one row away from local midnight. This is what the
// case's first version got wrong: a midnight row is excluded correctly even
// by the broken filter - the mis-aimed instant still formats to that row's own
// local day - so the whole matrix came back green and proved nothing.
test("a bucket holding only local midnight rows is rejected", () => {
  const problems = bucketProblems(
    [VALID[0], { ...VALID[1], localHours: [0, 0] }],
    SHANGHAI,
  );
  assert.ok(
    problems.some((problem) => problem.includes("only local midnight")),
    problems.join("; "),
  );
});

test("a bucket with a single row is rejected", () => {
  const problems = bucketProblems(
    [VALID[0], { ...VALID[1], localHours: [9] }],
    SHANGHAI,
  );
  assert.ok(
    problems.some((problem) => problem.includes("one stray row")),
    problems.join("; "),
  );
});

// Property 1: bucket keys are local midnight. An instant in the middle of the
// day is not a day-bucket key, and the fixture check against the product's
// group headers would fail for a reason unrelated to the bug.
test("an instant that is not local midnight is rejected", () => {
  const problems = bucketProblems(
    [VALID[0], { ...VALID[1], instant: "2025-11-30T18:30:00.000Z" }],
    SHANGHAI,
  );
  assert.ok(
    problems.some((problem) => problem.includes("not local midnight")),
    problems.join("; "),
  );
});

// Property 2: consecutive local days. This is what puts the mis-aimed
// exclusion (the day BEFORE the collapsed group) onto a bucket that actually
// holds rows, which is the only way the "rows wrongly disappeared" direction
// is observable.
test("a gap between buckets is rejected", () => {
  const problems = bucketProblems(
    [
      {
        localDay: "2025-11-30",
        instant: "2025-11-29T16:00:00.000Z",
        localHours: [0, 9, 23],
      },
      {
        localDay: "2025-12-02",
        instant: "2025-12-01T16:00:00.000Z",
        localHours: [0, 9, 23],
      },
    ],
    SHANGHAI,
  );
  assert.ok(
    problems.some((problem) => problem.includes("empty day")),
    problems.join("; "),
  );
});

test("buckets out of order are rejected", () => {
  const problems = bucketProblems([VALID[1], VALID[0]], SHANGHAI);
  assert.ok(
    problems.some((problem) => problem.includes("is not after")),
    problems.join("; "),
  );
});

// The label is what every line of evidence prints; if it disagreed with the
// instant, a report would name the wrong day.
test("a label that disagrees with its instant is rejected", () => {
  const problems = bucketProblems(
    [VALID[0], { ...VALID[1], localDay: "2025-12-09" }],
    SHANGHAI,
  );
  assert.ok(
    problems.some((problem) => problem.includes("falls on")),
    problems.join("; "),
  );
});

test("a single bucket cannot show both directions of the failure", () => {
  const problems = bucketProblems([VALID[0]], SHANGHAI);
  assert.ok(
    problems.some((problem) => problem.includes("at least 2")),
    problems.join("; "),
  );
});

// Consecutiveness is decided one millisecond before local midnight, not by
// subtracting 24 hours: America/New_York leaves DST on 2025-11-02, so local
// midnight of 11-03 is 25 hours after local midnight of 11-02. A day-length
// assumption would call these two buckets non-consecutive.
test("consecutive days across a DST transition are accepted", () => {
  const buckets = [
    {
      localDay: "2025-11-02",
      instant: "2025-11-02T04:00:00.000Z",
      localHours: [0, 9, 23],
    },
    {
      localDay: "2025-11-03",
      instant: "2025-11-03T05:00:00.000Z",
      localHours: [0, 9, 23],
    },
  ];
  assert.equal(
    localDayOf(buckets[0].instant, "America/New_York"),
    "2025-11-02",
  );
  assert.equal(
    localDayOf(buckets[1].instant, "America/New_York"),
    "2025-11-03",
  );
  assert.equal(
    new Date(buckets[1].instant).getTime() -
      new Date(buckets[0].instant).getTime(),
    25 * 60 * 60 * 1000,
  );
  assert.deepEqual(bucketProblems(buckets, "America/New_York"), []);
});

// Titles carry the day and the local hour, so evidence says which bucket a row
// belongs to - and where in the day it sits - without a lookup table.
test("row titles name the bucket and hour they belong to", () => {
  assert.deepEqual(bucketTitles(VALID[0]), [
    "2025-11-30#00h",
    "2025-11-30#09h",
    "2025-11-30#23h",
  ]);
});

// Rows are placed by adding the hour to the bucket key, so an off-by-one in
// the offset would move a row into the neighbouring bucket silently.
test("rows sit at their local hour within the bucket", () => {
  assert.deepEqual(bucketRows(VALID[0]), [
    { title: "2025-11-30#00h", instant: "2025-11-29T16:00:00.000Z" },
    { title: "2025-11-30#09h", instant: "2025-11-30T01:00:00.000Z" },
    { title: "2025-11-30#23h", instant: "2025-11-30T15:00:00.000Z" },
  ]);
});
