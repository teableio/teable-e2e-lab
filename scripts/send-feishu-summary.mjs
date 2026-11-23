// One Feishu card per failed run, built from comparison.json — the same model
// the acceptance gate judged, so the card can never disagree with the verdict.
//
// A passing run sends nothing. The lab runs on every backend PR push and every
// develop merge, and a green card for each of them buried the red ones. A
// passing run's table is still on its run page, and its rows are still in the
// Regression Track table.
//
// The card has one hard rule: nothing above the fold grows with the number of
// cases. A run that ends before its cases start produces one "result missing"
// per case, and the card that printed all of them printed the same fact 106
// times and pushed the run link off the screen. A grid of 106 rows in a chat
// message does the same thing for a different reason. Both now live inside
// collapsible panels, which card schema 2.0 provides and 1.0 did not — the
// earlier version of this file worked around their absence by dropping the
// grid entirely on single-column runs.
//
// Above the fold: the verdict, the counts, and the link. Everything else is a
// click away, and the lists inside are capped — past a couple of dozen entries
// a chat card is the wrong place to read them, and the run is one tap away.

import { countOutcomes } from "./comparison-model.mjs";
import { readFile } from "node:fs/promises";
import { env, requiredEnv } from "./env.mjs";

const CELL = {
  pass: "✅",
  "expected-fail": "⬜",
  "unexpected-pass": "💡",
  regression: "❌",
  error: "💥",
};

const MISSING_CELL = "❓";

// The grid is drawn inside a fenced code block because that is the only place
// Feishu renders text in a monospace font — padded columns in a normal
// markdown paragraph collapse into one ragged line and the whole point of a
// table is lost.
//
// Column widths are computed in display cells, not code points: every verdict
// glyph is an emoji that occupies two monospace cells, so counting characters
// would leave every column after the first one short. Everything the card puts
// in the grid is either ASCII (case ids, short shas, ref names) or a CJK/emoji
// glyph, which makes "below U+2000 is narrow" an exact rule here rather than a
// general-purpose width table.
const displayWidth = (text) =>
  [...text].reduce(
    (width, char) => width + (char.codePointAt(0) >= 0x2000 ? 2 : 1),
    0,
  );

const padCell = (text, width) =>
  text + " ".repeat(Math.max(0, width - displayWidth(text)));

// A commit column is headed by whatever the human asked for: "develop" stays
// "develop", a raw sha shrinks to its short form. Reprinting "develop@afcc4d00e0"
// in a header buys nothing the run link does not already answer.
const columnLabel = ({ ref, short }) =>
  /^[0-9a-f]{7,40}$/i.test(ref) ? short : ref;

export const buildComparisonGrid = (comparison) => {
  const header = ["case", ...comparison.commits.map(columnLabel)];
  const rows = comparison.rows.map((row) => [
    row.caseId,
    ...row.cells.map((cell) =>
      cell.missing ? MISSING_CELL : (CELL[cell.verdict] ?? MISSING_CELL),
    ),
  ]);
  const widths = header.map((label, column) =>
    Math.max(
      displayWidth(label),
      ...rows.map((row) => displayWidth(row[column] ?? "")),
    ),
  );

  return [header, ...rows].map((row) =>
    row
      .map((cell, column) => padCell(cell ?? "", widths[column]))
      .join("  ")
      .trimEnd(),
  );
};

// Past this many, a chat card is the wrong place to read a list. The tail is
// counted rather than printed, and the run link is where it belongs.
const LIST_LIMIT = 20;

const capped = (entries, render) => {
  const shown = entries.slice(0, LIST_LIMIT).map(render);
  const hidden = entries.length - shown.length;
  return hidden > 0 ? [...shown, `…and ${hidden} more — see the run`] : shown;
};

const shortSha = (sha) => sha.slice(0, 10);

// "No results" on its own sent people to the run page for every red card, and
// two very different failures looked identical there: a runner stuck on a
// stalled APT mirror until the job timeout, and a commit that did not compile.
// The first is the lab's problem, the second the PR's. Which step of the
// commit's job stopped already tells them apart, so the card says it.
//
// Only step names and conclusions are used. The case output itself stays on
// the run page: acceptance runs withhold it on purpose, and a chat card is not
// where a stack trace belongs.
const CASE_STEP = /^Run (bug|hybrid computed-update bug) cases\b/;
const CHROMIUM_STEP = "Install Chromium for browser-driven cases";

const minutesBetween = (start, end) =>
  start && end
    ? Math.round((Date.parse(end) - Date.parse(start)) / 60000)
    : null;

