import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupMultiplicityVoCaseConfig } from "../types";

// A column borrowing the people column from several linked rows -> read what
// the product says that column is -> checkpoint: it says the column holds
// several people, and the cell holds several.
//
// A column that borrows from a one-to-many link necessarily holds a list: one
// row here reaches many rows there, so it borrows many values. The product
// describes each column to whatever is drawing it, and that description is
// where "this one holds a list" lives.
//
// The description said one. The grid then drew a list of people as if it were
// a single person, and the cell went blank on the next refresh - not the
// stored value, which was there the whole time, just what was drawn. Nothing a
// person does brings it back, because nothing they can see is wrong.
//
// So the case reads two things: what the product says the column is, and what
// the cell comes back as. A case that only read the cell would pass over the
// wrong description, and the description is what the drawing follows.

const NAME_FIELD = "Name";
const PEOPLE_FIELD = "People";
const BORROWED_FIELD = "People, borrowed";

export const runLookupMultiplicityVoCase = async (
  bugCase: BugCaseFor<"lookup-multiplicity-vo">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupMultiplicityVoCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.linkedRowNames.length < 2) {
    throw new Error(
      "two linked rows at least - with one, a column that holds a list and a column that holds one value come back the same",
    );
  }

  try {
    // The rows carrying the people.
    const staff = await createTable(baseId, {
      name: `${suffix}-staff`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: PEOPLE_FIELD,
          type: FieldType.User,
          options: { isMultiple: false, shouldNotify: false },
        },
      ],
      records: [],
    });
    createdTableIds.unshift(staff.id);
    const peopleFieldId = staff.fields.find(
      (field: { name: string }) => field.name === PEOPLE_FIELD,
    )?.id;
    if (!peopleFieldId) {
      throw new Error("the staff table is not in place");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowName } }],
    });
    createdTableIds.unshift(host.id);
    const hostRowId = host.records?.[0]?.id;
    if (!hostRowId) {
      throw new Error("the host table is not in place");
    }

    // One row here reaching many rows there - which is what makes the borrowed
    // column a list.
    const link = await createField(host.id, {
      name: "Staff",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: staff.id,
      },
    });

    await apiCreateRecords(staff.id, {
      fieldKeyType: FieldKeyType.Id,
      records: config.linkedRowNames.map((name) => ({
        fields: {
          [staff.fields[0].id]: name,
          [peopleFieldId]: {
            // A user cell is written with both parts; sending only the id is
            // rejected on the title.
            id: globalThis.testConfig.userId,
            title: globalThis.testConfig.userName,
          },
        },
      })),
    });
    const staffRows = await apiGetRecords(staff.id, {
      fieldKeyType: FieldKeyType.Id,
      take: config.linkedRowNames.length,
    });
    const staffIds = staffRows.data.records.map(
      (record: { id: string }) => record.id,
    );
    if (staffIds.length !== config.linkedRowNames.length) {
      throw new Error(
        `${staffIds.length} of ${config.linkedRowNames.length} staff rows landed`,
      );
    }
    await apiUpdateRecord(host.id, hostRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: { [link.id]: staffIds.map((id: string) => ({ id })) },
      },
    });

    const borrowed = await createField(host.id, {
      name: BORROWED_FIELD,
      type: FieldType.User,
      isLookup: true,
      lookupOptions: {
        foreignTableId: staff.id,
        linkFieldId: link.id,
        lookupFieldId: peopleFieldId,
      },
    });

    // Fixture verification, outside the checkpoint: the host row really
    // reaches every staff row. Without that, one borrowed value would be the
    // correct answer and the case would be asserting the wrong thing.
    const hostRows = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const linkCell = hostRows.data.records.find(
      (record: { id: string }) => record.id === hostRowId,
    )?.fields[link.id];
    const linkedCount = Array.isArray(linkCell) ? linkCell.length : 0;
    if (linkedCount !== config.linkedRowNames.length) {
      throw new Error(
        `the host row reaches ${linkedCount} staff rows, expected ${config.linkedRowNames.length} - the link is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-borrowed-people-column-says-it-holds-several",
      async () => {
        const described = await getField(host.id, borrowed.id);
        if (described.isMultipleCellValue !== true) {
          throw new Error(
            `the product describes the borrowed column as holding ${JSON.stringify(described.isMultipleCellValue)}, expected several - ` +
              "one row here reaches several rows there, and whatever draws the column follows this description",
          );
        }

        const read = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 5,
        });
        const cell = read.data.records.find(
          (record: { id: string }) => record.id === hostRowId,
        )?.fields[borrowed.id];
        if (!Array.isArray(cell)) {
          throw new Error(
            `the borrowed cell came back as ${JSON.stringify(cell)}, expected a list of people`,
          );
        }
        if (cell.length !== config.linkedRowNames.length) {
          throw new Error(
            `the borrowed cell holds ${cell.length} people, expected ${config.linkedRowNames.length}`,
          );
        }
        return {
          describedAs: described.isMultipleCellValue,
          held: cell.length,
        };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        staffTableId: staff.id,
        borrowedFieldId: borrowed.id,
        describedAsMultiple: probe.describedAs,
        peopleInCell: probe.held,
      },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
