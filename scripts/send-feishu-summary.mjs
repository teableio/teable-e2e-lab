// One Feishu card per run, built from comparison.json — the same model the
// acceptance gate judged, so the card can never disagree with the verdict.
//
// Kept deliberately small next to perf-lab's sender: bug results are
// deterministic, so there are no noise caveats, no baselines, and no folded
// panels — the card states the verdict, lists what needs a human (regressions,
// errors, unexpectedly-fixed), and shows each row's transition points.

import { readFile } from "node:fs/promises";
import { env, requiredEnv } from "./env.mjs";

const CELL = {
  pass: "✅",
  "expected-fail": "⬜",
  "unexpected-pass": "💡",
  regression: "❌",
  error: "💥",
};

export const buildFeishuCard = ({ comparison, runUrl }) => {
  const failed = !comparison.passed;
  const commitLine = comparison.commits
    .map(({ ref, short }) => `${ref}@${short}`)
    .join(" → ");

  const lines = [`**版本列**：${commitLine}`, ""];

  const rowLines = comparison.rows.map((row) => {
    const cells = row.cells
      .map((cell) => (cell.missing ? "❓" : (CELL[cell.verdict] ?? "❓")))
      .join(" ");
    const transitions = row.transitions
      .map((transition) =>
        transition.kind === "fixed-between"
          ? `修复落在 ${transition.fromShort}..${transition.toShort}`
          : `回归出现在 ${transition.fromShort}..${transition.toShort}`,
      )
      .join("；");
    return `${cells} \`${row.caseId}\`${transitions ? ` — ${transitions}` : ""}`;
  });
  lines.push(...rowLines, "");

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
