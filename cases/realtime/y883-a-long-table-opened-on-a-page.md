# realtime/y883-a-long-table-opened-on-a-page

**T6479** — fixed.

## What the user sees

A table with enough rows in it shows none of them. The page is connected, the
row count is right, and the grid is empty — for everybody, not just one person.

Nothing about it is gradual: under a certain number of rows everything works,
over it the table is blank, and which side of the line a table falls on depends
on how many rows it happens to hold.

## What was measured

On the fix's parent `03c6490c7` the subscribed page errors with `Request failed
with status code 431` and never receives a row. On `develop` it receives all
800, with the ids measuring 20800 bytes as a query string against a 16384-byte
limit. Run 34563618323.

An earlier attempt asked for no window at all and was green on both sides: the
subscription answers 100 rows by default, whose ids come to about 3KB, which
fits. The window the page asks for is the whole point — run 34563307339.

## Why the socket and not the endpoint

The page subscribes, is told which rows are in the answer, and then asks for all
of them in one request that carries every id. That request is between the server
and itself — the endpoint it calls changed shape in the fix, from a query string
to a request body — so asking that endpoint directly would be asking the two
sides two different questions. What a person's page does, subscribe and then
receive rows, is the same on both sides, so that is what the case does.

## How the case is built

One table, 800 rows written in batches of 100, and a subscription of the kind a
page opens.

Before the checkpoint the case measures the ids it actually created, written out
as a query string, and requires them to exceed the 16KB header limit. That is
not decoration: a build with shorter ids would put the same row count on the
other side of the limit, and the case would quietly be about nothing.

## What the checkpoint asserts

The subscribed page receives all 800 rows, and the client reports no error. Both
halves matter — a refusal arrives as an error on a subscription that otherwise
looks healthy.

## Limits

One table shape and one row count. The number of rows is a config value because
it is the payload size that matters, not the table.
