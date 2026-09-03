# authority/y402-archive-authorized-grouped-record

**T7025 / Y402** - fixed.

## Regression contract

A member whose authority-matrix role grants archive access can archive a row
inside the role's record scope even when the ordinary base role and delete
permission would not allow deletion.

## Fixture proof

The runner creates a grouped and descending-sorted view with two authorized
rows and one hidden control row. A real second user's pre-check must return the
two authorized rows in saved sort order and exactly one authorized group.

## Checkpoint

The member archives one authorized row through the public archive endpoint.
The active view must then contain only the untouched authorized row, retain
the correct group header, report row count one, and never expose or modify the
hidden control record.
