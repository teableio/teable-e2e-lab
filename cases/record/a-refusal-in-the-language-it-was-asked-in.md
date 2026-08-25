# record/a-refusal-in-the-language-it-was-asked-in

**T6310** — fixed.

## What the user sees

Every part of the interface in their own language, and the one sentence that
matters in English.

The message on a refused write is the whole of what a person gets: it is the
only place the product explains what it will not do and why. "This value is
already used" is an instruction — go and find the other row — and a person who
cannot read it has to guess, ask a colleague, or give up on the entry.

## What the checkpoint asserts

The same refusal, asked for in a second language, comes back with the same
status and a different message.

## Why the case holds no translated string

It asks for the refusal twice, in two languages, and requires the two answers
to differ. That holds whatever the translations say, and it cannot rot when the
wording is improved — a case pinned to a particular sentence would fail the
next time someone edits it.

## What the fixture has to hold

The write really is refused, and the refusal says something. A request that
succeeded, or one that came back with no message at all, would leave the
checkpoint comparing nothing against nothing.
