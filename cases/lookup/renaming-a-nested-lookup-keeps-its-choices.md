# lookup/renaming-a-nested-lookup-keeps-its-choices

**T6243** — fixed.

## What the user sees

A status column loses its options. Not its values — those are still in the
cells — but the list behind them: the filter dropdown is empty, the colors are
gone, and the column that read as a status now reads as text.

What was done to it: somebody renamed it.

## Why

A single-select field _is_ its choices — the list somebody picked, in the
colors they picked. A lookup of one carries that list along, and a lookup of
that lookup carries it again. That is how a status set on one table shows up,
with its colors, on a table two links away.

Renaming the last column in that chain dropped the list. Renaming a column is
about as safe an edit as the product offers, which is what makes this worth
guarding: nobody expects a rename to need checking afterwards.

## How the case is built

Three tables in a chain: a source with the select, a middle table looking it up
through a link, and a host looking _that_ up through another link. The choices
have to have travelled both links before the rename — checked outside the
checkpoint, because otherwise "the rename lost them" would be about a list that
was never there.

The rename sends an empty choices list. That is what a client only changing the
name sends: the choices are not its to manage, they belong to the field being
looked up.

At least two choices, because a single-choice list losing its colors and a list
losing everything are hard to tell apart.

## What the checkpoint asserts

The column has the new name **and** the same choices, with their colors. The
name half matters: a build that refused the rename outright would otherwise
look like a build that preserved everything.
