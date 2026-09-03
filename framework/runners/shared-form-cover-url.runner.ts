import { ViewType } from "@teable/core";
import {
  axios,
  createView as apiCreateView,
  enableShareView as apiEnableShareView,
  SHARE_VIEW_GET,
  urlBuilder,
  VIEW_OPTION,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SharedFormCoverUrlCaseConfig } from "../types";

// A form with a picture at the top, shared -> open the link -> checkpoint: the
// address of the picture is an address.
//
// Where a form's picture lives is stored as a short path, and the address a
// browser can fetch is worked out from it when the form is read. The shared
// form is read through two layers, and both worked it out - the second one over
// the first one's answer. What came back was one address with another stuck on
// the front of it, which fetches nothing.
//
// So the person who opens the shared link sees a form with a broken picture,
// while the same form inside the product looks right - it is only read through
// one layer there. Nothing is wrong with the picture or the form.
//
// The address is checked for being built once, not for being any particular
// string: what the storage prefix is depends on how the instance is deployed,
// and pinning it would make this case about configuration.

const NAME_FIELD = "Name";

export const runSharedFormCoverUrlCase = async (
  bugCase: BugCaseFor<"shared-form-cover-url">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SharedFormCoverUrlCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (/^https?:\/\//i.test(config.storedPath)) {
    throw new Error(
      "the stored path must be a short path, not an address - an address is what the fix passes through untouched",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [{ name: NAME_FIELD, type: "singleLineText" as never }],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    tableId = table.id;

    const form = await apiCreateView(tableId, {
      name: `${suffix}-form`,
      type: ViewType.Form,
    });
    const viewId = form.data.id;

    // Where the picture lives, as it is stored: a short path.
    const options = await axios.patch(
      urlBuilder(VIEW_OPTION, { tableId, viewId }),
      { options: { coverUrl: config.storedPath, logoUrl: config.storedPath } },
      { validateStatus: () => true },
    );
    if (options.status < 200 || options.status >= 300) {
      throw new Error(
        `setting the form's picture answered ${options.status}: ${JSON.stringify(options.data)}`,
      );
    }

    const shared = await apiEnableShareView({ tableId, viewId });
    const shareId = shared.data?.shareId;
    if (!shareId) {
      throw new Error(
        `sharing the form returned no link: ${JSON.stringify(shared.data)}`,
      );
    }
    const routing = assertServedByV2(shared.headers, {
      operation: "POST /table/{tableId}/view/{viewId}/enable-share",
      feature: "enableViewShare",
    });

    // Fixture verification, outside the checkpoint: read from inside the
    // product, the address is built once. That is the control - it says the
    // picture and the form are fine, and it is the same view the shared link
    // serves.
    const inside = await axios.get(
      urlBuilder("/table/{tableId}/view/{viewId}", { tableId, viewId }),
      { validateStatus: () => true },
    );
    const insideCover = (
      inside.data as { options?: { coverUrl?: string } } | undefined
    )?.options?.coverUrl;
    if (!insideCover || !insideCover.includes(config.storedPath)) {
      throw new Error(
        `inside the product the form's picture reads ${JSON.stringify(insideCover)}, ` +
          `which does not carry ${JSON.stringify(config.storedPath)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-shared-forms-picture-has-one-address",
      async () => {
        const opened = await axios.get(
          urlBuilder(SHARE_VIEW_GET, { shareId }),
          { validateStatus: () => true },
        );
        const body =
          typeof opened.data === "string"
            ? opened.data
            : JSON.stringify(opened.data ?? "");
        if (opened.status !== 200) {
          throw new Error(
            `opening the shared form answered ${opened.status}: ${body}`,
          );
        }

        const view = (
          opened.data as {
            view?: { options?: { coverUrl?: string; logoUrl?: string } };
          }
        )?.view;
        const seen = {
          coverUrl: view?.options?.coverUrl,
          logoUrl: view?.options?.logoUrl,
        };

        for (const [which, value] of Object.entries(seen)) {
          if (!value) {
            throw new Error(
              `the shared form carries no ${which}: ${JSON.stringify(seen)}`,
            );
          }
          // Built once. Two addresses in one string is the whole fault, and
          // counting them says so without pinning what the address is.
          //
          // The SCHEME is what gets counted, not "http://": joining one address
          // onto another leaves the inner one with a single slash - the measured
          // value is ".../public/http:/127.0.0.1/..." - so looking for the
          // double slash finds one address in a string that plainly holds two.
          const addresses = value.match(/https?:/gi)?.length ?? 0;
          if (addresses !== 1) {
            throw new Error(
              `the shared form's ${which} carries ${addresses} addresses, expected one: ` +
                `${JSON.stringify(value)} - the address was worked out twice, once over the other`,
            );
          }
          if (!value.endsWith(config.storedPath)) {
            throw new Error(
              `the shared form's ${which} does not end at the stored path ` +
                `${JSON.stringify(config.storedPath)}: ${JSON.stringify(value)}`,
            );
          }
        }
        return { seen };
      },
    );

    return {
      details: { tableId, viewId, shareId, routing, ...probe },
    };
  } finally {
    if (tableId) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
