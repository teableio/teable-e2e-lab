# import/y187-excel-header-below-a1

**Bug:** T6867 — an Excel file whose content starts below row 1 imported as a
sheet with no columns.

## What broke

The reader takes a sheet as a dense array of rows and read the header out of
index 0. A sheet whose used range starts at A2 has nothing at index 0, so the
header row was read out of a hole: no columns, and the file looked empty.

On the pre-fix column the product says it itself:

```
Excel sheet has no columns
```

That message is the reason this is worth a case. The file opens perfectly well
in Excel, every cell visible, and the product answers that there is nothing in
it — leaving nothing to act on. A title line, a spacer row, or a frozen banner
above the table is all it takes, which makes this ordinary rather than exotic.

## Reproduction

1. Build a workbook whose content is written at **A2** — a header row and one
   data row — and whose declared used range is `A2:C3`.
2. Upload it through the product's own attachment path.
3. `POST /import/analyze` for the file.
4. `POST /import/{baseId}` with the analyzed columns.

Before the fix, step 3 comes back with no columns at all. After it, the header
row is found and the import lands a table with those three fields and the row
underneath.

## Why the fixture is checked before it is uploaded

`aoa_to_sheet` with `origin: "A2"` puts the cells at A2 but leaves the used
range anchored at A1 — the runner discovered this the hard way, with a first
version whose workbook reported `A1:C3` and was therefore not the file this
case is about. The range is now set explicitly, and the workbook is **read back
in the same process**; a used range that does not start below the first row is
refused there and then.

That check is worth its lines. A fixture that quietly wrote its header at A1
would sail through both sides of the fix and the matrix would go green
everywhere — the failure mode where a case looks like coverage and is not.

## What the checkpoint asserts

The analyze call is **inside** the checkpoint, not treated as setup. It is what
fills the import preview, so "no columns" is the first thing the user sees go
wrong; putting it outside would have made the product's own failure read as a
broken harness.

Three assertions, in order:

1. The analyzer's column names are exactly the header row.
2. The imported table's field names are exactly the header row.
3. The single data row landed under those fields, cell for cell.

Stopping at 1 would leave the import untested; stopping at 2 would pass a table
of correctly named but empty columns, which is still not the file the user
imported.

## Why the data looks like this

Three columns of different types — text, number, text — so a header row that is
found is also plausibly typed, and a row that lands wrong is visible in the
values rather than only in a count.

`origin: "A2"` is the smallest offset that reproduces: one blank row, which is
exactly what a spacer row above a table produces. A larger banner would be more
dramatic and no more informative.

The case owns its space. The import row budget is derived from the space's
usage, so importing into a space other cases keep filling would eventually
answer 402 for reasons that have nothing to do with header detection. See
`import/y181-excel-duplicate-headers`, which shares that constraint and the same
upload path.
