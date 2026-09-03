# authority/y404-comments-stay-inside-authorized-records

**T7034 / Y404** - fixed.

## Regression contract

A member joined through an authority-matrix role has comment permission and a
row filter that exposes one record while excluding another. Commenting on the
visible record must succeed, and the same request against the excluded record
must be rejected without creating data.

## Fixture proof

Before the checkpoint, the runner creates both records, enables the matrix,
assigns a real second user to the filtered role, and reads the table through
that user's session. The fixture is accepted only when that read returns the
authorized record and not the excluded control record.

## Checkpoint

The restricted user creates and reads back a comment on the authorized record.
An attempted comment on the excluded record must answer 403 or 404, and an
owner read then proves that no comment was written there.
