# lookup/y899-a-borrowed-worked-out-column-can-be-saved

**T6332** — fixed.

## What the user sees

A column that borrows a worked-out column from another table cannot be changed.
Renaming it is refused, so is reformatting it, so is turning it into something
else. The column sits there showing its value, and the only way past it is
deleting it and building it again.

The report says it is not reliably reproducible, which fits: it depends on what
kind of column was borrowed, not on what was done to it afterwards.

## What was measured

Pending: to be filled in from the matrix run on the fix's parent and `develop`.

## Why borrowing a worked-out column is different

Borrowing copied the source column's instruction onto the borrowing one. The
borrowed column then carried an instruction that made no sense where it now was
— it names columns of another table — and everything that had to read that
instruction stumbled on it, starting with saving the column's own settings.

## How the case is built

A source table with a worked-out column that reads **two** of its own columns, a
host row linked to it, and a column borrowing that worked-out column. The two
columns are the point: an earlier pass measured three shapes over a one-column
formula — rename, re-point, convert away — and all three were accepted on the
fix's parent (runs 32675528990, 32675852808, 32676121196). What the copied
instruction stumbles on is being unparseable where it lands. Then the ordinary save from the column's
settings screen: a new name and a display change, with what it borrows
unchanged.

Before the checkpoint the borrowed column has to be showing the worked-out
value. Saving the settings of a column that shows nothing would prove nothing.

## What the checkpoint asserts

The save is accepted, the column read fresh carries the new name, and it still
shows the same value. The value matters: a build that accepted the save by
dropping what the column shows would pass a case that only looked at the status.

## Limits

One borrowed kind (a formula over a number) and one save. The fix also covers
the conditional variety and the doc-ids read that crashed on the same
instruction, neither of which is exercised here.
