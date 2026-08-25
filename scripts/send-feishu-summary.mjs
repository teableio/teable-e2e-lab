// One Feishu card per run, built from comparison.json — the same model the
// acceptance gate judged, so the card can never disagree with the verdict.
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

const collapsible = (title, content) => ({
  tag: "collapsible_panel",
  expanded: false,
  background_style: "grey",
  header: {
    title: { tag: "markdown", content: title },
    vertical_align: "center",
    icon: { tag: "standard_icon", token: "down-small-ccm_outlined" },
    icon_position: "right",
    icon_expanded_angle: -180,
  },
  elements: [{ tag: "markdown", content }],
});

export const buildFeishuCard = ({ comparison, runUrl }) => {
  const failed = !comparison.passed;
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

  const elements = [
    {
      tag: "markdown",
      content: [
        headline,
        needsHuman.length > 0 ? needsHuman.join("  ·  ") : null,
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
      schema: "2.0",
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: "plain_text",
          content: failed
            ? "❌ e2e-lab regression check failed"
            : "✅ e2e-lab regression check passed",
        },
        template: failed ? "red" : "green",
      },
      body: { elements },
    },
  };
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

  const card = buildFeishuCard({ comparison, runUrl });
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
