import { axios } from "@teable/openapi";

// Requests whose answer is the observation. The generated client throws on a
// non-2xx status and drops the response with it - routing headers and the
// server's own error body included - which is exactly what a case needs to
// report when the answer is wrong. These keep the status open and hand back
// all three.

export interface RawResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, unknown>;
}

export const rawRequest = async <T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<RawResponse<T>> => {
  const response = await axios.request({
    method,
    url,
    data,
    headers,
    validateStatus: () => true,
  });
  return {
    status: response.status,
    data: response.data as T,
    headers: response.headers as Record<string, unknown>,
  };
};

export const isSuccess = (response: RawResponse) =>
  response.status >= 200 && response.status < 300;

// One line naming the status and the body, cut short enough to read in a
// comparison table cell.
export const describeResponse = (response: RawResponse) => {
  const body =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data ?? "");
  return `${response.status} ${body.length > 600 ? `${body.slice(0, 600)}...` : body}`;
};

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Tables are dropped newest first, so a table holding a link is gone before
// the table it points at. A failed drop is the case's own housekeeping, never
// the product failing.
export const dropTables = async (
  caseId: string,
  baseId: string,
  tableIds: string[],
  drop: (baseId: string, tableId: string) => Promise<unknown>,
) => {
  for (const tableId of [...tableIds].reverse()) {
    try {
      await drop(baseId, tableId);
    } catch (error) {
      console.warn(
        `[e2e-lab] cleanup failed for ${caseId} (table ${tableId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
};
