# field/y2870-a-creator-converted-to-text-keeps-commas-quoted

**T7789** — fixed in `2e8278870`.

## What the user sees

After converting "created by" to text, the names are gone; once they come
through, "Li, Lei" reads as two people, "Li" and "Lei".

## What the checkpoint asserts

The conversion answers 2xx from v2; the owner's row holds the owner's name
and the second person's row holds `"Li, Lei"`, quoted.

## What the fixture has to hold

A second person, signed up and invited as an editor for the run, renamed
to "Li, Lei" and creating their own row — so one name needs quoting and one
does not.
