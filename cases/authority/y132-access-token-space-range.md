# authority/y132-access-token-space-range

## Source

Y132 tracks T6691, fixed by
[teable-ee PR #3003](https://github.com/teableio/teable-ee/pull/3003)
at commit `e2fc05b93`. Authority-matrix guards used to return early for an
unrestricted owner or matrix administrator before applying the request's
personal access token. The user's authority could therefore widen a PAT beyond
its declared Space resource range.

The expected behavior comes from the defect and fix, not from a historical
actual-result field: PAT scopes and resource ranges are hard upper bounds.

## Fixture

Setup creates everything through product APIs before the checkpoint:

1. Create Space A and Space B, with one Base and table in each.
2. Grant Space B an Enterprise subscription and enable the authority matrix on
   Base B. The seed user owns both Spaces and is therefore unrestricted by the
   matrix, which is the former bypass path.
3. Create a PAT with read and record-create scopes, but restrict its resource
   range to Space A only.
4. Through the owner session, prove Base B's table is empty and that its record
   read is served by v2.

The PAT itself is never written to evidence or an error message.

## Checkpoint

`access-token-resource-range-remains-a-hard-bound` uses only public APIs:

- `/base/access/all` and `/space` must include the authorized Space A resources
  and exclude the out-of-range Space B resources.
- Field, record, view, and row-count reads against Base B must answer 403.
- A record-create request against Base B must answer 403.
- The owner session must still see zero records in Base B, proving a rejected
  response did not leave a write behind.

The endpoints are collected before judgment so one artifact describes the
whole resource-range boundary. They are not separate product objectives: every
assertion asks whether the same scoped PAT escaped into the same out-of-range
Base.

## Expected status

`status: fixed`. The security-sensitive reproduction is included only after
the fix shipped. On a revision before `e2fc05b93`, the checkpoint must observe
the range bypass; on the fix and later revisions, the bug must be absent.