export const explainColumnFailure = (job) => {
  if (!job) {
    return null;
  }
  const steps = job.steps ?? [];
  const stopped =
    steps.find((step) => step.conclusion === "cancelled") ??
    steps.find((step) => step.conclusion === "failure");
  const minutes = minutesBetween(job.started_at, job.completed_at);
  const log = job.html_url ? ` [Job log](${job.html_url})` : "";

  if (job.conclusion === "cancelled" || stopped?.conclusion === "cancelled") {
    const where = stopped ? ` in "${stopped.name}"` : "";
    const after = minutes !== null ? ` after ${minutes} min` : "";
    return `Cause: the job was cancelled${where}${after} (timeout or manual cancel). No case ran.${log}`;
  }
  if (!stopped) {
    return job.conclusion === "success"
      ? `Cause: the job passed but uploaded no results.${log}`
      : null;
  }
  if (stopped.name === CHROMIUM_STEP) {
    return `Cause: Chromium could not be installed (APT mirror or download problem). No case ran; this is a runner problem, not the commit.${log}`;
  }
  if (CASE_STEP.test(stopped.name)) {
    return `Cause: the case runner failed before any case reported. This usually means the commit does not build or start; the job log has the error.${log}`;
  }
  return `Cause: setup step "${stopped.name}" failed. No case ran.${log}`;
};

// Job names carry the short sha of the commit they ran: "Run cases (c1-<sha>)".
const jobForSha = (jobs, sha) =>
  jobs.find((job) => {
    const match = /^Run cases \(c\d+-([0-9a-f]+)\)/.exec(job.name ?? "");
    return match !== null && sha.startsWith(match[1]);
  });

// One line per commit that produced no result at all. It sits above the fold:
// "why" is the first thing a reader of an all-missing card needs, and it grows
// with the number of commits in the run, never with the number of cases.
const describeEmptyColumns = (comparison, jobs) => {
  const total = comparison.rows.length;
  if (total === 0) {
    return [];
  }
  const perColumn = new Map();
  for (const entry of comparison.failures.missing) {
    perColumn.set(entry.sha, (perColumn.get(entry.sha) ?? 0) + 1);
  }
  const lines = [];
  for (const [sha, count] of perColumn) {
    if (count !== total) {
      continue;
    }
    const cause = explainColumnFailure(jobForSha(jobs, sha));
    if (cause) {
      lines.push(
        comparison.commits.length > 1 ? `\`${shortSha(sha)}\` ${cause}` : cause,
      );
    }
  }
  return lines;
};

// A run that dies before its cases start reports every case as missing on that
// column. Saying so once is the whole content of that report; saying it 106
// times is not 106 times as informative.
const describeMissing = (comparison) => {
  const { missing } = comparison.failures;
  if (missing.length === 0) {
    return [];
  }
  const perColumn = new Map();
  for (const entry of missing) {
    perColumn.set(entry.sha, (perColumn.get(entry.sha) ?? 0) + 1);
  }
  const total = comparison.rows.length;
  const lines = [];
  for (const [sha, count] of perColumn) {
    if (count === total && total > 1) {
      lines.push(
        `❓ No results from \`${shortSha(sha)}\` — all ${total} cases. The run stopped before the cases did.`,
      );
    } else {
      lines.push(
        ...capped(
          missing.filter((entry) => entry.sha === sha),
          (entry) =>
            `❓ Result missing ${entry.caseId} @ ${shortSha(entry.sha)}`,
        ),
      );
    }
  }
  return lines;
};

// Kept to the fields the schema requires. The first attempt carried styling
// alongside them and the webhook answered "parse card json err" without saying
// which field it choked on, so the card asks for nothing it does not need.
const collapsible = (title, content) => ({
  tag: "collapsible_panel",
  expanded: false,
  header: { title: { tag: "markdown", content: title } },
  elements: [{ tag: "markdown", content }],
});

