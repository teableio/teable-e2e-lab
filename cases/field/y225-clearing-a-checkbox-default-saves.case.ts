import { defineBugCase } from "../../framework/types";

// Y225 / T5595.

// Turning a default off is the same edit as turning it on, and the way to say
// "no default" is to send nothing where the value was - null, not false, which
// would mean "defaults to unticked". The field's own schema only accepted true
// or false, so clearing it was refused: the dialog would not save, and the way
// out was to delete the column and make it again.
export default defineBugCase({
  id: "field/y225-clearing-a-checkbox-default-saves",
  title: "Clearing a checkbox's default value saves",
  runner: "checkbox-cleared-default",
  timeoutMs: 180_000,
  bug: {
    issue: "T5595",
    status: "fixed",
    sourceCommits: ["4af3f32fa"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-checkbox-default",
    startsTicked: true,
  },
});
