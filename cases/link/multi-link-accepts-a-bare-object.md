# link/multi-link-accepts-a-bare-object

**T6510** — fixed. On the `link-cell-shape` runner; the shared design is
described in `link/single-link-accepts-a-one-entry-array`.

## This variant

The mirror image: a bare object written into a link field that holds several
rows.

The two exist separately because they are two different rejections in the cell
value schema — one on the array side, one on the object side — and a single
case would go red for whichever it met first and say nothing about the other.
Both are shapes a v1-era client sends without knowing it.
