# authority/y894-a-withheld-table-named-in-its-folder

**T7027** — fixed.

## What the user sees

Someone whose role withholds one table opens the base. The table is not in their
list — and its id is still there, inside the folder's record of what it
contains.

Nothing on screen necessarily shows it. What reads that answer — the sidebar, a
picker, an export, an AI mention list — has an identifier it can ask about, for
a table nobody meant that person to know exists.

## What was measured

On the fix's parent `1c88dc911` the withheld table is named in both answers —
the flat list and the tree — through the folder's record of its contents. On
`develop` neither answer names it, while the table the role leaves alone is
still there. Run 34575089052.

## How the case is built

The authority matrix on a base of its own, a folder holding two tables, and a
role that names only one of them. A table a role does not name is not that
person's at all, which is how a whole table is withheld — withholding
`table|read` by name is not something a role rule accepts (run 34574388667).

Before the checkpoint that person asks for the base's contents, and three things
have to hold: they can read it at all, the table the role leaves alone is in
their list, and the withheld one is not. Without the last there is nothing for
the references to be wrong about; without the second the answer might be empty
for reasons that have nothing to do with this.

## What the checkpoint asserts

Neither identifier for the withheld table appears in what they are given — not
in the flat list, not in the tree the sidebar draws. Both are searched because a
folder records its contents as **node** ids, not table ids: a first attempt
searched for the table id alone and was green on both columns (run
34574756753).

## Limits

One withheld table and one folder. The same fix also prunes parent references on
shared subtrees, which is a different fixture and is not built here.
