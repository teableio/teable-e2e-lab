import { FieldKeyType, FieldType, SortFunc, ViewType } from "@teable/core";
import type { IRecordsVo, IUserMeVo } from "@teable/openapi";
import {
  axios,
  createView,
  GET_RECORDS_URL,
  USER_ME,
  urlBuilder,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

const TITLE_FIELD = "Name";
const DATE_FIELD = "ChangedAt";

export const runAuthorityPersistedViewQueryCase = async (
  bugCase: BugCaseFor<"authority-persisted-view-query">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";
  let matrixEnabled = false;

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: DATE_FIELD, type: FieldType.Date },
      ],
      records: [
        {
          fields: {
            [TITLE_FIELD]: "alpha",
            [DATE_FIELD]: "2025-01-01T00:00:00.000Z",
          },
        },
        {
          fields: {
            [TITLE_FIELD]: "beta",
            [DATE_FIELD]: "2025-01-03T00:00:00.000Z",
          },
        },
        {
          fields: {
            [TITLE_FIELD]: "gamma",
            [DATE_FIELD]: "2025-01-02T00:00:00.000Z",
          },
        },
      ],
    });
    tableId = table.id;
    const titleField = table.fields.find((field) => field.name === TITLE_FIELD);
    const dateField = table.fields.find((field) => field.name === DATE_FIELD);
    if (!titleField || !dateField || !table.defaultViewId) {
      throw new Error("the persisted-view authority fixture is incomplete");
    }
    const sortedView = (
      await createView(tableId, {
        name: "Saved personal sort",
        type: ViewType.Grid,
        sort: { sortObjs: [{ fieldId: dateField.id, order: SortFunc.Desc }] },
      })
    ).data;

    const readerAxios = await createNewUserAxios({
      email: `${config.tableNamePrefix}-${context.runId}@example.com`,
      password: "12345678a",
    });
    const reader = (await readerAxios.get<IUserMeVo>(USER_ME)).data;
    await axios.patch(`/base/${baseId}/authority-matrix/status`, {
      enabled: true,
    });
    matrixEnabled = true;
    const role = await axios
      .post<{ id: string }>(`/base/${baseId}/authority-matrix-role`, {
        name: `view-reader-${context.runId}`,
        enabled: true,
        tables: [
          {
            enabled: true,
            tableId,
            disabledActions: [],
            recordFilter: {
              conjunction: "and",
              filterSet: [
                { fieldId: titleField.id, operator: "isNot", value: "beta" },
              ],
            },
          },
        ],
      })
      .then((response) => response.data);
    await axios.patch(`/base/${baseId}/authority-matrix-role/${role.id}/user`, {
      userIds: [reader.id],
    });

    const ownerRows = await axios.get<IRecordsVo>(
      urlBuilder(GET_RECORDS_URL, { tableId }),
      {
        params: { fieldKeyType: FieldKeyType.Name, take: 10 },
      },
    );
    if (ownerRows.data.records.length !== 3) {
      throw new Error(
        "the owner cannot read all three control rows before the restricted read",
      );
    }

    const probe = await bugCheckpoint(
      "saved-restricted-view-query-does-not-break-other-views",
      async () => {
        const savedSort = await readerAxios.get<IRecordsVo>(
          urlBuilder(GET_RECORDS_URL, { tableId }),
          {
            params: {
              fieldKeyType: FieldKeyType.Name,
              viewId: sortedView.id,
              ignoreViewQuery: true,
              orderBy: JSON.stringify(sortedView.sort?.sortObjs ?? []),
              includeQueryExtra: true,
            },
          },
        );
        const sortedRouting = assertServedByV2(savedSort.headers, {
          operation: "GET /table/{tableId}/record with a saved view sort",
          feature: "getRecords",
        });
        const sortedNames = savedSort.data.records.map((record) =>
          String(record.fields[TITLE_FIELD]),
        );
        if (sortedNames.join(",") !== "gamma,alpha") {
          throw new Error(
            `the restricted saved view returned ${JSON.stringify(sortedNames)}`,
          );
        }

        const publicView = await readerAxios.get<IRecordsVo>(
          urlBuilder(GET_RECORDS_URL, { tableId }),
          {
            params: {
              fieldKeyType: FieldKeyType.Name,
              viewId: table.defaultViewId,
              take: 10,
            },
          },
        );
        const publicRouting = assertServedByV2(publicView.headers, {
          operation: "GET /table/{tableId}/record through the public view",
          feature: "getRecords",
        });
        const publicNames = publicView.data.records
          .map((record) => String(record.fields[TITLE_FIELD]))
          .sort();
        if (publicNames.join(",") !== "alpha,gamma") {
          throw new Error(
            `the public view returned ${JSON.stringify(publicNames)}`,
          );
        }

        return { sortedNames, publicNames, sortedRouting, publicRouting };
      },
    );

    return {
      details: {
        tableId,
        readerId: reader.id,
        sortedViewId: sortedView.id,
        publicViewId: table.defaultViewId,
        ...probe,
      },
    };
  } finally {
    if (matrixEnabled) {
      await axios
        .patch(`/base/${baseId}/authority-matrix/status`, { enabled: false })
        .catch(() => undefined);
    }
    if (tableId)
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
  }
};
