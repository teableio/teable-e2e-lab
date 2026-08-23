# lookup/conditional-filter-over-a-foreign-table

**T6599** — fixed. On the `conditional-filter-field-refs` runner; the shared
design is described in
`lookup/conditional-filter-compares-two-own-columns`.

## This variant

The same condition — two columns of the host table compared against each other
— while the value being looked up comes from a different table.

That is a different failure with the same symptom. The set-based
field-reference fast paths resolve the filter's field against the foreign
table; a host-table field is not there, so SQL generation failed with a bare
`Field not found` and the computed run dead-lettered as an obsolete plan.

The two cases exist separately because the two fixes are separate: one projects
the referenced field ids into the pruned source relation, the other falls back
to the lateral path when a field-reference group cannot be resolved. A single
case would go red for whichever failure it met first and say nothing about the
other.

The looked-up value lives on the source table here, so the recompute half of
the assertion edits the source row — the host's own columns are only the
condition.

## A measured surprise

A host-both-sides condition does not compare each row's own two columns. On
`develop` it matched **every** host row, including the one whose two keys
differ — measured in run 32655175261, where the first version of this case
expected the non-matching row to read empty and failed for that reason.

So the fixture uses exactly one source row and asserts every host row reads its
value. Whether matching every row is the intended reading of such a condition is
a question this case does not answer; it records what the fixed build does.

On the fix's parent `ae1e2b086` every host row read empty instead — nothing
computed at all, which is the failure this case is about.
