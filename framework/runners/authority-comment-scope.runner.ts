import { FieldKeyType, FieldType } from "@teable/core";
import type { ICommentVo, IGetCommentListVo, IUserMeVo } from "@teable/openapi";
import {
  axios,
  CommentNodeType,
  CREATE_COMMENT,
  GET_COMMENT_LIST,
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

const content = (value: string) => [
  {
    type: CommentNodeType.Paragraph,
    children: [{ type: CommentNodeType.Text, value }],
  },
];

export const runAuthorityCommentScopeCase = async (
  bugCase: BugCaseFor<"authority-comment-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const { tableNamePrefix, allowedTitle, deniedTitle, commentText } =
    bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";
  let matrixEnabled = false;

  try {
    const table = await createTable(baseId, {
      name: `${tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [TITLE_FIELD]: allowedTitle } },
        { fields: { [TITLE_FIELD]: deniedTitle } },
      ],
    });
    tableId = table.id;
    const titleField = table.fields.find((field) => field.name === TITLE_FIELD);
    const allowedRecord = table.records[0];
    const deniedRecord = table.records[1];
    if (!titleField || !allowedRecord || !deniedRecord) {
      throw new Error("the authority comment fixture is incomplete");
    }

    const readerAxios = await createNewUserAxios({
      email: `${tableNamePrefix}-${context.runId}@example.com`,
      password: "12345678a",
    });
    const reader = (await readerAxios.get<IUserMeVo>(USER_ME)).data;

    await axios.patch(`/base/${baseId}/authority-matrix/status`, {
      enabled: true,
    });
    matrixEnabled = true;
    const role = await axios
      .post<{ id: string }>(`/base/${baseId}/authority-matrix-role`, {
        name: `comment-reader-${context.runId}`,
        enabled: true,
        tables: [
          {
            enabled: true,
            tableId,
            disabledActions: [],
            recordFilter: {
              conjunction: "and",
              filterSet: [
                { fieldId: titleField.id, operator: "is", value: allowedTitle },
              ],
            },
          },
        ],
      })
      .then((response) => response.data);
    await axios.patch(`/base/${baseId}/authority-matrix-role/${role.id}/user`, {
      userIds: [reader.id],
    });

    const scopedRead = await readerAxios.get(
      GET_RECORDS_URL.replace("{tableId}", tableId),
      {
        params: { fieldKeyType: FieldKeyType.Name },
      },
    );
    const fixtureRouting = assertServedByV2(scopedRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const visibleIds = scopedRead.data.records.map(
      (record: { id: string }) => record.id,
    );
    if (visibleIds.join(",") !== allowedRecord.id) {
      throw new Error(
        `the restricted member can see ${JSON.stringify(visibleIds)}, expected only ${allowedRecord.id}`,
      );
    }

    const probe = await bugCheckpoint(
      "comments-stay-inside-the-authorized-record-scope",
      async () => {
        const created = await readerAxios.post<ICommentVo>(
          urlBuilder(CREATE_COMMENT, { tableId, recordId: allowedRecord.id }),
          { content: content(commentText), quoteId: null },
        );
        if (created.status !== 201) {
          throw new Error(
            `commenting on the authorized record answered ${created.status}`,
          );
        }
        const allowedList = await readerAxios.get<IGetCommentListVo>(
          urlBuilder(GET_COMMENT_LIST, { tableId, recordId: allowedRecord.id }),
        );
        if (
          !allowedList.data.comments.some(
            (comment) => comment.id === created.data.id,
          )
        ) {
          throw new Error(
            "the authorized comment was accepted but is absent from its record",
          );
        }

        const denied = await readerAxios.post(
          urlBuilder(CREATE_COMMENT, { tableId, recordId: deniedRecord.id }),
          { content: content("must-not-land"), quoteId: null },
          { validateStatus: () => true },
        );
        if (denied.status !== 403 && denied.status !== 404) {
          throw new Error(
            `commenting on the unauthorized record answered ${denied.status}`,
          );
        }
        const deniedList = await axios.get<IGetCommentListVo>(
          urlBuilder(GET_COMMENT_LIST, { tableId, recordId: deniedRecord.id }),
        );
        if (deniedList.data.comments.length !== 0) {
          throw new Error(
            "the rejected comment still created data on the unauthorized record",
          );
        }

        return { commentId: created.data.id, deniedStatus: denied.status };
      },
    );

    return {
      details: {
        tableId,
        readerId: reader.id,
        allowedRecordId: allowedRecord.id,
        deniedRecordId: deniedRecord.id,
        fixtureRouting,
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
