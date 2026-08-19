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

export const buildComparison = ({ caseCatalog, executePlan, payloads }) => {
  const commits = executePlan;
  const commitShas = new Set(commits.map(({ sha }) => sha));
  const plannedCaseIds = new Set(caseCatalog.map(({ id }) => id));

  const failures = {
    missing: [],
    duplicates: [],
    unplanned: [],
    unknownVerdicts: [],
    regressions: [],
    errors: [],
  };
  const notices = { unexpectedlyFixed: [] };

  const bySha = new Map(commits.map(({ sha }) => [sha, new Map()]));
  for (const payload of payloads) {
    if (
      !commitShas.has(payload.commitSha) ||
      !plannedCaseIds.has(payload.caseId)
    ) {
      failures.unplanned.push({
        caseId: payload.caseId,
        sha: payload.commitSha,
      });
      continue;
    }
    const perCase = bySha.get(payload.commitSha);
    if (perCase.has(payload.caseId)) {
      failures.duplicates.push({
        caseId: payload.caseId,
        sha: payload.commitSha,
      });
      continue;
    }
    if (!(payload.verdict in VERDICT_CELLS)) {
      failures.unknownVerdicts.push({
        caseId: payload.caseId,
        sha: payload.commitSha,
        verdict: payload.verdict,
      });
      continue;
    }
    perCase.set(payload.caseId, payload);
  }

  const rows = caseCatalog.map((entry) => {
    const cells = commits.map((commit) => {
      const payload = bySha.get(commit.sha).get(entry.id);
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

    return {
      caseId: entry.id,
      issue: entry.issue,
      status: entry.status,
      cells,
      transitions,
    };
  });

  const failureCount = Object.values(failures).reduce(
    (total, list) => total + list.length,
    0,
  );

  return {
    commits: commits.map(({ ref, sha, short }) => ({ ref, sha, short })),
    rows,
    failures,
    notices,
    passed: failureCount === 0,
  };
};

const renderCell = (cell) =>
  cell.missing ? MISSING_CELL : VERDICT_CELLS[cell.verdict];

const describeTransition = (transition) =>
  transition.kind === "fixed-between"
    ? `fixed between ${transition.fromShort}..${transition.toShort}`
    : `regressed between ${transition.fromShort}..${transition.toShort}`;

export const renderComparisonMarkdown = (comparison) => {
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

  const sections = [...header, ...body, ...legend];

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
