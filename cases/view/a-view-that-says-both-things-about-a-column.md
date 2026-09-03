# view/a-view-that-says-both-things-about-a-column

**T6597** — fixed. On the `legacy-column-visibility-metadata` runner.

## What the user sees

A table whose views will not load.

The base is old enough that one of its views records a column's visibility the
way this product used to. Nothing anyone did caused it; nothing they can do
undoes it.

## Why

Which columns a view shows has been recorded two ways over this product's life:
an older note saying whether a column is **shown**, and the current one saying
whether it is **hidden**. Views made long enough ago carry both, and no request
writes that shape any more.

Read back, the two were passed through side by side. What a view says about a
column is checked on the way out, and an entry carrying a note nobody expects any
more does not pass that check — so the request for the table's views failed. That
is every view at once, not one column in one of them.

## What the checkpoint asserts

That the views come back at all, and that the entry has been settled into one
answer: the older note gone, the current one kept, and the rest of the entry
intact.

Both halves. A response that came back carrying both notes would hand the
contradiction to whatever reads it next, which is where this started.

## Why the fixture is written with SQL

Nothing writes that shape any more — which is exactly why the bases carrying it
cannot get out of it from the interface. `fixture-db` writes the stored notes;
the observation stays on the public view-list endpoint.

Before the checkpoint, the fixture reads the stored notes back and requires the
older key to actually be there. Without it there is nothing unexpected to read
and the case would report on nothing.

The entry also carries an order and a width, so a "settled" entry can be told
from an emptied one: dropping the whole entry would satisfy "the older note is
gone" without keeping anything the view needs.

## The v1 column

v1 is red on every column of the acceptance matrix, `develop` included, and for a
different reason from v2's. It does not fail the request — it answers 200 and
hands back the entry exactly as stored:

```
{"order":1,"visible":true,"hidden":false,"width":241}
```

So on the older engine this data never caused an outage and was never settled
either; both notes are still passed through today. The two engines fail this case
in opposite directions, which is worth knowing before anyone reads the v1 column
as "v1 was affected too".

Reported, not enforced — the v1 column is a reference and never gates a run. It
is the fourth case here to find a v2-only fix leaving the older engine as it was;
the others are `lookup/distinct-choices-in-the-order-they-appear`,
`lookup/two-records-with-one-name-are-two-records` and
`formula/a-column-that-picks-by-case`.
