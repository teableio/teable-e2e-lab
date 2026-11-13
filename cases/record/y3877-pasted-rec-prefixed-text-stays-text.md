# record/y3877-pasted-rec-prefixed-text-stays-text

**T8420** — fixed in `a233aae87`.

## What the user sees

Pasting a column of codes such as "recipe_test" or "rec_sample_01" into a text column leaves some cells empty or changed.

## What the checkpoint asserts

After pasting six values starting with "rec" into a text column, each cell holds exactly the value pasted into it.

## What the fixture has to hold

A table created for the run in the seed base and dropped afterwards, with one text column and six rows to paste over. One value is shaped exactly like a record id.
