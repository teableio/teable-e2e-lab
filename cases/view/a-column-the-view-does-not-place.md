# view/a-column-the-view-does-not-place

**T6545** — fixed. On the `legacy-column-visibility-metadata` runner,
`legacy: "noPosition"`.

## What the user sees

A table whose views will not load.

The notes a view keeps about each of its columns say where the column sits and
how wide it is. In views made long enough ago, some entries carry a width and
**no position at all** — a shape nothing writes any more, and not something
anyone did.

## Why

Nothing filled the gap in on the way out, and what a view says about a column is
checked there. An entry with no position does not pass that check, so the request
for the table's views fails — every view at once, not one column in one of them.

Measured on `66919acae`:

```
500 {"message":"Invalid View projection","domainCode":"view.invalid_projection",
     "issues":[{"code":"invalid_union","errors":[[{"expected":"number", …}]]}]}
```

## What the checkpoint asserts

The views come back at all, then that the entry carries the column's place among
the columns, and the width the stored notes did carry.

The first of those is what catches this on a pre-fix commit — the request never
returns an entry to inspect. The other two are what says the gap was filled in
rather than papered over.

The width matters as much as the position here: filling the gap by replacing the
entry would satisfy "it has a position" while throwing away the only thing the
old notes actually said.

The position is compared against the column's own index among the table's fields
rather than a number written into the case, so the case does not encode a
particular default — only that a column gets the place it should have.

## Its sibling on this runner

`view/a-view-that-says-both-things-about-a-column` (T6597) is the other shape of
old notes: an entry carrying both the older visibility key and the current one.
Both shapes fail the same way — the view list refuses with `Invalid View
projection` — and they were fixed three days apart, this one first. What differs
is which part of the entry the check rejects: an unrecognised key there, a
missing number here.

Same fixture, same observation, two shapes of old data. That is why they share a
runner and differ only in the `legacy` config value.

## Why the fixture is written with SQL

Nothing writes either shape any more, which is also why a base carrying one
cannot get out of it from the interface. Before the checkpoint the fixture reads
the stored notes back and requires that they really are the shape this case is
about — for this one, that there is no `order` in them at all.

## The v1 column

v1 is red on every column of the acceptance matrix, `develop` included, and for
the same reason as its sibling's: v1 does not fail the request, it answers 200 and
hands the entry back exactly as stored — here, still without a position.

So on the older engine this data never caused an outage and was never filled in
either. Reported, not enforced.
