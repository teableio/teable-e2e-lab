# automation/y152-percent-mapping-preserves-number

## Source

Y152 tracks T6851, fixed by
[teable-ee PR #3078](https://github.com/teableio/teable-ee/pull/3078)
at commit `1b27eb042`. The automation fact resolver treated every array node as
a text template and returned `values.join("")`. Even when an array held one
numeric fact, it returned text instead of the original number.

The fix returns the single non-null value directly. This case asserts that
contract only; it does not encode any historical actual-result field.

## Fixture

Setup creates an Enterprise Space and Base through product APIs, then builds:

```
Source table                    Target table
Source Percent (number, %)  ->  Target Percent (number, %)
```

Both fields use percentage formatting with precision 2. The automation has a
`recordCreated` trigger on the source table and a `createRecord` action on the
target table. The target field is mapped from one `array` node containing one
`fact` node at `$.record.fields.<sourceFieldId>`, which is the exact resolver
shape fixed by T6851.

Before the checkpoint, the runner activates and reads back the workflow,
proves the target table is empty, and proves that the target record read is
served by v2.

## Checkpoint

`single-variable-percent-mapping-preserves-number` performs the user action by
creating one source record with the numeric value `0.18`. It then polls the
public workflow-run and target-record APIs until the asynchronous automation
settles, and asserts:

- exactly one workflow run exists and its status is `success`;
- exactly one target record exists;
- the target field's JavaScript type is `number`;
- the target field is exactly `0.18`.

This is one atomic objective: a direct single-variable percentage mapping must
preserve the numeric value. UI behavior and the case table's old actual result
are out of scope.

## Expected status

`status: fixed`. Before `1b27eb042`, the checkpoint must reproduce the type-loss
failure. On the fix and later revisions, the bug must be absent.
