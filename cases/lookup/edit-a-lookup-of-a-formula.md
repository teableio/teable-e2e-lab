# lookup/edit-a-lookup-of-a-formula

**T6332** — fixed.

## What the user sees

A column looks up a computed value from the table it links to — an order row
showing the customer's calculated tier, a task showing its project's completion.
It displays the right number.

It cannot be renamed. It cannot be re-pointed or converted either. Every edit is
refused, and nothing about the column looks broken.

## Why

The lookup column carried a copy of the foreign formula's expression. That copy
made the column fail its own validation whenever anything touched it.

## What the checkpoint asserts

The column is re-pointed at a plain number on the same link: the edit is
accepted, the column carries its new name, and it really does look up the new
field afterwards. A request answered successfully that changed nothing is a
different failure with the same appearance.

Renaming alone is not the subject — that is accepted on both columns (run
32675528990). The edit that rewrites what the column looks up is the one that
was refused.

## The control is a plain lookup beside it

A second lookup on the same link, pointing at a plain number instead of a
computed one, is renamed first, outside the checkpoint. If that were refused
too, the case would be reporting something about lookups in general rather than
about this one.
