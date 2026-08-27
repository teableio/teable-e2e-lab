// The bug x commit comparison table, as a pure model plus a markdown renderer.
//
// Inputs are the plan (cases x commits, the coverage contract) and the payloads
// the execute jobs actually wrote. Verdicts are read from the payloads — they
// were resolved once at run time by framework/verdict.ts and are never
// re-derived here, so the table and the test results cannot disagree.
//
// Fail-closed is the design center, inherited from perf-lab's full-run
// acceptance: every planned (case, commit) pair must have exactly ONE payload.
// A missing cell is a failure, never an empty cell a reader might take for
// green; a duplicate is a failure, because two observations for one cell means
// the run's identity is confused.
//
// That contract covers the V2 table only. v1 is a reference column: it is
// rendered beside the guarded one and recorded in the artifact, and its
// problems land in `referenceIssues`, which is printed and never fails the
// run. Making v1 fail-closed too would put the noise this column was cleaned
// of straight back — 11 of 129 cases cannot be asked of v1 at all, and a
// reference nobody can afford to leave red is a reference nobody keeps.

// Keep in sync with the BugVerdict union in framework/verdict.ts. A payload
// carrying a verdict outside this map fails the run as `unknown-verdict`
// rather than rendering as something misleading.
export const VERDICT_CELLS = {
  pass: "✅",
  "expected-fail": "⬜",
  "unexpected-pass": "💡",
  regression: "❌",
  error: "💥",
};
export const MISSING_CELL = "❓";
// Declared on the case, not discovered by the run: v1 was never asked.
export const SKIPPED_CELL = "⊘";

export const buildComparison = ({
  caseCatalog,
  executePlan,
  payloads,
  engines = ["v2"],
}) => {
  const commits = executePlan;
  const commitShas = new Set(commits.map(({ sha }) => sha));
  const plannedCaseIds = new Set(caseCatalog.map(({ id }) => id));
  const skipsV1 = new Map(caseCatalog.map((entry) => [entry.id, entry.skipV1]));
  const runsV1 = engines.includes("v1");

  const failures = {
    missing: [],
    duplicates: [],
    unplanned: [],
    unknownVerdicts: [],
    regressions: [],
    errors: [],
  };
  const notices = { unexpectedlyFixed: [] };
  // Everything the v1 column noticed that a person should see and no gate
  // should act on.
  const referenceIssues = [];

  const emptyBySha = () => new Map(commits.map(({ sha }) => [sha, new Map()]));
  const guarded = emptyBySha();
  const reference = emptyBySha();

  for (const payload of payloads) {
    // A payload with no engine is a pre-engine artifact; read it as v2, the
    // engine that was the only one when it was written.
    const engine = payload.engine === "v1" ? "v1" : "v2";
    const sink = engine === "v1" ? referenceIssues : null;
    const note = (kind, extra = {}) => {
      const entry = {
        caseId: payload.caseId,
        sha: payload.commitSha,
        ...extra,
      };
      if (sink) {
        sink.push({ kind, ...entry });
      } else {
        failures[kind].push(entry);
      }
    };

    const declaredSkip = skipsV1.get(payload.caseId);
    if (
      !commitShas.has(payload.commitSha) ||
      !plannedCaseIds.has(payload.caseId) ||
      (engine === "v1" && (!runsV1 || declaredSkip))
    ) {
      note("unplanned");
      continue;
    }
    const perCase = (engine === "v1" ? reference : guarded).get(
      payload.commitSha,
    );
    if (perCase.has(payload.caseId)) {
      note("duplicates");
      continue;
    }
    if (!(payload.verdict in VERDICT_CELLS)) {
      note("unknownVerdicts", { verdict: payload.verdict });
      continue;
    }
    perCase.set(payload.caseId, payload);
  }

  const rows = caseCatalog.map((entry) => {
    const cells = commits.map((commit) => {
      const payload = guarded.get(commit.sha).get(entry.id);
      if (!payload) {
        failures.missing.push({ caseId: entry.id, sha: commit.sha });
        return { sha: commit.sha, short: commit.short, missing: true };
      }
      // Gating comes from the PLAN, not from the payload: the plan is the
      // contract the acceptance verifies against, and a payload claiming a
      // different gating position would be the exact confusion to catch.
      if (payload.verdict === "regression" && commit.gating) {
        failures.regressions.push({
          caseId: entry.id,
          sha: commit.sha,
          error: payload.error,
        });
      }
      if (payload.verdict === "error") {
        failures.errors.push({
          caseId: entry.id,
          sha: commit.sha,
          error: payload.error,
        });
      }
      if (payload.verdict === "unexpected-pass" && commit.gating) {
        notices.unexpectedlyFixed.push({
          caseId: entry.id,
          issue: entry.issue,
          sha: commit.sha,
        });
      }
      return {
        sha: commit.sha,
        short: commit.short,
        verdict: payload.verdict,
        observed: payload.observed,
      };
    });

    // Transitions read off adjacent observations. Only present->absent and
    // absent->present count; a cell that errored or is missing produced no
    // observation, so nothing is claimed across it — a claim would be
    // fabricated evidence.
    const transitions = [];
    for (let index = 1; index < cells.length; index += 1) {
      const before = cells[index - 1].observed;
      const after = cells[index].observed;
      if (before === "present" && after === "absent") {
        transitions.push({
          kind: "fixed-between",
          fromShort: cells[index - 1].short,
          toShort: cells[index].short,
        });
      } else if (before === "absent" && after === "present") {
        transitions.push({
          kind: "regressed-between",
          fromShort: cells[index - 1].short,
          toShort: cells[index].short,
        });
      }
    }

    // The reference column. Judged by nothing: a cell is what v1 answered, a
    // skip is what the case declared, and a hole is a hole.
    const referenceCells = runsV1
      ? commits.map((commit) => {
          if (entry.skipV1) {
            return { sha: commit.sha, short: commit.short, skipped: true };
          }
          const payload = reference.get(commit.sha).get(entry.id);
          if (!payload) {
            referenceIssues.push({
              kind: "missing",
              caseId: entry.id,
              sha: commit.sha,
            });
            return { sha: commit.sha, short: commit.short, missing: true };
          }
          return {
            sha: commit.sha,
            short: commit.short,
            verdict: payload.verdict,
            observed: payload.observed,
          };
        })
      : [];

    return {
      caseId: entry.id,
      issue: entry.issue,
      status: entry.status,
      cells,
      transitions,
      skipV1: entry.skipV1,
      referenceCells,
    };
  });

  const failureCount = Object.values(failures).reduce(
    (total, list) => total + list.length,
    0,
  );

  return {
    commits: commits.map(({ ref, sha, short }) => ({ ref, sha, short })),
    engines,
    rows,
    failures,
    notices,
    referenceIssues,
    passed: failureCount === 0,
  };
};

