import { defineBugCase } from "../../framework/types";

// T6661: write-path user resolution was narrowed to the base's collaborators
// while the read path stayed unscoped, so a table displayed a person it
// refused to let anyone write. Copying a user cell whose member is not a
// collaborator and pasting it one row down answered 400 `User(usr...) not
// found in table`; the fill handle failed the same way. Those values had
// accumulated during an earlier window when v2 accepted unscoped writes, so
// the narrowing surfaced them all at once as "shows but cannot be copied".
export default defineBugCase({
  id: "user-field/paste-non-collaborator-value",
  title:
    "Pasting a copied user cell works when the member is not a collaborator",
  runner: "paste-non-collaborator-user",
  timeoutMs: 180_000,
  bug: {
    issue: "T6661",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-outsider",
    outsiderName: "Paste Non Collaborator",
    rowTitle: "row-1",
  },
});
