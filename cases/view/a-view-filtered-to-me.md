# view/a-view-filtered-to-me

**T3433** — fixed.

## What the user sees

"Assigned to me" — the first view most people make, and the one they open every
morning — is empty.

An empty view of your own work reads as _you have nothing to do_. It is the one
wrong answer nobody double-checks, and the work sitting in it is invisible for
as long as the view is trusted.

## Why

The filter stores the word "me" rather than a name, because one saved view has
to mean something different for each person who opens it. The word was passed
to the database as itself, so it matched nobody.

## What the fixture has to hold

Two rows: one assigned to the person looking, one assigned to nobody. With only
the first, an unfiltered view would look correct; with only the second, so
would an empty one.

The table is read without the view first, so an empty answer afterwards means
the filter rather than the table.
