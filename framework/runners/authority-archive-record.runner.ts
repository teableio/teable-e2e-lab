import { FieldKeyType, FieldType, SortFunc, ViewType } from "@teable/core";
import type {
  IArchiveRecordsVo,
  IRecordsVo,
  IRowCountVo,
  IUserMeVo,
} from "@teable/openapi";
import {
  ARCHIVE_RECORDS,
  axios,
  createView,
  GET_RECORDS_URL,
  GET_ROW_COUNT,
  GroupPointType,
  USER_ME,
  urlBuilder,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

const NAME_FIELD = "Name";
const GROUP_FIELD = "Group";

export const runAuthorityArchiveRecordCase = async (
  bugCase: BugCaseFor<"authority-archive-record">,
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
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: GROUP_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "archive-me",
            [GROUP_FIELD]: "visible-group",
          },
        },
        { fields: { [NAME_FIELD]: "keep-me", [GROUP_FIELD]: "visible-group" } },
        {
          fields: {
            [NAME_FIELD]: "hidden-control",
            [GROUP_FIELD]: "hidden-group",
          },
        },
      ],
    });
    tableId = table.id;
    const nameField = table.fields.find((field) => field.name === NAME_FIELD);
    const groupField = table.fields.find((field) => field.name === GROUP_FIELD);
    const [target, survivor, hidden] = table.records;
    if (!nameField || !groupField || !target || !survivor || !hidden) {
      throw new Error("the authority archive fixture is incomplete");
    }
    const view = (
      await createView(tableId, {
        name: "Grouped and sorted",
        type: ViewType.Grid,
        group: [{ fieldId: groupField.id, order: SortFunc.Asc }],
        sort: { sortObjs: [{ fieldId: nameField.id, order: SortFunc.Desc }] },
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
        name: `archive-member-${context.runId}`,
        enabled: true,
        tables: [
          {
            enabled: true,
            tableId,
            disabledActions: ["record|delete"],
            recordFilter: {
              conjunction: "and",
              filterSet: [
                {
                  fieldId: groupField.id,
                  operator: "is",
                  value: "visible-group",
                },
              ],
            },
          },
        ],
      })
      .then((response) => response.data);
    await axios.patch(`/base/${baseId}/authority-matrix-role/${role.id}/user`, {
      userIds: [reader.id],
    });

    const read = () =>
      readerAxios.get<IRecordsVo>(urlBuilder(GET_RECORDS_URL, { tableId }), {
        params: {
          fieldKeyType: FieldKeyType.Name,
          viewId: view.id,
          groupBy: JSON.stringify(view.group ?? []),
          includeQueryExtra: true,
          take: 10,
        },
      });
    const before = await read();
    const beforeIds = before.data.records.map((record) => record.id);
    if (beforeIds.join(",") !== [survivor.id, target.id].join(",")) {
      throw new Error(
        `the grouped, sorted restricted fixture returned ${JSON.stringify(beforeIds)}`,
      );
    }
    const beforeHeaders = (before.data.extra?.groupPoints ?? []).filter(
      (point) => point.type === GroupPointType.Header,
    );
    if (
      beforeHeaders.length !== 1 ||
      beforeHeaders[0]?.value !== "visible-group"
    ) {
      throw new Error(
        "the restricted fixture did not expose exactly its authorized group",
      );
    }

    const probe = await bugCheckpoint(
      "authorized-archive-updates-the-active-group",
      async () => {
        const archived = await readerAxios.post<IArchiveRecordsVo>(
          urlBuilder(ARCHIVE_RECORDS, { tableId }),
          { recordIds: [target.id] },
          { validateStatus: () => true },
        );
        if (
          archived.status !== 201 ||
          archived.data.archivedRecordIds?.join(",") !== target.id
        ) {
          throw new Error(
            `archiving the authorized record answered ${archived.status}: ${JSON.stringify(archived.data)}`,
          );
        }

        const after = await read();
        const routing = assertServedByV2(after.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const remainingIds = after.data.records.map((record) => record.id);
        if (remainingIds.join(",") !== survivor.id) {
          throw new Error(
            `the active view kept ${JSON.stringify(remainingIds)}, expected only the survivor`,
          );
        }
        const headers = (after.data.extra?.groupPoints ?? []).filter(
          (point) => point.type === GroupPointType.Header,
        );
        if (headers.length !== 1 || headers[0]?.value !== "visible-group") {
          throw new Error(
            "the remaining authorized group header is missing or leaked another group",
          );
        }
        const counted = await readerAxios.get<IRowCountVo>(
          urlBuilder(GET_ROW_COUNT, { tableId }),
          {
            params: { viewId: view.id },
          },
        );
        if (counted.data.rowCount !== 1) {
          throw new Error(
            `row-count returned ${counted.data.rowCount}, expected 1 after archive`,
          );
        }
        return {
          remainingIds,
          rowCount: counted.data.rowCount,
          groupValues: headers.map((point) => point.value),
          routing,
        };
      },
    );

    return {
      details: {
        tableId,
        viewId: view.id,
        targetRecordId: target.id,
        survivorRecordId: survivor.id,
        hiddenControlRecordId: hidden.id,
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
