# lookup/y2934-a-conditional-total-with-no-function-counts

**T7753** — fixed in `12227acb9`.

## What the user sees

An integration creating a "how many match" column the short way — without
naming the function — gets a validation error.

## What the checkpoint asserts

The create answers 2xx from v2, the stored expression is
`countall({values})`, and the row holds the number of amounts over the
threshold.

## What the fixture has to hold

A threshold that keeps two of three amounts, so a count of everything (3)
and a count of the matches (2) differ.
