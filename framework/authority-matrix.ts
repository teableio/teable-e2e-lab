import { Role } from "@teable/core";
import {
  axios,
  createBase as apiCreateBase,
  createSpace as apiCreateSpace,
  deleteSpace,
  permanentDeleteSpace,
  EMAIL_SPACE_INVITATION,
  urlBuilder,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../utils/axios-instance/new-user";
import { isInsideCheckpoint } from "./checkpoint";

/**
 * A base with the authority matrix on, and a signed-in person it restricts.
 *
 * Several reported bugs are only visible to somebody the matrix limits: a
 * column they may not read, a row outside their filter, an action their role
 * withholds. Every one of them needs the same three things standing up together
 * - the matrix enabled on a base, a role that withholds something, and a second
 * person holding that role - and none of it is state the ordinary test user can
 * observe, because the person who owns a base is not restricted by its matrix.
 *
 * That setup is bigger than any single case wants to carry, and building it
 * four times would be four chances to build it subtly differently. So it lives
 * here, once.
 *
 * SETUP ONLY, like framework/fixture-db.ts and for the same reason: the
 * restricted person's own requests are the observation, but standing them up is
 * not. Asking for this inside a `bugCheckpoint()` throws.
 *
 * Everything goes through public endpoints - the same ones the product's own
 * settings screens call - so nothing here depends on internals that move. The
 * URL strings are literals rather than imports from the enterprise client
 * package, because a case runs against teable-ee revisions weeks apart and a
 * moved export would break the case everywhere instead of failing honestly on
 * the one commit that moved it.
 */

const UPDATE_AUTHORITY_MATRIX_STATUS = "/base/{baseId}/authority-matrix/status";
const ADD_AUTHORITY_MATRIX_ROLE = "/base/{baseId}/authority-matrix-role";
const UPDATE_AUTHORITY_MATRIX_ROLE_USER =
  "/base/{baseId}/authority-matrix-role/{authorityMatrixRoleId}/user";

// What a role withholds, per table. The shape the product's own role editor
// posts: actions withheld across the table, rows the role can see at all, and
// per-column withholding.
export interface RestrictedTableRule {
  tableId: string;
  // e.g. ["record|delete"]. Withheld across the whole table.
  disabledActions?: string[];
  // Rows the role may see. Omitted means every row.
  recordFilter?: {
    conjunction: "and" | "or";
    filterSet: { fieldId: string; operator: string; value: unknown }[];
  };
  // Columns the role may not read, write or fill in.
  fieldRecordPermission?: {
    fieldId: string;
    disabledActions: string[];
  }[];
}

// The signed-in client, taken from the helper that makes it rather than from a
// bare "axios" import: the type checker stubs this repository's cross-repo
// imports by name, and a package it has no stub for fails the check.
type SignedInClient = Awaited<ReturnType<typeof createNewUserAxios>>;

export interface RestrictedPerson {
  // How they got in, carried through so a case can say so in its report.
  join: "editor" | "throughTheRoleAlone";
  // Signed in as the restricted person. Their requests are the observation.
  axios: SignedInClient;
  userId: string;
  email: string;
  spaceId: string;
  baseId: string;
  roleId: string;
  // Tears down the space, the base and everything in them.
  cleanUp: () => Promise<void>;
}

// One address for the whole lab. The person is identified by it across runs;
// what they are allowed to do is a property of the role in a base, and every
// case builds its own base, so nothing is shared between cases but the name.
const RESTRICTED_EMAIL = "e2e-lab-restricted-reader@example.com";
const RESTRICTED_PASSWORD = "12345678a";

/**
 * Stand up a base with the matrix on and a second person restricted by it.
 *
 * `buildTables` is called with the new base id, as the OWNER, and returns the
 * rules for the restricted person's role. Tables have to exist before a role
 * can withhold anything in them, which is why it is a callback rather than an
 * argument.
 */
export const withRestrictedPerson = async (options: {
  namePrefix: string;
  runId: string;
  buildTables: (baseId: string) => Promise<RestrictedTableRule[]>;
  // How the person gets into the space. "editor" invites them first, which is
  // the ordinary shape: somebody already working in the space, further limited
  // by a role. "throughTheRoleAlone" invites nobody - being given the role is
  // what joins them, and it joins them as a Viewer. That difference is not
  // cosmetic: a Viewer's base role withholds things a role may grant, and bugs
  // have lived exactly in the gap between the two.
  join?: "editor" | "throughTheRoleAlone";
}): Promise<RestrictedPerson> => {
  if (isInsideCheckpoint()) {
    throw new Error(
      "the authority matrix is fixture, not observation: build it before bugCheckpoint(), " +
        "and make only the restricted person's requests inside it",
    );
  }

  const suffix = `${options.namePrefix}-${options.runId}`;
  let spaceId = "";

  const cleanUp = async () => {
    if (!spaceId) {
      return;
    }
    await deleteSpace(spaceId);
    await permanentDeleteSpace(spaceId);
  };

  try {
    // The owner's own space and base. It must not be the seed base: turning the
    // matrix on changes what every other case reading that base can see.
    const space = await apiCreateSpace({ name: suffix });
    spaceId = space.data.id;
    const base = await apiCreateBase({ spaceId, name: `${suffix}-base` });
    const baseId = base.data.id;

    // The second person. Signing up is idempotent - the helper signs in when
    // the address is taken - so runs share an identity and nothing else.
    const personAxios = await createNewUserAxios({
      email: RESTRICTED_EMAIL,
      password: RESTRICTED_PASSWORD,
    });
    const userId = (await personAxios.get(USER_ME)).data.id as string;

    // Into the space as an ordinary editor, unless the case wants the person to
    // arrive through the role alone. Never as an administrator of the matrix:
    // an administrator is exempt from it, and this whole fixture exists to
    // produce somebody who is not.
    if ((options.join ?? "editor") === "editor") {
      await axios.post(urlBuilder(EMAIL_SPACE_INVITATION, { spaceId }), {
        role: Role.Editor,
        emails: [RESTRICTED_EMAIL],
      });
    }

    await axios.patch(urlBuilder(UPDATE_AUTHORITY_MATRIX_STATUS, { baseId }), {
      enabled: true,
    });

    const tables = await options.buildTables(baseId);
    if (tables.length === 0) {
      throw new Error(
        "a role that withholds nothing restricts nobody - build at least one table rule",
      );
    }

    const role = await axios.post(
      urlBuilder(ADD_AUTHORITY_MATRIX_ROLE, { baseId }),
      {
        name: `${suffix}-role`,
        enabled: true,
        tables: tables.map((rule) => ({
          enabled: true,
          tableId: rule.tableId,
          disabledActions: rule.disabledActions ?? [],
          ...(rule.recordFilter ? { recordFilter: rule.recordFilter } : {}),
          fieldRecordPermission: rule.fieldRecordPermission ?? [],
        })),
      },
    );
    const roleId = (role.data as { id?: string })?.id;
    if (!roleId) {
      throw new Error(
        `adding the role returned no role: ${JSON.stringify(role.data)}`,
      );
    }

    await axios.patch(
      urlBuilder(UPDATE_AUTHORITY_MATRIX_ROLE_USER, {
        baseId,
        authorityMatrixRoleId: roleId,
      }),
      { userIds: [userId] },
    );

    return {
      axios: personAxios,
      join: options.join ?? "editor",
      userId,
      email: RESTRICTED_EMAIL,
      spaceId,
      baseId,
      roleId,
      cleanUp,
    };
  } catch (error) {
    await cleanUp().catch(() => undefined);
    throw error;
  }
};
