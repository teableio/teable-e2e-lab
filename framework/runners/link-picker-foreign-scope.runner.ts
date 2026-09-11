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

    const searchPicker = (term: string) =>
      person!.axios.get<{ records?: PickerRecord[] }>(
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

    // Fixture verification, outside the checkpoint: the picker opens for this
    // person and offers the customer inside their narrowing. A picker that
    // answers nothing at all is broken in a different way, and the checkpoint
    // below could not tell the two apart.
    const control = await searchPicker(config.inScopeName);
    if (control.status !== 200) {
      throw new Error(
        `the picker answers ${control.status} for the restricted person: ${JSON.stringify(control.data)}`,
      );
    }
    const routing = pickRoutingHeaders(control.headers);
    const controlNames = (control.data.records ?? []).map((record) =>
      String(Object.values(record.fields)[0] ?? ""),
    );
    if (!controlNames.some((name) => name.includes(config.inScopeName))) {
      throw new Error(
        `searching the picker for ${JSON.stringify(config.inScopeName)} offered ${JSON.stringify(controlNames)} - ` +
          "the fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-link-picker-offers-what-the-column-points-at",
      async () => {
        const searched = await searchPicker(config.outOfScopeName);
        if (searched.status !== 200) {
          throw new Error(
            `the picker answers ${searched.status} for a customer outside the person's row scope: ` +
              JSON.stringify(searched.data),
          );
        }
        const offered = (searched.data.records ?? []).map((record) =>
          String(Object.values(record.fields)[0] ?? ""),
        );
        if (!offered.some((name) => name.includes(config.outOfScopeName))) {
          throw new Error(
            `the picker offered ${JSON.stringify(offered)} when asked for ${JSON.stringify(config.outOfScopeName)} - ` +
              "the column points at that customer and the person may use the column, but their own narrowing of " +
              "the customer table is being applied to the picker, so the list comes back empty with nothing on " +
              "screen to say why",
          );
        }
        return { offered };
      },
    );

    return {
      details: {
        linkFieldId,
        sourceRowId,
        controlNames,
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
