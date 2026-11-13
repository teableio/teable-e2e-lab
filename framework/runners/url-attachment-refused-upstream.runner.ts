import http from "node:http";
import type { AddressInfo } from "node:net";
import { FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  UrlAttachmentRefusedUpstreamCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A file server started for the run that refuses one path and serves another
// -> upload an attachment from each URL -> checkpoint: the refused URL is
// answered with a 4xx the person can act on, not a 500. The served URL is the
// control and must attach the file.
//
// Adding an attachment by link fails whenever the other side says no: an
// expired share link, a private bucket, a page that needs a login. The upload
// answered 500, so the client showed a generic server error for what was the
// link's fault, and error monitoring filled with failures nobody could fix.

const BODY = "remote attachment body";

export const runUrlAttachmentRefusedUpstreamCase = async (
  bugCase: BugCaseFor<"url-attachment-refused-upstream">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UrlAttachmentRefusedUpstreamCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/refused") {
      res.statusCode = req.method === "HEAD" ? 404 : 403;
      res.end("refused");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Length", String(Buffer.byteLength(BODY)));
    res.end(BODY);
  });

  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        { name: "Files", type: FieldType.Attachment },
      ],
      records: [{ fields: { Name: "row" } }],
    });
    tableIds.push(table.id);
    const url = `/table/${table.id}/record/${table.records[0].id}/${table.fields[1].id}/uploadAttachment`;

    const served = await rawRequest("POST", url, {
      fileUrl: `${origin}/file.txt`,
    });
    if (!isSuccess(served)) {
      throw new Error(
        `attaching a file the server serves answered ${describeResponse(served)}, so the fixture cannot reach it`,
      );
    }

    const probe = await bugCheckpoint(
      "a-refused-attachment-link-is-a-client-error",
      async () => {
        const refused = await rawRequest("POST", url, {
          fileUrl: `${origin}/refused`,
        });
        if (refused.status < 400 || refused.status >= 500) {
          throw new Error(
            `attaching a link the remote server refuses answered ${describeResponse(refused)}, expected a 4xx`,
          );
        }
        return { status: refused.status };
      },
    );
    return { details: { tableId: table.id, ...probe } };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
