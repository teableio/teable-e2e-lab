# authority/y896-a-token-reads-back-what-it-made

**T7115** — fixed.

## What the user sees

A script, or the command line, makes a page and then cannot open it. Creating
works; fetching it, listing pages and asking for its versions are all refused.
The account owns the page — the token that made it cannot see it.

## What was measured

On the fix's parent `06d5863ce` the token creates the page and is then refused
403 `restricted_resource` on all three reads — the page, its versions, and the
list. On `develop` all three answer 200. Run 34578916073.

Two earlier attempts never reached the checkpoint, both outside it and both
reported as the case being unable to run rather than as the bug: the create
request needs a `type` (run 34578588402), and the create answer names the page
`artifactId` rather than `id` (run 34578588402's successor).

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
