import { defineBugCase } from "../../framework/types";

// Deleting a record makes the engine look up every link field pointing at it,
// so it can clear those cells before the row goes. That lookup was scoped to
// the record's own base, so a link reaching in from a second base was
// invisible to it: the cleanup never ran, and the delete met the physical
// foreign key instead - refused outright, or through, leaving a cell in the
// other base that names a row which no longer exists.
//
// The control row in the same table, pointed at only from inside its own base,
// is what makes the evidence read as "the base boundary" rather than "optional
// links are broken".
export default defineBugCase({
  id: "link/cross-base-link-clears-on-delete",
  title: "Deleting a row clears the link that reaches it from another base",
  runner: "cross-base-link-delete",
  timeoutMs: 180_000,
  bug: {
    issue: "T6863",
    status: "fixed",
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-cross-base-link",
    sameBaseOwnerTitle: "Owner reached from its own base",
    crossBaseOwnerTitle: "Owner reached from another base",
    sameBaseHostTitle: "Same-base host",
    crossBaseHostTitle: "Cross-base host",
  },
});
