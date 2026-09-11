# authority/y896-a-token-reads-back-what-it-made

**T7115** — fixed.

## What the user sees

A script, or the command line, makes a page and then cannot open it. Creating
works; fetching it, listing pages and asking for its versions are all refused.
The account owns the page — the token that made it cannot see it.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why creating worked and nothing else did

The permission guard refuses token callers on any route that declares no
permission of its own unless the route opts in. Creating a page had opted in;
the routes that read one had not. So the one request in the cycle that worked
was the first one.

## How the case is built

A token scoped to the space the page lives in, a page created with that token,
then the same token asking for the page, for its versions, and for the list.

Creating the page is fixture, outside the checkpoint, and deliberately so: it is
the request that was never refused, so it is what says the token is valid, in
range, and allowed to be there at all. A refusal afterwards is then about the
route.

## What the checkpoint asserts

All three reads answer. Each refusal is reported with its status and body, so a
run says which of them is closed rather than only that something is.

## Limits

The opened direction only. The same commit also closes the other one — a token
restricted to one space could reach any page its owner has — but on the fix's
parent that door is shut by the blanket refusal, so both sides answer the same
way and there is nothing to compare.
