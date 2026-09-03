# undo/a-second-undo-after-one-that-failed

**T7038** — fixed. On the `undo-cursor-after-a-failed-undo` runner.

## What the user sees

Undo cannot carry out a step — for an ordinary reason, and it says so. Press undo
again, and instead of trying that step once more it reverses the step _before_
it: in this fixture, the creation of the row. A row disappears that nobody asked
to delete.

The failed undo is not the problem. It is honest and it is visible. The second
press is the one that quietly takes something else away.

## Why

Undo moved the place it had walked back to **before** carrying out the step, and
never moved it back when the step failed. A failed undo therefore still counted
as done, and the next press started from behind it.

## What the checkpoint asserts

That the second press retries the same step and reaches no further: the row is
still there, and it still holds the value the failed undo could not put back.

Both halves matter. The row surviving says undo did not reach past the failed
step; the value being unchanged says the step genuinely still has not been
carried out, rather than having quietly succeeded on the second try for some
other reason.

## What the two presses answer, measured

|                              | first press                          | second press               | rows left                        |
| ---------------------------- | ------------------------------------ | -------------------------- | -------------------------------- |
| `f44a82cf8` (before the fix) | `failed`, "must have a unique value" | `fulfilled`                | only the row that took the value |
| `develop`                    | `failed`, "must have a unique value" | `failed`, the same message | both                             |

The first press is identical on both sides — it is honest either way. The whole
difference is the second one.

## Why the fixture is shaped this way

A step fails to reverse here because the column does not allow duplicates: the
row's value was changed away from `code-first`, another row has taken
`code-first` since, and putting the old value back would now collide. Nothing is
wrong with the data or with either request.

The row that takes the value is written on a **different window id**. The undo
stack is keyed by that id, so writing it on the same one would put it on the
history this case walks back through, and the case would be undoing a different
sequence than it describes.

Before the checkpoint, the fixture requires that the first press really did fail
and that both rows are still present. A first press that succeeded would leave no
failed step for the second to skip, and the case would be reporting on nothing.

## What this case does not cover

The report lists six risks. This case covers one: a failed step still counting as
done. The others are two requests undoing at once, two appends racing, undo
racing with append, a crash between writes, and a partly-successful batch. A
single client against one process cannot show any of those, and nothing here
should be read as guarding them.

## A trap this case fell into first

Every write here has to carry the window id, because the undo stack is keyed by
it. The generated client takes no per-call headers, so the first version of this
runner passed them where they were quietly ignored — and undo then answered
`{"status":"empty"}`, which the fixture check read as "not fulfilled" and let
through. The case was green on a pre-fix commit while asserting against an empty
stack.

Both halves are now closed: the writes go through raw axios, and an `empty`
first press is rejected by name as a fixture that never reached the stack.
