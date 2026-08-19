import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "./atomic-file";
import type { NormalizedBugError } from "./bug-error";
import type { BugVerdict, ObservedOutcome } from "./verdict";
import type { BugCase } from "./types";

// One JSON payload per case per run. The payload — not the vitest exit code —
// is the source of truth: it is written BEFORE any assertion is allowed to
// throw, so a red test always leaves its evidence behind, and the report job
// reads only these files.
export interface BugArtifactPayload {
  caseId: string;
  title: string;
  bug: BugCase["bug"];
  runId: string;
  // The teable-ee revision this observation belongs to. The comparison table
  // groups payloads by this field, never by artifact directory names.
  commitSha: string;
  appUrl: string;
  observed: ObservedOutcome;
  verdict: BugVerdict;
  // Whether this revision is the one that enforces bug.status (the newest
  // column of a comparison, or the single revision of a targeted run). On a
  // non-gating revision a "regression" verdict is historical — the bug before
  // its fix — and does not fail anything.
  gating: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: NormalizedBugError;
  // Present when observed === "present": which checkpoint saw the bug, and
  // what it saw.
  reproduction?: {
    checkpoint: string;
    evidence?: Record<string, unknown>;
  };
}

export const sanitizeCaseId = (caseId: string): string =>
  caseId.replaceAll("/", "-").replace(/[^a-zA-Z0-9_.-]+/g, "-");

const VERDICT_LABEL: Record<BugVerdict, string> = {
  pass: "✅ pass",
  "expected-fail": "⬜ expected fail (bug is open)",
  "unexpected-pass": "💡 unexpectedly fixed — confirm and flip bug.status",
  regression: "❌ REGRESSION — a fixed bug reproduced",
  error: "💥 error — the case never reached its checkpoint",
};

const renderSummary = (payload: BugArtifactPayload): string => {
  const lines = [
    `### ${payload.caseId} @ ${payload.commitSha.slice(0, 10)}`,
    "",
    `- verdict: ${VERDICT_LABEL[payload.verdict]}`,
    `- bug: ${payload.bug.issue} (declared ${payload.bug.status})`,
    `- duration: ${Math.round(payload.durationMs)} ms`,
  ];
  if (payload.reproduction) {
    lines.push(`- checkpoint: ${payload.reproduction.checkpoint}`);
  }
  if (payload.error) {
    lines.push(
      `- error: ${payload.error.message}`,
      ...(payload.error.response
        ? [`- server said: ${payload.error.response}`]
        : []),
    );
  }
  return `${lines.join("\n")}\n`;
};

export const writeBugArtifacts = async (
  artifactDir: string | undefined,
  payload: BugArtifactPayload,
): Promise<void> => {
  if (!artifactDir) {
    // Local direction-finding runs may not set an artifact dir; the console
    // summary below is still worth having.
    console.log(`[e2e-lab] ${payload.caseId}: ${payload.verdict}`);
    return;
  }
  await mkdir(artifactDir, { recursive: true });
  const stem = sanitizeCaseId(payload.caseId);
  await writeFileAtomically(
    join(artifactDir, `${stem}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  await writeFileAtomically(
    join(artifactDir, `summary-${stem}.md`),
    renderSummary(payload),
  );
};
