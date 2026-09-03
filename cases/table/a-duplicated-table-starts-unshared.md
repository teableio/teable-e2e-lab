# table/a-duplicated-table-starts-unshared

**T6790** — fixed. On the `duplicate-shared-view` runner, `assert: "copyIsNotShared"`.

## What the user sees

A table has a view someone shared, with a password on it. The table is
duplicated. The copy is already published: the sharing switch is on, the share
rules including the password came across, and only the address is new.

Nobody was asked and nothing says so. Every duplicate of that table is another
live public page, openable by anyone who was ever given the source's password.

## Why

Duplicating a base already stripped share state from every copied view.
Duplicating a table only re-minted the share id and left the switch and the
rules alone — on both the v2 path and the legacy one. The two duplicate flows
disagreed about the same thing.

That disagreement was not an accident that went unnoticed: it had been written
into a unit test as the expected behavior, by an earlier fix (`da43a20a2`) that
was only ever about two tables colliding on one share id.

## What the checkpoint asserts

Three separate things about every view in the copy, because they are three
separate ways a copy can be reachable: the switch (`enableShare`), the address
(`shareId`), and the rules behind it (`shareMeta`).

Then, that the **source** still holds its own link, with the same share id it
started with. Without that, "the copy is not shared" could have been satisfied
by a duplicate that unshared everything, which is a different bug.

A password is set on the source before duplicating, and the fixture refuses to
continue if it did not stick. The password is the part that makes this more than
untidy: an inherited address is a page nobody opened, an inherited password is a
page other people can already open.

## The v1 column

v1 reproduces this too, on both pre-fix columns of the acceptance matrix. That
matches the issue's own reading, which named the legacy duplicate path as
spreading the source view row wholesale and overriding only the share id.
Customers on either engine were affected.

Worth knowing for anyone re-running this: a **local** run of the v1 column on
`9c97d777c` came back green, while CI on the same commit came back red. CI is
the acceptance surface and its answer is the one recorded here, but the two
disagreeing at all is a harness question that is not settled by this case.

## Its sibling on this runner

`table/duplicate-with-shared-view` (T6573, `da43a20a2`) asks the older question
— the duplicate must succeed and must not answer on the source's address. Both
run the same setup and the same request; they differ only in what they read off
the copy. Keeping them on one runner is what makes it visible that the second
answer replaced the first.
