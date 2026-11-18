import { execFile } from "node:child_process";
import http from "node:http";
import { FieldType } from "@teable/core";
import { axios } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  AutomationScriptRuntimeCaseConfig,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
} from "../types";
import { dropTables, sleep } from "./raw-api";

// An automation with a script step, run by creating a record -> the script
// uses the token the run gives it to call each automation runtime endpoint and
// to read a table -> checkpoint: the runtime endpoints accept the token as
// coming from an automation script, the table read works, and the run succeeds.
//
// Sending mail, asking the AI and fetching a connection's token are only
// available to automation scripts. Those endpoints stopped recognising the
// script's own token: each answered 403 "This API can only be called from
// automation scripts", from inside an automation script, so every automation
// that sends mail from a script began failing at the upgrade.
//
// What an endpoint does after that gate depends on mail and AI settings a test
// instance does not have, so the case judges only whether the gate let the
// call through. The table read is the control: the token itself is valid.
//
// Scripts normally run in a separate sandbox service. The case stands in for
// it with a small server that runs the code it is handed in a child process,
// so the workflow engine, the token it issues and the script's HTTP calls are
// all the real ones.

const RESTRICTED = "can only be called from automation scripts";
const RESULT_MARKER = "E2E_LAB_RUNTIME_RESULTS ";

type CallResult = { path: string; status: number; body: string };

const scriptFor = (origin: string, tableId: string, timeoutMs: number) => `
  const call = async (method, path, body) => {
    try {
      const response = await fetch(${JSON.stringify(origin)} + path, {
        method,
        headers: {
          Authorization: "Bearer " + process.env.AUTOMATION_TOKEN,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(${timeoutMs}),
      });
      return { path, status: response.status, body: (await response.text()).slice(0, 300) };
    } catch (error) {
      return { path, status: 0, body: String(error).slice(0, 300) };
    }
  };
  const results = [
    await call("POST", "/api/automation/runtime/email", {
      to: "nobody@example.com",
      subject: "e2e-lab",
      body: "e2e-lab",
      smtp: {
        host: "127.0.0.1",
        port: 9,
        sender: "sender@example.com",
        auth: { user: "e2e-lab", pass: "e2e-lab" },
      },
    }),
    await call("POST", "/api/automation/runtime/ai", { prompt: "e2e-lab" }),
    await call("POST", "/api/automation/runtime/integration-token", {
      integrationId: "e2e-lab-unknown-integration",
    }),
    await call("GET", "/api/table/${tableId}/record?take=1"),
  ];
  console.log(${JSON.stringify(RESULT_MARKER)} + JSON.stringify(results));
  const refused = results.find((result) => result.body.includes(${JSON.stringify(RESTRICTED)}));
  if (refused) {
    throw new Error("Runtime call refused: " + refused.path + " " + refused.body);
  }
`;

const readBody = async (request: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as {
    code?: string;
  };
};

const runInChild = (code: string, timeoutMs: number) =>
  new Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>((resolve) => {
    execFile(
      process.execPath,
      ["--input-type=module", "-e", code],
      {
        env: { PATH: process.env.PATH ?? "" },
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const failure = error as (Error & { killed?: boolean }) | null;
        resolve({
          exitCode: failure ? 1 : 0,
          stdout,
          stderr,
          timedOut: Boolean(failure?.killed),
        });
      },
    );
  });

export const runAutomationScriptRuntimeCase = async (
  bugCase: BugCaseFor<"automation-script-runtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AutomationScriptRuntimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  let workflowId = "";
  let results: CallResult[] | undefined;

  const sandbox = http.createServer((request, response) => {
    void (async () => {
      const { code = "" } = await readBody(request);
      let reply: unknown;
      if (request.url === "/compile") {
        reply = { success: true, code };
      } else {
        const executed = await runInChild(code, config.scriptTimeoutMs);
        const line = executed.stdout
          .split("\n")
          .find((candidate) => candidate.startsWith(RESULT_MARKER));
        if (line) {
          results = JSON.parse(
            line.slice(RESULT_MARKER.length),
          ) as CallResult[];
        }
        reply = executed;
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(reply));
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: String(error) }));
    });
  });

  const workflows = `/base/${baseId}/workflow`;
  try {
    const sandboxUrl = new URL(
      process.env.SANDBOX_URL || "http://localhost:7070",
    );
    await new Promise<void>((resolve, reject) => {
      sandbox.once("error", reject);
      sandbox.listen(Number(sandboxUrl.port), resolve);
    });

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.push(table.id);

    workflowId = (
      await axios.post(workflows, {
        name: `${config.tableNamePrefix}-${context.runId}`,
      })
    ).data.id;
    const trigger = (
      await axios.post(`${workflows}/${workflowId}/trigger`, {
        type: "recordCreated",
        config: { tableId: table.id },
      })
    ).data;
    await axios.post(`${workflows}/${workflowId}/action`, {
      parentNodeId: trigger.id,
      type: "script",
      config: {
        code: scriptFor(context.appUrl, table.id, config.callTimeoutMs),
      },
    });
    await axios.put(`${workflows}/${workflowId}/active`, {
      method: "activate",
    });
    await axios.post(`/table/${table.id}/record`, {
      records: [{ fields: { Name: "trigger" } }],
    });

    let runStatus: string | undefined;
    const deadline = Date.now() + config.settleTimeoutMs;
    while (Date.now() < deadline) {
      const runs = await axios.get(`${workflows}/${workflowId}/run`, {
        params: { skip: 0, take: 1 },
      });
      runStatus = runs.data?.runs?.[0]?.status;
      if (results && (runStatus === "success" || runStatus === "failed")) {
        break;
      }
      await sleep(250);
    }
    const calls = results;
    if (!calls) {
      throw new Error(
        `the script never reported its calls (run status ${runStatus ?? "none"})`,
      );
    }
    const control = calls[calls.length - 1];
    if (control.status !== 200) {
      throw new Error(
        `the script's token could not read its own table (${control.status} ${control.body}), so the runtime calls say nothing`,
      );
    }
    const runtimeCalls = calls.slice(0, -1);
    const unanswered = runtimeCalls.filter((call) => call.status === 0);
    if (unanswered.length > 0) {
      throw new Error(
        `runtime calls got no answer: ${JSON.stringify(unanswered)}`,
      );
    }

    const probe = await bugCheckpoint(
      "an-automation-script-can-call-the-runtime-endpoints",
      async () => {
        const refused = runtimeCalls.filter((call) =>
          call.body.includes(RESTRICTED),
        );
        if (refused.length > 0 || runStatus !== "success") {
          throw new Error(
            `the run ended ${runStatus}; refused as not coming from an automation script: ` +
              (refused
                .map((call) => `${call.path} (${call.status})`)
                .join(", ") || "none"),
          );
        }
        return {
          runStatus,
          runtimeStatuses: Object.fromEntries(
            runtimeCalls.map((call) => [call.path, call.status]),
          ),
        };
      },
    );
    return { details: { tableId: table.id, workflowId, ...probe } };
  } finally {
    if (workflowId) {
      await axios
        .put(`${workflows}/${workflowId}/active`, { method: "deactivate" })
        .catch(() => undefined);
    }
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
    await new Promise<void>((resolve) => sandbox.close(() => resolve()));
  }
};
