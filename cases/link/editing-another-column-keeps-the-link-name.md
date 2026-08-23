# link/editing-another-column-keeps-the-link-name

**T5419** — fixed.

## What the user sees

A row is linked to another one and the cell goes blank. The link is there — a
reload shows the name — but the person who just made the change is looking at
an empty cell, and nothing tells them the write worked.

## Why

A link cell carries two things: the id of the row it points at, and that row's
title. The title is what gets drawn. The answer to the write carried the id
alone, and whoever made the change renders that answer.

## Which write

Editing a **different** column on a record whose link is already set. What the
answer has to carry is then a value this request did not send, merged from the
record as it stands — which is the merge the fix changed.

Sending the link itself was built first and is green on both columns (run
32663754305): that reply already carried the title on the fix's parent. The
runner keeps that shape as a config value.

## Why the observation is the write's own reply

Not a read afterwards. A read resolves the title for itself, so a case that
checked one would pass while the person who made the change still sees nothing.
The reply to the write is the thing that was wrong, and it is what the grid
puts on screen.

## What the checkpoint asserts

That the reply carries a link value at all, that it has a non-empty title, and
that the title is the linked row's name. The three are separate on purpose:
"no value", "a value with no name", and "a name that belongs to something else"
are three different failures, and the message says which one happened.

The fixture refuses a blank name for the linked row — the case is about that
name arriving, and an empty one cannot be told from a missing one.
