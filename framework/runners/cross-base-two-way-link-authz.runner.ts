import { FieldType, Relationship, Role } from "@teable/core";
import { emailBaseInvitation } from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import {
  createBase,
  createSpace,
  createTable,
  getFields,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  CrossBaseTwoWayLinkAuthzCaseConfig,
} from "../types";

// A space with two bases; a second person is Creator in one and only Viewer
// in the other -> as that person, create a two-way link from their base to a
// table in the base they can only view -> checkpoint: the request is refused
// with 403 and the viewed table's columns are exactly what they were.
//
// A two-way link writes a reciprocal column into the foreign table. Only the
// source table was authorized, so a Viewer of the foreign base could change
// that base's schema - add a column to a table they are not allowed to edit -
// just by linking to it. A one-way link writes nothing there and stays
// allowed; the case checks that first, so a fix that refused every cross-base
// link would not pass.

export const runCrossBaseTwoWayLinkAuthzCase = async (
  bugCase: BugCaseFor<"cross-base-two-way-link-authz">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CrossBaseTwoWayLinkAuthzCaseConfig = bugCase.config;
  const prefix = `${config.namePrefix}-${context.runId}`;
  let spaceId = "";

  try {
    spaceId = (await createSpace({ name: prefix })).id;
    const sourceBaseId = (
      await createBase({ spaceId, name: `${prefix}-editable` })
    ).id;
    const foreignBaseId = (
      await createBase({ spaceId, name: `${prefix}-view-only` })
    ).id;
    const source = await createTable(sourceBaseId, {
      name: "source",
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { Name: "source row" } }],
    });
    const foreign = await createTable(foreignBaseId, {
      name: "foreign",
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { Name: "foreign row" } }],
    });

    const email = `${prefix}@example.com`.toLowerCase();
    const person = await createNewUserAxios({ email, password: "12345678a" });
    await emailBaseInvitation({
      baseId: sourceBaseId,
      emailBaseInvitationRo: { emails: [email], role: Role.Creator },
    });
    await emailBaseInvitation({
      baseId: foreignBaseId,
      emailBaseInvitationRo: { emails: [email], role: Role.Viewer },
    });

    const foreignColumns = async () =>
      (await getFields(foreign.id))
        .map(({ id, name, type }) => `${id}:${name}:${type}`)
        .sort();
    const linkAs = (name: string, isOneWay: boolean) =>
      person.post(
        `/table/${source.id}/field`,
        {
          name,
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyMany,
            foreignTableId: foreign.id,
            baseId: foreignBaseId,
            isOneWay,
          },
        },
        { validateStatus: () => true },
      );

    // Control: a one-way link touches only the person's own base.
    const before = await foreignColumns();
    const oneWay = await linkAs("One-way link", true);
    if (oneWay.status !== 201 && oneWay.status !== 200) {
      throw new Error(
        `a Creator could not create a one-way link to a base they can view: ${oneWay.status} ${JSON.stringify(oneWay.data)}`,
      );
    }
    if (JSON.stringify(await foreignColumns()) !== JSON.stringify(before)) {
      throw new Error(
        "the one-way link added a column to the foreign table, so the fixture is not what the case expects",
      );
    }

    const probe = await bugCheckpoint(
      "a-viewer-cannot-add-a-column-through-a-two-way-link",
      async () => {
        const twoWay = await linkAs("Two-way link", false);
        const after = await foreignColumns();
        const added = after.filter((column) => !before.includes(column));
        if (twoWay.status !== 403 || added.length > 0) {
          throw new Error(
            `creating a two-way link into a base the person can only view answered ${twoWay.status}, expected 403` +
              (added.length > 0
                ? `; the viewed table gained ${JSON.stringify(added)}`
                : ""),
          );
        }
        return { status: twoWay.status };
      },
    );

    return { details: { spaceId, ...probe } };
  } finally {
    if (spaceId) {
      try {
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
