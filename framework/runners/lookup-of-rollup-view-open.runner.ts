import {
  Colors,
  FieldKeyType,
  FieldType,
  NumberFormattingType,
  Relationship,
  ViewType,
  isAnyOf,
} from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  createView as apiCreateView,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupOfRollupViewOpenCaseConfig } from "../types";

// Three tables in a chain - rate rows roll up into an employee's highest rate,
// and a payroll line looks that rate up - plus a view that filters on another
// looked-up column -> checkpoint: the payroll view opens and shows the line.
//
// Nothing here is damaged on purpose. Every column is made the way the field
// dialog makes it, and the shape is the ordinary one for a payroll sheet: the
// numbers live on their own rows, the employee carries the highest of them,
// and the payroll line borrows both that number and the employee's site so a
// view can be filtered by site.
//
// The chain still stopped working. A looked-up total is stored without the
// settings that say what it totals - the copy the lookup carries is enough to
// display it and not enough to load it - and the table it sits on cannot be
// loaded at all. The person sees a payroll view that will not open, with a
// message about a rule they never wrote.
//
// This is the same missing rule as the case that writes it with SQL
// (record/a-row-when-a-looked-up-total-lost-its-rule, T6911), reached instead
// by building the chain through the ordinary requests - which is why that case
// stays green on this fix's parent and this one does not.

const NAME_FIELD = "Name";
const SITE_FIELD = "Site";
const RATE_FIELD = "Rate";
const ROLLUP_FIELD = "Highest rate";

