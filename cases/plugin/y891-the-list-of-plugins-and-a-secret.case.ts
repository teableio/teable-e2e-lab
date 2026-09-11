import { defineBugCase } from "../../framework/types";

// T6177: a plugin's secret is what proves a request comes from that plugin. It
// is shown once, at registration, and after that the product holds only a
// scrambled copy - the point of scrambling being that the stored form is not
// worth stealing. The list of one's plugins handed that scrambled copy back on
// every read: not the secret itself, which is why it is easy to wave away, and
// also the one thing a stored credential must never be - reachable through an
// ordinary read, offline, by anybody who can see the page.
export default defineBugCase({
  id: "plugin/y891-the-list-of-plugins-and-a-secret",
  title: "The list of plugins carries no secret",
  runner: "plugin-secret-in-list",
  timeoutMs: 180_000,
  bug: {
    issue: "T6177",
    status: "fixed",
    sourceCommits: ["ca0a963d7"],
  },
  config: {
    namePrefix: "e2e-lab-plugin",
    logo: "https://example.com/logo.png",
    positions: ["dashboard"],
  },
});
