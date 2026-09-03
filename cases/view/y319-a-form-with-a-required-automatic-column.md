# view/y319-a-form-with-a-required-automatic-column

**T4884** — fixed.

## What the user sees

A form that nobody can submit. It asks for a column the person filling it in
cannot see, and could not fill in if they could: who created the row, when it
was created, something worked out from other columns.

That is the worst place for this to happen. A form is the part of a base used
by people outside it — the customer, the applicant, the person at the other end
of a link — who cannot open the settings and cannot report it to anyone who
can.

## Why

The form's settings mark that column required. Marking it happens on its own: a
column that was ordinary when the form was built becomes automatic later, or a
form carries the marking over from an older version. The submission was checked
against the marking without asking whether the column is one a person fills in.

## What the checkpoint asserts

The submission is accepted **and** the row is in the table holding what was
typed. A form that answered successfully and saved nothing would be the same
failure with a friendlier face.

## What the fixture has to hold

The marking is written with SQL as setup — the product no longer offers it,
which is the same reason nobody can clear it from the form's own settings.
