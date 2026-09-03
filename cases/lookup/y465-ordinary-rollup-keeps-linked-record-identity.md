# lookup/y465-ordinary-rollup-keeps-linked-record-identity

**T7082** - fixed. Covers **Y465**.

## What the user sees

An ordinary rollup summarizes linked records through one-to-one, one-to-many,
many-to-one, or many-to-many relationships. Distinct linked records that share
the same primary title collapse into one value, or a compacted link result has
the wrong cell shape and appears empty.

## How the case is built

The API creates parent, child, and target tables. Two target records have the
same title but different record ids. Two linked child rows refer to those
records across all four relationship types; one relationship also repeats the
same record id. A third child points at an outside target but is not linked to
the parent, and a second parent has no children.

All tables, fields, links, and records are created before the checkpoint.

## What the checkpoint asserts

Unique rollups distinguish records by id while preserving title order, so both
same-title records remain. Compact keeps repeated references and returns title
strings. The unlinked child contributes nothing, and the empty parent remains
empty.
