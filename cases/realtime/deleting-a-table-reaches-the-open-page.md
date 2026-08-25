# realtime/deleting-a-table-reaches-the-open-page

**T6924** — fixed.

## What the user sees

A page that answers nothing, and no way to say what is wrong with it.

Someone deletes a table. A colleague standing on that table — or the person's
own second tab — is never told. The sidebar refreshes, but the list of tables
the page keeps subscribed still carries the deleted one, so the page stays
anchored to it and every request it makes for records or views comes back "not
found", over and over, with nothing on screen explaining why.

Nothing looks broken in a way a person can describe. It is just a table that
answers nothing.

## What the checkpoint asserts

After the delete, the table leaves the list the open page is watching, the
table that was **not** deleted is still in it, and the subscription reported no
failures of its own.

## What the fixture has to hold

The page is really watching both tables before either is deleted. Without that,
the checkpoint could pass over a subscription that never carried the table at
all.

A second table nobody touches, so a list that dropped the deleted table and a
list that dropped everything stay distinguishable.

## Why the observation is the subscription

A read over HTTP asks the database and would correctly report the table gone.
What nobody was told is the whole failure, so the case watches what the page
watches.
