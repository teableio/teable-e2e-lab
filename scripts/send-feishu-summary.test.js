import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparisonGrid,
  buildFeishuCard,
} from "./send-feishu-summary.mjs";

const comparison = ({ passed = true, rows, commits }) => ({
  commits,
  rows,
  failures: {
    missing: [],
    duplicates: [],
    unplanned: [],
    unknownVerdicts: [],
    regressions: [],
    errors: [],
  },
  notices: { unexpectedlyFixed: [] },
  passed,
});

const twoCommits = [
  { ref: "06719e10fd2e6e177ab4b2d9462fc42fda068cc3", short: "06719e10fd" },
  { ref: "develop", short: "afcc4d00e0" },
];

test("a raw sha column is headed by its short form, a named ref keeps its name", () => {
  const [header] = buildComparisonGrid(
    comparison({
      commits: twoCommits,
      rows: [
        {
          caseId: "a/b",
          issue: "T1",
          status: "fixed",
          cells: [
            { verdict: "regression", observed: "present" },
            { verdict: "pass", observed: "absent" },
          ],
          transitions: [],
        },
      ],
    }),
  );

  assert.match(header, /06719e10fd/);
  assert.match(header, /develop/);
  assert.doesNotMatch(header, /afcc4d00e0/);
});

// The property the whole grid rests on: every verdict glyph is two monospace
// cells wide, so a column padded by character count would drift one cell per
// row and the columns would stop lining up exactly when a run has more than
// one case. Comparing the byte offset of each column across every line is the
// only assertion that catches that.
test("every column starts at the same offset on every line", () => {
  const lines = buildComparisonGrid(
    comparison({
      passed: false,
      commits: twoCommits,
      rows: [
        {
          caseId: "base-share/save-into-existing-base-twice",
          issue: "T6840",
          status: "fixed",
          cells: [
            { verdict: "regression", observed: "present" },
            { verdict: "pass", observed: "absent" },
          ],
          transitions: [],
        },
        {
          caseId: "smoke/auth-user",
          issue: "sentinel/auth",
          status: "fixed",
          cells: [{ verdict: "error", observed: "error" }, { missing: true }],
          transitions: [],
        },
      ],
    }),
  );

  // The display offset at which each column's content starts, walking the line
  // and counting emoji as two cells.
  const columnStarts = (line) => {
    const starts = [];
    let width = 0;
    let inGap = true;
    for (const char of line) {
      if (char === " ") {
        inGap = true;
      } else {
        if (inGap) {
          starts.push(width);
        }
        inGap = false;
      }
      width += char.codePointAt(0) >= 0x2000 ? 2 : 1;
    }
    return starts;
  };

  const grids = lines.map(columnStarts);
  assert.equal(
    new Set(grids.map((starts) => starts.join(","))).size,
    1,
    lines.join("\n"),
  );
  assert.equal(grids[0].length, 3);
});

test("a missing result reads as ❓ rather than vanishing", () => {
  const lines = buildComparisonGrid(
    comparison({
      commits: twoCommits,
      rows: [
        {
          caseId: "a/b",
          issue: "T1",
          status: "open",
          cells: [{ verdict: "expected-fail" }, { missing: true }],
          transitions: [],
        },
      ],
    }),
  );

  assert.match(lines[1], /⬜/);
  assert.match(lines[1], /❓/);
});

test("the card carries the grid inside a fenced block and links the run", () => {
  const card = buildFeishuCard({
    comparison: comparison({
      commits: twoCommits,
      rows: [
        {
          caseId: "a/b",
          issue: "T1",
          status: "fixed",
          cells: [{ verdict: "regression" }, { verdict: "pass" }],
          transitions: [
            {
              kind: "fixed-between",
              fromShort: "06719e10fd",
              toShort: "afcc4d00e0",
            },
          ],
        },
      ],
    }),
    runUrl: "https://example.test/run/1",
  });

  const content = card.card.elements[0].content;
  assert.match(content, /^```\n/);
  assert.match(content, /https:\/\/example\.test\/run\/1/);
  assert.equal(card.card.header.template, "green");
});

test("a single-commit run sends the counts instead of the grid", () => {
  const sha = "d".repeat(40);
  const comparison = {
    commits: [{ ref: "develop", sha, short: sha.slice(0, 10) }],
    rows: [
      {
        caseId: "record/x",
        issue: "T1",
        status: "fixed",
        cells: [{ sha, short: sha.slice(0, 10), verdict: "pass" }],
        transitions: [],
      },
      {
        caseId: "record/y",
        issue: "T2",
        status: "fixed",
        cells: [{ sha, short: sha.slice(0, 10), verdict: "regression" }],
        transitions: [],
      },
    ],
    failures: {
      regressions: [{ caseId: "record/y", sha }],
      errors: [],
      missing: [],
      unplanned: [],
      duplicates: [],
      unknownVerdicts: [],
    },
    notices: { unexpectedlyFixed: [] },
    passed: false,
  };
  const card = buildFeishuCard({
    comparison,
    runUrl: "https://example.invalid/run",
  });
  const text = JSON.stringify(card);
  assert.match(text, /\*\*2 cases\*\* on/);
  assert.match(text, /\*\*1 passed\*\*, \*\*1 failed\*\*/);
  // The grid is gone, the failure line is not.
  assert.doesNotMatch(text, /record\/x/);
  assert.match(text, /Regression\*\* record\/y/);
});