const renderCell = (cell) =>
  cell.missing ? MISSING_CELL : VERDICT_CELLS[cell.verdict];

const renderReferenceCell = (cell) =>
  cell.skipped ? SKIPPED_CELL : renderCell(cell);

// The v1 table, printed under the guarded one and judged by nobody.
//
// A separate table rather than extra columns in the first: interleaving them
// doubles the width of the thing people actually read, and puts cells that
// fail the run next to cells that cannot, which is precisely the confusion
// this column has to avoid to stay welcome.
export const renderReferenceMarkdown = (comparison) => {
  if (!comparison.engines?.includes("v1")) {
    return "";
  }
  const skipped = comparison.rows.filter((row) => row.skipV1);
  const lines = [
    "",
    "## v1 reference",
    "",
    "What the legacy engine answered for the same cases. Nothing here fails the run.",
    "",
    `| case | issue | ${comparison.commits.map(({ short }) => `\`${short}\``).join(" | ")} |`,
    `|---|---|${comparison.commits.map(() => "---").join("|")}|`,
    ...comparison.rows.map(
      (row) =>
        `| ${row.caseId} | ${row.issue} | ${row.referenceCells
          .map(renderReferenceCell)
          .join(" | ")} |`,
    ),
    "",
    `Legend: ${SKIPPED_CELL} not asked of v1 (declared on the case) · ❌ the bug is present on v1 · ✅ absent · 💥 the case could not run on v1 · ❓ result missing`,
    "",
    "v1 is reached by unstamping each case's base, which makes a base no real " +
      "customer has: theirs predate v2. Read this column as evidence to follow " +
      "up, never as a verdict.",
  ];
  if (skipped.length > 0) {
    lines.push(
      "",
      `<details><summary>${skipped.length} case(s) not asked of v1</summary>`,
      "",
      ...skipped.map((row) => `- \`${row.caseId}\` — ${row.skipV1}`),
      "",
      "</details>",
    );
  }
  if (comparison.referenceIssues.length > 0) {
    lines.push(
      "",
      `<details><summary>${comparison.referenceIssues.length} v1 bookkeeping issue(s) — not failing the run</summary>`,
      "",
      ...comparison.referenceIssues.map(
        (issue) =>
          `- ${issue.kind}: \`${issue.caseId}\` @ \`${(issue.sha ?? "?").slice(0, 10)}\``,
      ),
      "",
      "</details>",
    );
  }
  return lines.join("\n");
};

