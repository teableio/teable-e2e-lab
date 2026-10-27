import { defineBugCase } from "../../framework/types";

// T7936: Renaming a field, or creating one, with a name already taken in the
// table was refused without a translation key, so the toast showed the English
// reason whatever the person's language.
export default defineBugCase({
  id: "field/y3248-a-taken-field-name-in-your-language",
  title:
    "Renaming or creating a field with a taken name is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-field-name-taken",
    scenario: "field-name-duplicate",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.field.fieldNameAlreadyExists",
  },
});
