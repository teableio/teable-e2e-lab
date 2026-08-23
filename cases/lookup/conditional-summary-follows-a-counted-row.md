# lookup/conditional-summary-follows-a-counted-row

**T6406** — fixed.

## What the user sees

A summary column that stops agreeing with the rows it summarizes. The price on
a product changes, the product row shows the new price, and the total that
counts that product keeps the old number — until something unrelated forces it
to recompute, at which point it silently corrects itself.

## Why

A summary with a condition — total of the electronics only, hours booked
against this client, invoices still unpaid — narrows what it counts. Deciding
which summaries a write has to dirty is its own step, and that step skipped the
filtered path.

Nothing fails: the write answers 200 and the source row is correct. Only the
number beside it is wrong, which is the kind of wrong that gets copied into a
report before anyone notices.

## How the case is built

Three products in two categories, and a summary totalling one category. The
fixture needs a row the condition ignores as well as rows it counts: a summary
that counted everything would move for the right reason by accident.

The total is checked before anything changes — a summary that was wrong from
the start would make "it did not follow the change" describe something else —
and the edited price is required to change the total, so a summary that ignored
the write cannot pass.

## What is recorded and not asserted

The case also changes a row the condition excludes and records what the total
does afterwards. Whether an excluded row should cost a recompute is the
optimization's own question — the change this case guards is about the rows
that _are_ counted — so the number goes in the artifact rather than into an
assertion.
