import { defineBugCase } from "../../framework/types";

// Y309 / T6745: a CLI running where no loopback callback can arrive uses the
// device grant instead. The browser's approval is an authenticated API call in
// this case, so the whole login can be exercised without opening a browser.
export default defineBugCase({
  id: "oauth/y309-device-code-login-completes",
  title: "Device-code login completes without a local callback",
  runner: "oauth-device-grant",
  timeoutMs: 120_000,
  bug: {
    issue: "T6745",
    status: "fixed",
    sourceCommits: ["f0624c29b"],
  },
  config: {
    clientId: "clttckxmg4deadomjhs",
    expectedAppName: "Teable CLI",
    verificationPath: "/oauth/device",
  },
});
