import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { axios, urlBuilder } from "@teable/openapi";
import { createField, createTable } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkPickerForeignScopeCaseConfig } from "../types";

// A link column, opened by somebody whose role narrows the rows of the table it
// points at -> search the picker for a record outside that narrowing ->
// checkpoint: the record is offered.
//
// A link column is a permission of its own: whoever may work in this table and
// use this column may pick from the records the column points at. That is what
// makes link columns usable at all - the people filling in a form of orders do
// not have to be given the customer table.
//
// The picker started applying the target table's own row scope as well. Two
// people with the same column in front of them saw different candidate lists,
// and the one whose role narrows that table saw an empty picker: the request
// answers 200 with nothing in it, so nothing on screen says why. The same
// record's title is still displayed in cells that already link to it, which is
// what makes this look like a search fault rather than a permission one.
//
// The control is the record inside their narrowing, searched first: a picker
// that finds nothing at all is broken in a different way.

const NAME_FIELD = "Name";
const SCOPE_FIELD = "Scope";
const LINK_FIELD = "Customer";
const SHARE_VIEW_RECORDS = "/share/{shareId}/view/records";

interface PickerRecord {
  id: string;
  fields: Record<string, unknown>;
}

export const runLinkPickerForeignScopeCase = async (
  bugCase: BugCaseFor<"link-picker-foreign-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkPickerForeignScopeCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let linkFieldId = "";
  let sourceRowId = "";

  try {
    person = await withRestrictedPerson({
      namePrefix: config.namePrefix,
      runId: context.runId,
      buildTables: async (baseId) => {
        const targets = await createTable(baseId, {
          name: `${suffix}-customers`,
          fields: [
            {
              name: NAME_FIELD,
              type: FieldType.SingleLineText,
              isPrimary: true,
            },
            { name: SCOPE_FIELD, type: FieldType.SingleLineText },
          ],
          records: [
            {
              fields: {
                [NAME_FIELD]: config.inScopeName,
                [SCOPE_FIELD]: config.visibleScope,
              },
            },
            {
              fields: {
                [NAME_FIELD]: config.outOfScopeName,
                [SCOPE_FIELD]: config.hiddenScope,
              },
            },
          ],
        });
        const scopeFieldId = targets.fields.find(
          (field: { name: string }) => field.name === SCOPE_FIELD,
        )?.id as string;

        const orders = await createTable(baseId, {
          name: `${suffix}-orders`,
          fields: [
            {
              name: NAME_FIELD,
              type: FieldType.SingleLineText,
              isPrimary: true,
            },
          ],
          records: [{ fields: { [NAME_FIELD]: config.sourceRowName } }],
        });
        sourceRowId = orders.records?.[0]?.id as string;
        const link = await createField(orders.id, {
          name: LINK_FIELD,
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyOne,
            foreignTableId: targets.id,
          },
        });
        linkFieldId = link.id;

        // The person may work in the orders table without limits, and their
        // role narrows which customers they may read. The link column is the
        // thing that is supposed to reach past that narrowing.
        return [
          { tableId: orders.id, disabledActions: [] },
          {
            tableId: targets.id,
            disabledActions: [],
            recordFilter: {
              conjunction: "and",
              filterSet: [
                {
                  fieldId: scopeFieldId,
                  operator: "is",
                  value: config.visibleScope,
                },
              ],
            },
          },
        ];
      },
    });

    const searchPickerAs = (
      client: typeof person extends undefined
        ? never
        : NonNullable<typeof person>["axios"],
      term: string,
    ) =>
      client.get<{ records?: PickerRecord[] }>(
        urlBuilder(SHARE_VIEW_RECORDS, { shareId: linkFieldId }),
        {
          params: {
            fieldKeyType: FieldKeyType.Id,
            take: 20,
            search: [term, "", true],
            filterLinkCellCandidate: [linkFieldId, sourceRowId],
          },
          validateStatus: () => true,
        },
      );

    const namesOffered = (data: { records?: PickerRecord[] }) =>
      (data.records ?? []).map((record) =>
        String(Object.values(record.fields)[0] ?? ""),
      );

    // Fixture verification, outside the checkpoint, and asked as the OWNER
    // rather than as the restricted person: the picker exists, reaches the
    // customers table, and offers both of them. Asking the restricted person
    // here would be asking the question the checkpoint asks - and on the
    // fix's parent their picker is empty for both customers, which would be
    // reported as a broken fixture rather than as the bug (run 34581492782).
    const asOwner = await searchPickerAs(axios, config.inScopeName);
    if (asOwner.status !== 200) {
      throw new Error(
        `the picker answers ${asOwner.status} for the base's owner: ${JSON.stringify(asOwner.data)}`,
      );
    }
    const routing = pickRoutingHeaders(asOwner.headers);
    const ownerNames = namesOffered(asOwner.data);
    if (!ownerNames.some((name) => name.includes(config.inScopeName))) {
      throw new Error(
        `the owner's picker offered ${JSON.stringify(ownerNames)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-link-picker-offers-what-the-column-points-at",
      async () => {
        // Both customers, because the fault empties the picker rather than
        // filtering it: the one inside this person's narrowing says whether
        // the picker works for them at all, and the one outside it is what the
        // column is for.
        const missing: { asked: string; offered: string[] }[] = [];
        const seen: Record<string, string[]> = {};
        for (const asked of [config.inScopeName, config.outOfScopeName]) {
          const searched = await searchPickerAs(person!.axios, asked);
          if (searched.status !== 200) {
            throw new Error(
              `the picker answers ${searched.status} for the restricted person: ${JSON.stringify(searched.data)}`,
            );
          }
          const offered = namesOffered(searched.data);
          seen[asked] = offered;
          if (!offered.some((name) => name.includes(asked))) {
            missing.push({ asked, offered });
          }
        }
        if (missing.length > 0) {
          throw new Error(
            `the restricted person's picker offered nothing for ${JSON.stringify(missing)} - the column points at ` +
              "those customers and they may use the column, but their own narrowing of the customer table is " +
              "being applied to the picker, so the list comes back empty with nothing on screen to say why",
          );
        }
        return { offered: seen };
      },
    );

    return {
      details: {
        linkFieldId,
        sourceRowId,
        ownerNames,
        offered: probe.offered,
        routing,
      },
    };
  } finally {
    if (person) {
      try {
        await person.cleanUp();
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
