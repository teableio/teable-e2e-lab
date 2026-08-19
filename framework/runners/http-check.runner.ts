import { axios } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

// The simplest runner: one GET, one checkpoint. Exists so a smoke case can
// prove the whole harness — injection, app boot, auth, artifact writing,
// verdict mapping — before any real bug case is trusted on a new revision.
export const runHttpCheckCase = async (
  bugCase: BugCaseFor<"http-check">,
  _context: BugRunContext,
): Promise<BugProbeResult> => {
  const { config } = bugCase;

  const response = await bugCheckpoint("endpoint-behaves", async () => {
    const res = await axios.get(config.path);
    if (res.status !== config.expect.status) {
      throw new Error(
        `${config.method} ${config.path} answered ${res.status}, expected ${config.expect.status}`,
      );
    }
    if (config.expect.seedUser) {
      const body = res.data as { id?: string; email?: string };
      if (
        body.id !== globalThis.testConfig.userId ||
        body.email !== globalThis.testConfig.email
      ) {
        throw new Error(
          `${config.path} did not answer as the seed user (got id=${body.id}, email=${body.email})`,
        );
      }
    }
    return res;
  });

  return {
    details: {
      endpoint: { method: config.method, path: config.path },
      status: response.status,
    },
  };
};
