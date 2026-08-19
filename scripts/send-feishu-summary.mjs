// One Feishu card per run, built from comparison.json — the same model the
// acceptance gate judged, so the card can never disagree with the verdict.
//
// Kept deliberately small next to perf-lab's sender: bug results are
// deterministic, so there are no noise caveats, no baselines, and no folded
// panels — the card shows the bug × commit grid, lists what needs a human
// (regressions, errors, unexpectedly-fixed), and links the run.

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
  const header = ["用例", ...comparison.commits.map(columnLabel)];
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

export const buildFeishuCard = ({ comparison, runUrl }) => {
  const failed = !comparison.passed;

  // The grid alone carries the comparison: a row reading ❌ then ✅ already
  // says "fixed between these two commits", so spelling the transition out
  // again next to it only competed with the table for the reader's attention.
  const lines = ["```", ...buildComparisonGrid(comparison), "```", ""];

  const failureLines = [];
  for (const failure of comparison.failures.regressions) {
    failureLines.push(
      `❌ **回归** ${failure.caseId} @ ${failure.sha.slice(0, 10)}`,
    );
  }
  for (const failure of comparison.failures.errors) {
    failureLines.push(
      `💥 未跑成 ${failure.caseId} @ ${failure.sha.slice(0, 10)}`,
    );
  }
  for (const failure of comparison.failures.missing) {
    failureLines.push(
      `❓ 结果缺失 ${failure.caseId} @ ${failure.sha.slice(0, 10)}`,
    );
  }
  if (failureLines.length > 0) {
    lines.push(...failureLines, "");
  }
  if (comparison.notices.unexpectedlyFixed.length > 0) {
    lines.push(
      "💡 **声明 open 但未复现，请确认修复并把用例 status 改为 fixed：**",
      ...comparison.notices.unexpectedlyFixed.map(
        (notice) => `- ${notice.caseId}（${notice.issue}）`,
      ),
      "",
    );
  }
  lines.push(`[查看运行与完整对比表](${runUrl})`);

  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: "plain_text",
          content: failed
            ? "❌ e2e-lab 回归检查未通过"
            : "✅ e2e-lab 回归检查通过",
        },
        template: failed ? "red" : "green",
      },
      elements: [{ tag: "markdown", content: lines.join("\n") }],
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