const describeTransition = (transition) =>
  transition.kind === "fixed-between"
    ? `fixed between ${transition.fromShort}..${transition.toShort}`
    : `regressed between ${transition.fromShort}..${transition.toShort}`;

// A full run against a single commit - the develop-only sweep - is read as
// "did anything break", not case by case. Its table is one column of ticks,
// which is a page of scrolling to reach the part that matters, so the counts
// go on top and the table folds away. Multi-commit runs keep the table open:
// there the columns beside each other are the whole point.
export const countOutcomes = (comparison) => {
  let passed = 0;
  let failed = 0;
  for (const row of comparison.rows) {
    // One column, and by construction it is the gating one, so a reproduced
    // bug counts as a failure here.
    const cell = row.cells[0];
    const isFailure =
      cell.missing || cell.verdict === "error" || cell.verdict === "regression";
    if (isFailure) {
      failed += 1;
    } else {
      passed += 1;
    }
  }
  return { total: comparison.rows.length, passed, failed };
};

export const renderComparisonMarkdown = (comparison) => {
  const singleColumn = comparison.commits.length === 1;
  const header = [
    "## Bug × commit",
    "",
    `| case | issue | status | ${comparison.commits
      .map(({ short }) => `\`${short}\``)
      .join(" | ")} | transition |`,
    `|---|---|---|${comparison.commits.map(() => "---").join("|")}|---|`,
  ];
  const body = comparison.rows.map(
    (row) =>
      `| ${row.caseId} | ${row.issue} | ${row.status} | ${row.cells
        .map(renderCell)
        .join(" | ")} | ${
        row.transitions.map(describeTransition).join("; ") || ""
      } |`,
  );
  const legend = [
    "",
    "Legend: ✅ fix holds · ⬜ known-unfixed, as declared · 💡 declared open but did not reproduce · ❌ bug reproduced on this revision · 💥 case could not run · ❓ result missing",
    "",
    "Columns are in the order they were dispatched; nothing is reordered by the git graph. " +
      "Only the rightmost gating column is judged: ❌ there is a regression and fails the run, " +
      "while ❌ on an older column is simply the world before the fix. 💥 fails on every column.",
  ];

  const sections = singleColumn
    ? (() => {
        const { total, passed, failed } = countOutcomes(comparison);
        const [{ short }] = comparison.commits;
        return [
          "## Bug × commit",
          "",
          `**${total} case${total === 1 ? "" : "s"}** ran on \`${short}\` — **${passed} passed**, **${failed} failed**.`,
          "",
          "<details>",
          `<summary>Per-case results (${total})</summary>`,
          "",
          ...header.slice(2),
          ...body,
          ...legend,
          "",
          "</details>",
        ];
      })()
    : [...header, ...body, ...legend];

  if (comparison.failures.regressions.length > 0) {
    sections.push("", "### ❌ Regressions");
    for (const failure of comparison.failures.regressions) {
      sections.push(
        `- ${failure.caseId} @ \`${failure.sha.slice(0, 10)}\`${
          failure.error ? ` — ${failure.error.message}` : ""
        }`,
      );
    }
  }
  if (comparison.failures.errors.length > 0) {
    sections.push("", "### 💥 Cases that could not run");
    for (const failure of comparison.failures.errors) {
      sections.push(
        `- ${failure.caseId} @ \`${failure.sha.slice(0, 10)}\`${
          failure.error ? ` — ${failure.error.message}` : ""
        }`,
      );
    }
  }
  if (comparison.failures.missing.length > 0) {
    sections.push(
      "",
      "### ❓ Missing results (fail-closed: a missing cell fails the run)",
      ...comparison.failures.missing.map(
        (failure) => `- ${failure.caseId} @ \`${failure.sha.slice(0, 10)}\``,
      ),
    );
  }
  if (comparison.notices.unexpectedlyFixed.length > 0) {
    sections.push(
      "",
      "### 💡 Unexpectedly fixed — confirm the fix, then set the case's bug.status to fixed",
      ...comparison.notices.unexpectedlyFixed.map(
        (notice) =>
          `- ${notice.caseId} (${notice.issue}) @ \`${notice.sha.slice(0, 10)}\``,
      ),
    );
  }

  return `${sections.join("\n")}\n`;
};
