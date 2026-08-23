# user-field/table-duplicate-does-not-notify-assignee

**T6662** — fixed. Sibling of `user-field/import-does-not-notify-assignee`, on
the same runner. Everything about how this case observes — the second real
session, the control table, the quiet budget — is described there.

## The bug

Same unconditional notify, reached by duplicating a table instead of importing
into one. The copy re-delivers every assignment it copied, so duplicating a
table of a few hundred assigned rows notified each of those people about a
table that did not exist a moment ago and that nobody had shown them.

## The link that has to be there

The duplicate has two plans. The fast one copies rows physically and never
republishes their field values, so no user cell is ever seen arriving and no
notification fires — on either side of the fix.

A two-way `oneMany` link hosts its foreign key on the _other_ table, which the
physical plan cannot map. Adding one forces the duplicate onto the hydrated
path that publishes full record values, which is the path the bug lives on.

So the runner creates a foreign table and links to it before duplicating. This
is load-bearing rather than incidental: without it the case is green
everywhere, for a reason that has nothing to do with T6662.

## What is observed, and on which table

Creating the assigned row on the source table notifies — correctly, that is a
person assigning someone. The negative assertion is scoped to the **duplicated**
table's id, which is also why field ids are resolved by name afterwards: the
copy remaps them.

Cleanup drops the foreign table first. It hosts the link's foreign key, and the
tables whose `__fk` columns reference it cannot go before it does.