// The card a run should send, or null when it should send none: a run that
// passed acceptance.
export const buildFeishuCard = ({ comparison, runUrl, jobs = [] }) => {
  if (comparison.passed) {
    return null;
  }
  const { regressions, errors, missing } = comparison.failures;
  const { unexpectedlyFixed } = comparison.notices;

  // The headline never grows: one line whatever the run did.
  const caseCount = comparison.rows.length;
  const columnCount = comparison.commits.length;
  const headline =
    columnCount === 1
      ? (() => {
          const {
            total,
            passed,
            failed: failedCount,
          } = countOutcomes(comparison);
          const [column] = comparison.commits;
          return `**${total} case${total === 1 ? "" : "s"}** on \`${columnLabel(column)}\` — **${passed} passed**, **${failedCount} failed**.`;
        })()
      : `**${caseCount} case${caseCount === 1 ? "" : "s"}** across **${columnCount} commits** — ${comparison.commits.map((commit) => `\`${columnLabel(commit)}\``).join(" → ")}.`;

  const needsHuman = [
    regressions.length > 0
      ? `❌ ${regressions.length} regression${regressions.length === 1 ? "" : "s"}`
      : null,
    errors.length > 0 ? `💥 ${errors.length} could not run` : null,
    missing.length > 0 ? `❓ ${missing.length} missing` : null,
    unexpectedlyFixed.length > 0
      ? `💡 ${unexpectedlyFixed.length} to confirm`
      : null,
  ].filter(Boolean);

  // One line for the reference engine, and only ever one. The card is what
  // people actually read, so a v1 column nobody sees here is a column nobody
  // sees — but it must not compete with the guarded result, and it must not
  // grow with the number of cases. So: a count, no names, and it says plainly
  // that it decided nothing.
  const reference = (() => {
    if (!comparison.engines?.includes("v1")) {
      return null;
    }
    let present = 0;
    let unrunnable = 0;
    let skipped = 0;
    for (const row of comparison.rows) {
      for (const cell of row.referenceCells ?? []) {
        if (cell.skipped) skipped += 1;
        else if (cell.observed === "present") present += 1;
        else if (cell.verdict === "error") unrunnable += 1;
      }
    }
    const parts = [
      `${present} still reproduce`,
      unrunnable > 0 ? `${unrunnable} could not run` : null,
      skipped > 0 ? `${skipped} not asked` : null,
    ].filter(Boolean);
    return `v1 reference (decides nothing): ${parts.join(", ")}`;
  })();

  const elements = [
    {
      tag: "markdown",
      content: [
        headline,
        needsHuman.length > 0 ? needsHuman.join("  ·  ") : null,
        ...describeEmptyColumns(comparison, jobs),
        reference,
        `[Open the run and the full comparison table](${runUrl})`,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
  ];

  const failureLines = [
    ...capped(
      regressions,
      (failure) =>
        `❌ **Regression** ${failure.caseId} @ ${shortSha(failure.sha)}`,
    ),
    ...capped(
      errors,
      (failure) =>
        `💥 Could not run ${failure.caseId} @ ${shortSha(failure.sha)}`,
    ),
    ...describeMissing(comparison),
  ];
  if (failureLines.length > 0) {
    elements.push(
      collapsible(
        `**What needs a human** (${needsHuman.join(", ")})`,
        failureLines.join("\n"),
      ),
    );
  }

  if (unexpectedlyFixed.length > 0) {
    elements.push(
      collapsible(
        `**💡 Declared open but did not reproduce** (${unexpectedlyFixed.length})`,
        [
          "Confirm the fix, then set status to fixed:",
          ...capped(
            unexpectedlyFixed,
            (notice) => `- ${notice.caseId} (${notice.issue})`,
          ),
        ].join("\n"),
      ),
    );
  }

  if (columnCount > 1) {
    elements.push(
      collapsible(
        `**Bug × commit** (${caseCount} × ${columnCount})`,
        ["```", ...buildComparisonGrid(comparison), "```"].join("\n"),
      ),
    );
  }

  return {
    msg_type: "interactive",
    card: {
      // wide_screen_mode belongs to schema 1.0; carrying it into a 2.0 card is
      // what the webhook rejected the first time this shipped.
      schema: "2.0",
      header: {
        title: {
          tag: "plain_text",
          content: "❌ e2e-lab regression check failed",
        },
        template: "red",
      },
      body: { elements },
    },
  };
};

// The jobs of this run attempt, for the failure causes. Best-effort: if the API
// is unreachable the card still goes out, just without the cause lines.
const fetchRunJobs = async (repository) => {
  const runId = env("GITHUB_RUN_ID");
  const token = env("GITHUB_TOKEN");
  if (!runId || !token) {
    return [];
  }
  const attempt = env("GITHUB_RUN_ATTEMPT", "1");
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
        },
      },
    );
    if (!res.ok) {
      console.log(`Could not list run jobs (HTTP ${res.status}); no causes.`);
      return [];
    }
    const body = await res.json();
    return Array.isArray(body.jobs) ? body.jobs : [];
  } catch (error) {
    console.log(`Could not list run jobs: ${String(error)}; no causes.`);
    return [];
  }
};

const main = async () => {
  const webhookUrl = env("FEISHU_E2E_WEBHOOK_URL");
  if (!webhookUrl) {
    console.log("FEISHU_E2E_WEBHOOK_URL is not set; skipping the Feishu card.");
    return;
  }

  const comparison = JSON.parse(
    await readFile(requiredEnv("E2E_LAB_COMPARISON_PATH"), "utf8"),
  );
  const repository = env("GITHUB_REPOSITORY", "teableio/teable-e2e-lab");
  const runUrl = `https://github.com/${repository}/actions/runs/${env("GITHUB_RUN_ID", "")}`;

  const card = buildFeishuCard({
    comparison,
    runUrl,
    jobs: await fetchRunJobs(repository),
  });
  if (!card) {
    console.log("The run passed; Feishu gets a card only for failed runs.");
    return;
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(card),
  });
  const body = await res.json().catch(() => ({}));
  // The webhook answers 200 with a non-zero code on a rejected card; only the
  // acknowledgement counts as delivery.
  if (!res.ok || body.code !== 0) {
    throw new Error(
      `Feishu webhook rejected the card: HTTP ${res.status}, body ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  console.log("Feishu card delivered.");
};

const invokedDirectly = process.argv[1]
  ? import.meta.url.endsWith(process.argv[1].split("/").pop())
  : false;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
