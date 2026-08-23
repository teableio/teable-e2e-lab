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

The looked-up value lives on the foreign table here, so the recompute half of
the assertion edits the foreign row — the host's own columns are only the
condition.