export const runLookupOfRollupViewOpenCase = async (
  bugCase: BugCaseFor<"lookup-of-rollup-view-open">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupOfRollupViewOpenCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.sites.length < 2) {
    throw new Error(
      "two sites at least - with one, a filter that kept everything and a filter that kept the right rows look the same",
    );
  }
  const keptSite = config.sites[0];

  try {
    // The employee, carrying the site the view will filter by.
    const employees = await createTable(baseId, {
      name: `${suffix}-employees`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: SITE_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: config.sites.map((site, index) => ({
              name: site,
              color: index === 0 ? Colors.BlueBright : Colors.OrangeBright,
            })),
          },
        },
      ],
      records: [
        {
          fields: { [NAME_FIELD]: config.employeeName, [SITE_FIELD]: keptSite },
        },
      ],
    });
    createdTableIds.unshift(employees.id);
    const employeeId = employees.records[0]?.id;
    const siteFieldId = employees.fields.find(
      (field: { name: string }) => field.name === SITE_FIELD,
    )?.id;
    if (!employeeId || !siteFieldId) {
      throw new Error("the employees table is not in place");
    }

    // The rate rows, one per change, and the link that gathers them.
    const rates = await createTable(baseId, {
      name: `${suffix}-rates`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(rates.id);
    const rateLink = await createField(rates.id, {
      name: "Employee",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: employees.id,
      },
    });
    const rateField = await createField(rates.id, {
      name: RATE_FIELD,
      type: FieldType.Number,
      options: {
        formatting: { type: NumberFormattingType.Decimal, precision: 2 },
      },
    });

    const employeeFields = await getFields(employees.id);
    const employeeSideLink = employeeFields.find(
      (field: { type: string }) => field.type === FieldType.Link,
    );
    if (!employeeSideLink) {
      throw new Error("the link put no column on the employees table");
    }

    // The middle of the chain: the employee's highest rate.
    const rollup = await createField(employees.id, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: {
        expression: "max({values})",
        formatting: { type: NumberFormattingType.Decimal, precision: 2 },
      },
      lookupOptions: {
        foreignTableId: rates.id,
        linkFieldId: employeeSideLink.id,
        lookupFieldId: rateField.id,
      },
    });

    await apiCreateRecords(rates.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [rates.fields[0].id]: `${config.employeeName}-rate`,
            [rateLink.id]: { id: employeeId },
            [rateField.id]: config.rate,
          },
        },
      ],
    });

    // Fixture verification, outside the checkpoint: the middle of the chain
    // works. If the employee's highest rate were not there, the payroll line
    // would have nothing to borrow and the checkpoint would be watching an
    // empty column rather than a table that will not load.
    const employeeRows = await apiGetRecords(employees.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const rolledUp = employeeRows.data.records.find(
      (record: { id: string }) => record.id === employeeId,
    )?.fields[rollup.id];
    if (Number(rolledUp) !== config.rate) {
      throw new Error(
        `the employee's highest rate reads ${JSON.stringify(rolledUp)}, expected ${config.rate} - the middle of the chain is not in place`,
      );
    }

    // The near end: payroll lines borrowing the employee's site and rate.
    const payroll = await createTable(baseId, {
      name: `${suffix}-payroll`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(payroll.id);
    const payrollLink = await createField(payroll.id, {
      name: "Employee",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: employees.id,
        isOneWay: true,
      },
    });
    const siteLookup = await createField(payroll.id, {
      name: SITE_FIELD,
      type: FieldType.SingleSelect,
      isLookup: true,
      lookupOptions: {
        foreignTableId: employees.id,
        linkFieldId: payrollLink.id,
        lookupFieldId: siteFieldId,
      },
    });

    // Everything from here is inside the checkpoint, because everything from
    // here is the symptom. The looked-up total is the column that cannot be
    // loaded, so the request that makes it, every request that follows on the
    // same table, and the view read at the end all belong to the report.
    const probe = await bugCheckpoint(
      "a-payroll-view-opens-over-a-looked-up-total",
      async () => {
        const rateLookup = await createField(payroll.id, {
          name: ROLLUP_FIELD,
          type: FieldType.Rollup,
          isLookup: true,
          options: {
            expression: "max({values})",
            formatting: { type: NumberFormattingType.Decimal, precision: 2 },
          },
          lookupOptions: {
            foreignTableId: employees.id,
            linkFieldId: payrollLink.id,
            lookupFieldId: rollup.id,
          },
        });

        const line = await apiCreateRecords(payroll.id, {
          fieldKeyType: FieldKeyType.Id,
          records: [
            {
              fields: {
                [payroll.fields[0].id]: config.payrollLineTitle,
                [payrollLink.id]: { id: employeeId },
              },
            },
          ],
        });
        const lineId = line.data.records[0]?.id;
        if (!lineId) {
          throw new Error("adding a payroll line returned no row");
        }

        // The view a person actually opens: filtered and sorted on the looked
        // up site.
        const view = await apiCreateView(payroll.id, {
          name: "Unpaid",
          type: ViewType.Grid,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: siteLookup.id,
                operator: isAnyOf.value,
                value: config.sites,
              },
            ],
          },
          sort: {
            sortObjs: [{ fieldId: siteLookup.id, order: "asc" }],
            manualSort: false,
          },
        });

        const opened = await apiGetRecords(payroll.id, {
          fieldKeyType: FieldKeyType.Id,
          viewId: view.data.id,
          take: 10,
        });
        if (opened.data.records.length !== 1) {
          throw new Error(
            `the payroll view lists ${opened.data.records.length} rows, expected 1`,
          );
        }
        const fields = opened.data.records[0].fields;
        if (Number(fields[rateLookup.id]) !== config.rate) {
          throw new Error(
            `the payroll line borrows a highest rate of ${JSON.stringify(fields[rateLookup.id])}, expected ${config.rate}`,
          );
        }
        if (fields[siteLookup.id] !== keptSite) {
          throw new Error(
            `the payroll line borrows a site of ${JSON.stringify(fields[siteLookup.id])}, expected ${JSON.stringify(keptSite)}`,
          );
        }
        return { viewId: view.data.id, lineId };
      },
    );

    return {
      details: {
        employeesTableId: employees.id,
        ratesTableId: rates.id,
        payrollTableId: payroll.id,
        viewId: probe.viewId,
        payrollLineId: probe.lineId,
        rate: config.rate,
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
