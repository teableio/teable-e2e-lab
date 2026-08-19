import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "@teable/db-main-prisma";
import { isInsideCheckpoint } from "./checkpoint";

/**
 * Direct database access, for building fixtures the public API cannot express.
 *
 * Some bugs only exist over state a user reaches by living with their base for
 * months: a stored snapshot written before a collaborator changed their
 * avatar, a column whose metadata drifted from its physical type, a row whose
 * foreign key was cleared by a path that no longer exists. Asking a case to
 * reach those states through the API alone means either not collecting the bug
 * at all, or spending the fixture on a re-enactment so elaborate that the case
 * breaks for reasons unrelated to the product.
 *
 * So the database is available — for SETUP ONLY. The observation still goes
 * through the public API, because the failure a user reports is always
 * something the API did: a 500, a wrong row order, a value that came back
 * missing. That split is what keeps a case's conclusion meaningful. A case
 * that both writes and reads the database proves something about SQL, not
 * about the product.
 *
 * The rule is enforced rather than documented: asking for a handle inside a
 * `bugCheckpoint()` throws. Setup failures are already error verdicts (💥), so
 * a case that reaches for the database in the wrong place is reported as a
 * broken case, never as a reproduced bug.
 */

// The handle is teable-ee's own PrismaService, pulled off the running test
// application - the same client the product writes through, so a fixture can
// never diverge from the schema the code under test sees. What a case needs
// off it is small and stable: raw SQL, plus the two metadata lookups that
// translate a public id into the physical name it was given.
interface FixtureDbClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  tableMeta: {
    findUniqueOrThrow(args: {
      where: { id: string };
      select: { dbTableName: true };
    }): Promise<{ dbTableName: string }>;
  };
  field: {
    findUniqueOrThrow(args: {
      where: { id: string };
      select: { dbFieldName: true };
    }): Promise<{ dbFieldName: string }>;
  };
}

export interface FixtureDb {
  // Physical schema and table behind a public table id.
  physicalTable(tableId: string): Promise<{ schema: string; table: string }>;
  // Physical column name behind a public field id.
  physicalColumn(fieldId: string): Promise<string>;
  // Parameterised write. Identifiers cannot be parameters in SQL, so callers
  // interpolate the names they got from the two lookups above and pass every
  // VALUE as a parameter.
  execute(query: string, ...values: unknown[]): Promise<number>;
  query<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

const assertOutsideCheckpoint = () => {
  if (isInsideCheckpoint()) {
    throw new Error(
      "fixture database access is setup-only and was reached inside a bugCheckpoint(); " +
        "observe the bug through the public API instead",
    );
  }
};

export const fixtureDb = (app: INestApplication): FixtureDb => {
  assertOutsideCheckpoint();
  const client = app.get(PrismaService) as unknown as FixtureDbClient;
  if (!client) {
    throw new Error("PrismaService is not available on the test application");
  }

  return {
    async physicalTable(tableId) {
      assertOutsideCheckpoint();
      const { dbTableName } = await client.tableMeta.findUniqueOrThrow({
        where: { id: tableId },
        select: { dbTableName: true },
      });
      const [schema, table] = dbTableName.split(".");
      if (!schema || !table) {
        throw new Error(
          `Unexpected dbTableName for ${tableId}: ${dbTableName}`,
        );
      }
      return { schema, table };
    },
    async physicalColumn(fieldId) {
      assertOutsideCheckpoint();
      const { dbFieldName } = await client.field.findUniqueOrThrow({
        where: { id: fieldId },
        select: { dbFieldName: true },
      });
      return dbFieldName;
    },
    async execute(query, ...values) {
      assertOutsideCheckpoint();
      return client.$executeRawUnsafe(query, ...values);
    },
    async query(query, ...values) {
      assertOutsideCheckpoint();
      return client.$queryRawUnsafe(query, ...values);
    },
  };
};
