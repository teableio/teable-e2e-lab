import { USER_ME } from "@teable/openapi";
import { defineBugCase } from "../../framework/types";

// Harness sentinel, not a historical bug: if this case cannot pass on a
// revision, no verdict from that revision's column deserves trust. It proves
// injection, app boot, seeded auth, the checkpoint seam, artifact writing, and
// the verdict mapping in one shot.
export default defineBugCase({
  id: "smoke/y153-auth-user",
  title: "Seeded user can read their own profile",
  runner: "http-check",
  timeoutMs: 60_000,
  bug: {
    issue: "sentinel/harness-health",
    status: "fixed",
  },
  config: {
    method: "GET",
    path: USER_ME,
    expect: {
      status: 200,
      seedUser: true,
    },
  },
});
