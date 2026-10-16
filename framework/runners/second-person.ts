import { emailBaseInvitation, USER_ME } from "@teable/openapi";
import type { IUserMeVo } from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";

// A second person, signed up for this run and invited into the seed base
// with the given role. The returned client acts as them; the seed user keeps
// acting through the shared one. The email carries the run id, so reruns
// never meet an account a previous run left behind.
export const signUpAndInvite = async (
  email: string,
  role: string,
): Promise<{
  client: Awaited<ReturnType<typeof createNewUserAxios>>;
  me: IUserMeVo;
}> => {
  const client = await createNewUserAxios({ email, password: "12345678a" });
  const me = (await client.get<IUserMeVo>(USER_ME)).data;
  try {
    await emailBaseInvitation({
      baseId: globalThis.testConfig.baseId,
      emailBaseInvitationRo: { emails: [email], role },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exist/i.test(message)) {
      throw error;
    }
  }
  return { client, me };
};
