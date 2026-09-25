import { defineBugCase } from "../../framework/types";

// T7355: asking for a signup code returned a signed JWT with the code inside
// it. Signed is not encrypted - decoding the token gave the code without the
// mail, and accounts were registered under addresses nobody could receive
// mail at. Released before this case was written.
export default defineBugCase({
  id: "authority/a-signup-token-that-holds-its-code",
  title: "A signup token does not hand out the code it is waiting for",
  runner: "signup-token-carries-no-code",
  timeoutMs: 60_000,
  bug: {
    issue: "T7355",
    status: "fixed",
    sourceCommits: ["cb550a1f6"],
  },
  config: {
    emailPrefix: "e2e-lab-signup-token",
  },
});
