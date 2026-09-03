# Triage ledger

Commits that were examined as case candidates and **deliberately not turned
into one**, with the reason.

This is the negative half of an answer the repository already gives in
positives: a case declares the teable-ee commits it settles in
`bug.sourceCommits`, and those two lists together are what lets the next
triage pass skip what has already been decided and spend its time on what has
not.

The negatives are the expensive half. A commit that produced a case announces
itself; a commit that was read, reasoned about, tried, and rejected leaves no
trace at all, so the next pass re-derives the same conclusion at the same cost
— and the more careful the rejection was, the more expensive it is to repeat.
Three of the rows below cost a CI matrix run each to establish.

A row here is a decision, not a verdict on the fix. "Not taken" means this
repository cannot express the case honestly today; if that changes — a new
seam, a different observation point — delete the row and write the case.

A row is one commit and one issue, because a commit can be both: `cfddb0057`
fixed three issues, one of which is a case here and two of which are rows
below. `pnpm check` refuses the same commit-and-issue pair appearing in both
places — it cannot be settled and skipped at once.

## Not taken

| commit       | issue | why not                                                                                                                                                                                                                                                                                                                    |
| ------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `61ea0c646`  | T6768 | The case was written and it passed on the fix's parent. The production failure came through the async schema-operation runner; a plain `POST /base/{id}/table` already answered 400 before the fix.                                                                                                                        |
| `cfddb0057`  | T6862 | Tried in two shapes, both green on the fix's parent: deleting a link field then its target (the optional link's FK is `SET NULL`, so the leftover column blocks nothing), and the same inside a duplicated base on the theory that the copied key came back `NO ACTION`.                                                   |
| `cfddb0057`  | T6864 | Same two attempts as T6862 above — the two only reproduce together, and neither shape reproduced. T6863 from this same commit **is** covered, by `link/cross-base-link-clears-on-delete`.                                                                                                                                  |
| `529145a41`  | T6849 | Performance shape — a set-based split falling back to per-row LATERAL. Belongs in the performance lab; conditional-rollup cases already live there.                                                                                                                                                                        |
| `ca79dcb9c`  | T6845 | Retry classification. The difference is how quickly a task dead-letters, which no HTTP response reports.                                                                                                                                                                                                                   |
| `882651893`  | T6809 | Defense-in-depth for T6807: a guard that throws at build time for a caller that does not exist. No user-visible path reaches it.                                                                                                                                                                                           |
| `2ea2a0898`  | T6810 | Resolves an internal accessor so it stops contradicting the physical schema. No behavior a request can see changed.                                                                                                                                                                                                        |
| `f4770bb25`  | T6853 | Needs a physical relation to be missing — reachable through `fixture-db` — but the repair only runs on schema-operation retry, so the assertion would be waiting on the async runner. Same trap as T6768.                                                                                                                  |
| `26f0d50c2`  | T6823 | The reported symptom is a grid draw crash while formatting a cell. Server-side the same call is wrapped in a `try`/`catch` that falls back to display text, so the response does not change.                                                                                                                               |
| `3ca7f727c`  | T6830 | Observation is reachable, the trigger is not: it needs a computed plan already queued against a table that is then trashed.                                                                                                                                                                                                |
| `1a074971d`  | T6795 | Same shape as T6830 — a computed task already stuck when the table goes to trash.                                                                                                                                                                                                                                          |
| `82c7bcb94c` | T6865 | Overrides the response content type on presigned downloads for the s3, aliyun and minio adapters. The lab runs with the default `local` storage provider, so none of those three code paths is reached and the presigned URL the case would read is built somewhere else entirely.                                         |
| `161e960c71` | T6821 | Sargability. The behavior is identical either way; what changed is whether an index can be used, measured in the commit as 260s against 14ms for a 500-row batch. Belongs in the performance lab, next to the conditional-rollup cases.                                                                                    |
| `aea53eec6b` | T6815 | Request-scoped caching of a table aggregate on write paths. Same responses, fewer rebuilds - there is no response for a case to tell apart.                                                                                                                                                                                |
| `4087dad967` | T6883 | A subscription-level filter in a browser hook that made free spaces invisible to the base-generation flow. Nothing server-side changed, so no request answers differently.                                                                                                                                                 |
| `a9f56d9d51` | T6765 | Written and run: converting a number column into a lookup of a foreign formula completes correctly on the fix's parent, at 1 row and at 40, in about a second. See the note below this table.                                                                                                                              |
| `e94ae6db28` | T6767 | Written and run: a formula over a lookup of a link field stored in a leftover TEXT column backfills correctly on the fix's parent. Same note.                                                                                                                                                                              |
| `228be9ffa7` | T6770 | Written and run: a lookup of a link field added to a host whose rows are already linked seeds correctly on the fix's parent. Same note.                                                                                                                                                                                    |
| `a5a492ca9`  | T5386 | The older-name half of the same issue. A hand-made standalone unique index under the v1 name survives switching the constraint off on **both** columns, so nothing tells them apart. The current-name half `a3067488b` does reproduce and ships. See the note below.                                                       |
| `e0d3eaf6c`  | T5583 | Written in two shapes - asking for one day, and asking at a day boundary - both with a structured exact-date filter carrying a UTC+8 zone. Green on both columns each time: that path already honours the zone on the fix's parent.                                                                                        |
| `32a509014`  | T5419 | Written in two shapes - setting the link itself, and touching another column on a record whose link is already set - and green on both columns each time. The half of the fix that remains is in the sdk's record model, which this lab does not exercise.                                                                 |
| `9bc67c4be`  | T5686 | Written and run: creating a record without a required column that has a default already succeeds on the fix's parent, and the row holds the default. Green on both columns, run 32663341436. Its sibling `cae1c5c10`/T5685 does reproduce and ships.                                                                       |
| `db020d9ab`  | T6157 | Written in three shapes - a multi-select, a link, and a lookup of a link - and green on both columns each time. Whatever the missing cast broke, a formula written through the public API does not reach it. See the note below.                                                                                           |
| `ccc43864e`  | T6406 | Written in three shapes. A conditional rollup cannot be created through the public field API at all - it refuses a rollup with no link field - and the conditional lookup that can be created propagates correctly on the fix's parent. See the note below.                                                                |
| `45828597b`  | T6524 | Written and run three times. The last shape proved the observation is unavailable here: editing a cell writes no record history in this environment at all, within 60 seconds, so "the import wrote none" cannot be told from "nothing writes any". See the note below.                                                    |
| `dfe6a1ebc`  | T6614 | Written in three shapes and run three times, green on both columns each time. The dangling reference a `deleted_time` fixture produces does not reach the SQL builder the fix changes. See the note below the table.                                                                                                       |
| `bfe5599ed`  | T6615 | Written and run: a conditional lookup whose condition compares two columns of its source table selects every source row on the fix's parent and on `develop` alike, so the two columns are indistinguishable. See the note below the table.                                                                                |
| `c0ffdb358`  | T6511 | Written and run: clearing a filled text cell with typecast already stored `null` on the fix's parent, so the case is green on both columns. Run 32656127300.                                                                                                                                                               |
| `175d1de3f`  | T6728 | Written in three shapes and run three times. Every trigger a small fixture can reach through the public API computes inline, and inline compute fails closed identically on both sides of the fix. See the note below the table.                                                                                           |
| `3ff04d015`  | T5453 | Written in two shapes and run twice, green on both columns each time: a single-cell edit already answers with the row's formula recomputed on the fix's parent. See the note below the table.                                                                                                                              |
| `0a12e96a0`  | T5496 | The fix is in the v1 generated-column SQL conversion, which nothing in v2 imports. Written in two shapes and run twice anyway; green on both columns each time. See the note below the table.                                                                                                                              |
| `d134190e7`  | -     | Fast undo after a selection delete could restore nothing while still reporting success. The existing sentinel `undo/delete-records-undo-restores-all` was run against this parent and passed at 12 rows (run 32674455220) - the trash projection keeps up at that size. The commit's own reproduction is a 10k-row delete. |
| `98790484e`  | T6332 | Written in three shapes and run three times, green on both columns each time: renaming, re-pointing and un-lookup-ing a lookup of a formula are all accepted on the fix's parent. See the note below the table.                                                                                                            |

### Editing a lookup of a formula

`98790484e` / T6332. A column looking up a computed value across a link carried
a copy of the foreign formula's expression, and the fix stops that copy being
made so the column no longer blocks edit and convert.

| shape                                                     | pre-fix `d84818878` / `develop` | run         |
| --------------------------------------------------------- | ------------------------------- | ----------- |
| rename the column                                         | ✅ / ✅                         | 32675528990 |
| re-point it at a plain number on the same link            | ✅ / ✅                         | 32675852808 |
| convert it into a plain number field, not a lookup at all | ✅ / ✅                         | 32676121196 |

All three were accepted on the fix's parent, and the control - the same edits
on a lookup of a plain column - was accepted too, so nothing separates the
columns.

**Why is not established.** The fix touches create, convert, hydrate and
persistence; a lookup of a formula built through the public API on a
single-level formula may simply never carry the copied expression that the
blocking depends on. The next thing to try is a foreign formula whose
expression cannot be parsed outside its own table - one referencing several
fields, or a formula over a lookup - since it is the parse of the copied
expression that failed.

The shapes are gone; the runner is not kept.
| `6421635ca` | T6106 | Written and run: a pasted link cell reaches a watching client carrying the linked record's name on the fix's parent, so both columns look the same. See the note below the table. |
| `cfdbb6d37` | T3701 | Keeps the `is distinct from` guard on a formula backfill so unchanged rows are not rewritten. The values are identical either way - the commit's own test asserts on the generated SQL and on how many backfills start. Performance shape. |
| `5d49826f0` | - | Needs thousands of rows pointing at one group through a many-many link, so the reverse projection exceeds the computed-cell limit; the commit's own fixture is 5,200 rows. Too large for this lab's per-case budget, and the same subject as the T6728 row above. |
| `4eb2d5884` | T5469 | Written and run: deleting a row whose link points at a table that is gone succeeds on the fix's parent (run 32680133538). The record-delete half of the fix is in the v1 backend's link service; the v2 half is the junction-table rule, which the shipped `link/delete-a-link-whose-table-is-gone` already exercises. |
| `b80a3a947` | T5369 | Row-order index names collide only when they pass 63 characters. The name is `idx_<dbTableName>___row_<viewId>`, and tables in this lab carry the table id as their `dbTableName` (seen as `bse….tbl…` in the errors of runs 32676958449 and 32684390532), which puts every name near 49 characters. Nothing a request can ask for makes it longer. |

### The name on a pasted link cell

`6421635ca` / T6106. Copying a link cell puts the linked record's id and its
name on the clipboard; the paste dropped the name, so what was pushed to
everyone else watching the table read "Untitled" until they reloaded.

The case subscribed to the record document the grid holds - the right place to
look, because a read over HTTP fills the name in from the database - and after
the paste the watching client held `{id, title: "Order 1042"}` on both columns.
Run 32678857252, pre-fix `6b9f25148`.

Two earlier runs of the same case were the case's own faults and are not
evidence: 32678300431 addressed the paste endpoint with POST where it answers
PATCH, and 32678584833 read the cell as an object where it arrives as a list.

**Why the parent carried the name is not established.** The likely reading is
the shape of the paste: this case sends the structured value directly, while
the fix's summary describes the html clipboard that a grid copy writes. The
next thing to try is that html payload rather than the structured one.

The shape is gone; the runner is not kept.
| `b90f13537` | T3810 | Written and run: a file uploaded into a cell reaches a watching page carrying its temporary address on the fix's parent too (run 32696695384), so both columns look the same. The single-upload path is evidently decorated already; the fix also touches the batch-create and batch-update projections, which need an attachment token to reach and were not tried. |
| `384d2dad1` | T3531 | Written in two shapes and run twice, green on both columns each time: filling a two-way link in from the far side already reaches the near side, and clearing it from there already clears it. Many-to-many in run 32697213211, one-many in run 32697577570. |
| `2d93fbef4` | T3303 | Written and run: a formula comparing a number column against blank already answers per row on the fix's parent, empty and zero included (run 32698802701). The half that was broken is the v1 generated-column conversion in `sql-conversion.visitor.ts`, which the lab does not exercise - the same file as the T5496 row above. |
| `7829d83c6` | T6925 | Written in **three** shapes now. The first two were green on both columns: an overdue column added over existing rows computes on the fix's parent, whether written as a bare yes/no comparison (run 32705428574) or as an IF() returning two words (run 32704974280). The third went at the actual cause named in the commit - an `IF()` whose branches are a **date** and a word, so the column is typed as text and every branch is trimmed - and it does not express the behaviour either: on `develop` that column is created without error and then computes **nothing at all**, for the row taking the date and for the row taking the word alike, so there is no correct answer for a pre-fix column to differ from. The path the commit's own reproduction uses is still untried: the computed backfill a **field conversion** runs (`table.update`), not the pass that fills a newly created column. |
| `6ee7f96c4` | T6500 | Written and run twice, green on the fix's parent both times. This is the **field-conversion** backfill the T6925 row names as untried, so that path has now been tried: a table with a number column, rows, and a formula column reading it, then the number column converted to text inside the checkpoint, and in the second shape converted back again - which is what the report describes people doing. Neither direction reproduces `operator does not exist: double precision = text`. Something narrower decides whether the stored column and the freshly computed value end up different kinds; a formula that simply echoes the column is not it. The production reports name six computed fields across two tables in one base, so the shape may need a chain rather than one formula. |
| `7b969558a` | T6890 | Sorting, and deliberately not a change to it: nullable sorts stop emitting a leading `(expr IS NULL)` key and use Postgres's own NULLS FIRST/LAST instead. The commit and the issue both say the point is that the order stays identical to v1's - what changes is the length of the sort list and whether an index can serve it. There is nothing for a case to tell apart. Performance lab, if anywhere. |
| `1ea5d6c40` | T6669 | A read that stopped doing work twice: producing `extra.searchHitIndex` re-ran the whole v1 pipeline - bootstrapping v1 metadata, rebuilding the search WHERE, rescanning for ids that were then thrown away - to get a per-page hit index the v2 read could compute from the ids it already had. The hit index itself is the same on both sides. |
| `d36e266aa` | T6912 | Written in two shapes and run twice, green on both columns each time. A payroll chain - rate rows rolling up into an employee's highest rate, a payroll line borrowing that rate and the employee's site, a view filtered on the borrowed site - built entirely through ordinary requests opens on the fix's parent (run 32708030924). The same chain with the borrowed total's rule stripped the way the T6911 case strips it also opens (run 32709591507). The commit's own reproduction is a stored column shape neither of those two produce; what distinguishes it is not established. The already-shipped T6911 case was also run against this parent on its own and stayed green (run 32705941080). |
| `6c0970d52` | T6509 | Written in two shapes and run twice, green on both columns each time: a link cell pointing at a row whose name is blank, saved a second time unchanged, comes back without an empty name and can be written straight back. First shape run 32825087075; second - the link naming the column it shows, and the unnamed row written as explicitly having no name - run 32825483798. The commit's own reproduction goes through the v2 contract's own record endpoints rather than the public ones, and what the two send differently is not established. |
| `d28589d10` | T6734 | Written in two shapes and run twice, green on both columns each time: a date borrowed across a one-to-one link arrives on the fix's parent, both when the borrowing column is added next to a link that already exists (run 32836154719) and when the host's own date column is converted into a borrowed one (run 32836945426). The commit's own reproduction drains the computed queue between each step; what the two do differently is not established. |
| `66e3b7296` | T5480 | Written and run, green on both columns (run 32862819276): a text column named `Length in "inches"`, a worked-out column counting its letters, and a second worked-out column reading that one all compute on the fix's parent. The escaping the commit adds is on the identifier a column name becomes in the database, and the name a person types does not appear to reach the query as written - the same reason index names never grow long enough to hit the 63-character limit. Reaching it would need a stored column name the public field API does not produce. |
| `001d7afe7` | T4988 | Written and run, green on both columns (run 32864865929): a base whose table carries a physical column no field points at exports and imports back with every row on the fix's parent. The fix is in the v1 `.tea` CSV import processor and the lab forces v2, so the dump the fix repairs is not the dump this case produced - the same v1-only reason as the T5496, T3303, T6576 and T6502 rows. |
| `029085053` | T4128 | Written in two shapes and run twice, green on both columns each time: a worked-out number column blank on some rows and holding its number on the rest computes on the fix's parent, whether the rule says nothing with `BLANK()` (run 32868816376) or with `""` (run 32870606070). The cast the commit adds is on a number-typed formula whose SQL yields an empty string, and neither of these two appears to produce one. |
| `bf3d1c8f0` | T3275 | Written and run, green on both columns (run 32870765181): pasting a row's own value back over it leaves its last-changed stamp where it was on the fix's parent, with a real edit made the same way proving the stamp moves. What the commit suppresses is the update **event** broadcast to watching pages, which carries no data change - the lab's subscription exposes a document's data rather than the ops applied to it, and the paste's own response carries no count of changed cells to read instead. |
| `850931c78` | T1710 | Written in two shapes and run twice. The first sent the time zone as part of the display formatting through the partial-update path and left it untouched on develop too (run 32874596817) - the wrong request. The second uses the commit's own shape, a convert carrying the expression and the time zone, and is green on both columns (run 32878219817): the rule survives and the value moves by the difference between the two zones on the fix's parent. That parent is also the run that showed the lab could not load at all on commits without `ws`; the socket library is now required lazily. |
| `9d5db9b8c` | T1111 | Written and run, green on both columns (run 32883418438): a column refusing duplicates is deleted and undone, and a second row holding the same value is still refused on the fix's parent. The commit's own reproduction drives the v2 undo replay through that package's own harness rather than the public delete and undo endpoints; whether the two reach the same replay is not established. |
| `c2308148f` | T6310 | Written and run twice, red on **both** columns each time: a refused duplicate insert answers with the same English sentence whether the language is asked for by header (run 32887126281) or by the query parameter the product reads first (run 32888805127). The message is not localized on develop either, so the case cannot tell a missing translation from the bug. A refusal that the fix does localize would need finding first. |
| `aaa9ac78d` | T6959 | Written and run, green on both columns (run 32892611155): a number column converted into a formula producing padded reference codes fills every row on the fix's parent. The schema operation the commit repairs dies where the physical column's type and the rule's output disagree, and a conversion made through the public field API appears to align the column first. |
| `56fe8df36` | T4864 | Written in two shapes and run twice, red on **both** columns each time. Asked through the ordinary record endpoint with the link column's view, the product names nothing as linked on develop either (run 32901128869). Asked through a shared view of the host table, both columns refuse the query outright and with different messages - develop says the field is not found, the parent that it is not linked to the current table (run 32902812166) - so the selected-rows question is not addressed to the table this case addressed it to. Which read path the fix's `getViewRecords` belongs to, and what a client sends it, would have to be settled before a third attempt. |
| `301a8ea59` | T1516 | Written and run, green on both columns (run 32906244128): a many-to-many row whose link cell was blanked with SQL while the pairing record stayed deletes cleanly on the fix's parent. The constraint the commit repairs is on the pairing record itself, and blanking the cell on one side is evidently not the state that trips it - which side's records to leave inconsistent would have to be settled first. |
| `4e1be01f7` | T1980 | Written and run, green on both columns (run 32914315455): a deleted row lands in the table's trash on the fix's parent. The commit adds the trash projection to the **v2** delete path and its own reproduction turns v2 on with a canary setting; at a parent this old the lab's delete evidently does not take that path, so the case watched the one that always wrote. |
| `e79583132` | T1611 | Written in two shapes and run three times, and the case never established the product's own way of asking, so nothing about the product was measured. Passing an `isAfter` / `exactFormatDate` filter alongside the read returned every row on the fix's parent and none on develop (run 32915607313); a control with a cutoff before every row then returned none on develop too (run 32916759955); saving the same filter on the view and reading the view returned none on **both** columns for that control (run 32917872177). What a client actually sends for an exact-time comparison has to be settled before a fourth attempt - the commit's own reproduction goes through a `getFilterRecord` helper this repository does not have. |
| `93d97c3ba` | T5268 | Written and run: the by-id paste endpoint the case needs does not exist on the fix's parent - `urlBuilder` was handed an undefined template and the column errored (run 32888946585) - while develop pastes a blank first line correctly. The fix introduces the path it repairs, so there is no before to compare against through the public API. |
| `0548611b2` | T6576 | Not attempted. The commit's own reproduction is skipped under forced v2 - the spec gates it on the v1 path - and the lab forces v2, so the case could not go red. Same reason as the T5496 and T3303 rows. |
| `7cb4431e9` | T6502 | Not attempted, same reason: the commit covers the shape with a forced-v1 e2e, and the lab forces v2. |
| `057443dd6` | T6719 | Not attempted. The crash needs a preview flag that turns on a different record-query wrapper; the lab does not set it, so grid statistics take the ordinary path and nothing goes red. |
| `f160eea3b` | T7065 | Not taken while the fix is unshipped. A share-view scope bypass on the selection `*-by-id` endpoints, CVSS 8.1: the issue was still at "deployed to staging" when this batch was written, and a case here is a working public reproduction. It is a good case once it ships - the repro is a single request with a share header - so this row is a reminder, not a rejection. See CONTRIBUTING.md. |
| `ae70b638b` | T7104 | The failure is a connection timeout inside a `table.update` schema operation that then dead-letters after three attempts. What the fix changes is how that timeout is settled - rollback rather than an unrepairable failure - and the lab has no way to make a connection time out on request. Same async-runner trap as T6768 and T6853. |
| `8d5c0fe38` | T7067 | Selection aggregation was being answered by v1, where a date column met a cast v1 cannot do. The fix routes it to v2. That makes the pre-fix state "v1 answered", which `assertServedByV2` treats as the case being unable to run (💥) rather than as the bug - so the column that should be red is the one column the harness refuses to read. The observation is real and reachable; expressing it needs a runner allowed to assert that a request was **not** on v2, which does not exist here. |
| `9f5509f48` | T7019 | An incident, not a behaviour. Concurrent replicas UPSERTing the same five-minute query-observation window took transaction locks that held connections until the pool was exhausted; the fix hardens that write. What a case would have to reproduce is contention between replicas, and this harness runs one application against one database - a single writer never conflicts with itself. Belongs in the performance lab if anywhere. |
| `e3bb7671c` | T6988 | Not attempted, on the strength of the fix's own reproduction. The failure needs a client whose local `cmp_` doc was never created while the server snapshot already sits at generation 2 or higher, and the commit's e2e reaches that by stubbing the snapshot loader through a service hook **and** assigning `doc.version = 0` by hand. Neither is available here: the observation seam is a real subscription over the wire, which fetches the snapshot rather than replaying ops from zero. Reproducing it honestly means winning a race - subscribing to an empty doc and having the generation pass 1 before the create op arrives - which is the shape that produces cases green on every column. Worth revisiting if the realtime helper ever exposes the underlying doc. |
| `4b57c03da` | T7070 | Written and run. The fixture builds cleanly - a manyOne link with a column borrowed through it, then `fixture-db` drops the hidden `__fk_` column the link's own settings still name - and adding a row to the other table is refused. But the refusal is `Failed to insert record: column t.__fk_… does not exist`, raised during the insert, while the fix repairs `Failed to propagate dirty records`, raised by the deferred propagate. Two call sites. The commit's own e2e reaches the second by draining an outbox inside the v2 test container; this harness runs the Nest application, where the same small fixture computes inline and never gets there. Tried one-way and two-way links; both fail in the insert. Same trap as T6728. **The insert-path failure is still present on `develop`** - see the note below the table. |
| `893d0ce20` | T7066 | Written and run twice, green on the fix's parent both times. The report's precondition is that the summaries exist before the row does, so the answer is worked out during the write rather than filled in afterwards - built first by creating the row and its links in one call, then by creating the row and attaching the children as two writes, which is what the report's own steps describe. Neither reproduces. The sibling case `lookup/distinct-choices-in-the-order-they-appear` (T7044) is also **green** on this parent, measured, so it does not cover this either. The shape stays behind the `select-rollup-unique-and-count` runner's `whenTheRowIsWritten` and `alsoCheckAfterAnEdit` config values; a third attempt should start by finding what else the CLI path does that these two do not. |
| `4f35a4a64` | T7047 | The observation lives on the v2 contract's own list endpoint - `limit`/`cursor`/`includeTotal` - not on the public record API this lab reads through, and the lab's client does not speak it. What changed behind that endpoint is also performance-shaped: skip `count(*)` unless asked, page by cursor instead of OFFSET. Same reason as the T5268 row: much of the fix introduces the path it repairs, so there is no before to compare against. |
| `a4e2a0a55` | T7105 | Cost, not behaviour. Field masks unioned every readable field into the SQL projection, so a request for 27 columns still selected all 235. What the request answers with does not change - the same fields come back either way - so there is nothing for a case here to tell apart. It is the product-side follow-up to a 503 incident about wide-table polling, and belongs in the performance lab if anywhere. |
| `719079af1` | T6711 | The observation is a schema operation's own terminal classification - whether a leftover `table.import` is marked dead or repaired - which lives in the background runner and never reaches an HTTP response. The lab has no seam on that: the T7070 attempt established by measurement that a small fixture here computes inline and the deferred path is not reached. Same family as T6768 and T6853. |
| `64b6446061` | T6904 | Same seam. A computed task planned against a table whose `provision_state` is still `pending` was dead-lettered as an obsolete plan instead of retried; the fix changes how the worker classifies that. Both the trigger (a table caught mid-provision by a background stage) and the observation (the task's failure classification) are inside the worker. Nothing a request answers differs. |
| `023b657cd` | T6982 | Written and run twice, green on the fix's parent both times. A settings change was made, the job it recorded was rewritten by `fixture-db` into the interrupted shape the commit describes (pending, `metadata_pending`, no `last_error`, old enough to claim) and `table_meta.provision_state` set to `pending`. First shape asked that the table be out of reach and then come back; second asked only that it read within two minutes. **On both `28a55d9ac` and `develop` the table read immediately anyway**, so there is nothing to tell apart. Whatever else is true, a table carrying `provision_state = 'pending'` was not out of reach in this environment - which is the assumption both shapes were built on. What the fix changes is whether the keeper repairs the job or marks it dead, and that lives in the job's own row; the commit's own e2e reads it through Prisma and drives the runner in process. Same seam as T6711 and T6904. |
| `1f33ae31c` | T7061 | Written and run twice, green on the fix's parent both times. The chain is the reported one: a conditional lookup matching on a shared reference, a formula joining what it borrows, and a matching row added on the other side inside the checkpoint, with the fixture starting empty so the arrival is the trigger. First shape was lookup plus one formula; second added three more formula steps after it, because the commit says the fault needs a stage that runs the lookup edge **while the parent plan still has leftover formula steps**. Neither reproduced. Whether a plan splits into stages at all is the planner's decision - `d74a81ab1` explicitly keeps small chains in one stage - and a case cannot ask for a split from outside. Reaching this needs a chain long or wide enough that the planner splits it, which is a size nobody has established from the public API. |
| `38d0e067e` | T7035 | The half of this commit that fixes T7035 is in the browser: the comment panel renders the union of a paged cache and a locally patched list, the delete patch was undone by the stale page putting the comment straight back, and the fix drops it from the paged cache too. Nothing the server answers changes. The same commit's T7034 half **is** covered, by `record/comment-on-a-row-your-role-lets-you-see`. |
| `38d0e067e` | T7059 | Also in the browser, and further out: Enter posted a comment while an image was still uploading, so the placeholder went out with no url. The fix holds the composer until the upload lands and makes the progress visible. There is no request to observe - the wrong one was sent on purpose. |
| `55c73a01d` | T6893 | A migration, not a repair: it moves the remaining table REST handlers onto the v2 dual path and stops them reading v1 services. The pre-fix state is therefore "v1 answered", which `assertServedByV2` treats as the case being unable to run rather than as the bug - the column that should be red is the one the harness refuses to read. Same reading as T7067. |
| `41e9ae6de` | T6694 | Same shape, same reason: duplicate reads are moved onto v2. Before it, v1 answers. |
| `60f2045cf` | T6895 | The observation lives on an endpoint this commit introduces. A single POST timed out at the gateway on large workbooks, and the fix replaces it with a stream that reports committed rows as they land - so there is no request both sides answer, and the pre-fix side answers nothing at all on the input that makes the difference. The one behavioural half that is not new - other sheets keep importing after a row cap - still reaches it through the stream. Same reading as T5268. |
| `e770dd1ac` | T7057 | Index coverage, not results. Substring search documents and the trigram indexes behind them are narrowed to text-shaped fields, and an all-field search over an uncovered field falls back to the unindexed path rather than answering differently. What a search returns is the same on both sides; what changes is whether an index can serve it. Performance lab, if anywhere - same reading as T6821. |
| `f70f0d508` | T6944 | Neither commit carrying this issue id fixes the path `view/a-grid-grouped-by-a-column-you-cannot-read` observes. That case is red on `12407c409` (before this commit), on `7bc91231d` (after it), and on `f44a82cf8` (after both), and turns green only at `2ae77481c` — which carries T6997. This one narrows a grouping the server resolves from the view itself; the case exercises a grouping that arrives on the request, which is what the grid actually sends. Reaching the other path needs a request carrying no grouping while the view carries one, and the record endpoint the lab reads through does not obviously offer that. |
| `a4c8c3396` | T6944 | Same reading, same measurements: the case is red on `f44a82cf8`, which is after this commit. It aligns the group metadata a view reports with the permissions applied to it, which is what the settings screen reads, not what the grid's request for rows goes through. |
| `6235527b4` | T7027 | Not taken while the fix is unshipped. A folder's `children` still lists the ids of resources the caller may not read, so a permission-filtered response carries names of things the reader was filtered away from; the reported symptom is a console error and an empty folder. The issue was still at "deployed to staging" when this was written, and a `status: open` case here would be a public reproduction of an unshipped disclosure. Same call as T7065. The fixture it needs now exists (`framework/authority-matrix.ts`), so this is a reminder rather than a rejection: it is ready to write the day it ships. |

### The date comparison inside AND or OR

`0a12e96a0` / T5496. `IS_BEFORE`, `IS_AFTER` and `IS_SAME` were missing from the
list of functions that produce a yes or a no, so nested inside AND or OR they
fell through to "has a value, therefore yes" and the comparison was discarded.
A status column built on a date would say yes to every row that had one.

| shape                                                                   | pre-fix `87eff63c2` / `develop` | run         |
| ----------------------------------------------------------------------- | ------------------------------- | ----------- |
| rows seeded with their dates, the formula added last                    | ✅ / ✅                         | 32672010796 |
| rows seeded on one date and moved to their own after the formula exists | ✅ / ✅                         | 32672297955 |

Both shapes answered correctly on both columns, for all three rows: before the
window, inside it, after it.

The reason is settled and it is not about the shape of the fixture. The file
the fix changes is `sql-conversion.visitor.ts` under the v1 backend's
query-builder, and it is reached only through the v1 generated-column path.
Nothing under the v2 packages imports it - checked across `develop`. The lab
runs with every operation forced to v2, so this expression is never converted
by the code the fix repairs.

Worth carrying forward: a fix living under the v1 backend's own directories is
a reason to stop before writing the case, not after. The second run here was
spent on a fixture question that could not have mattered.

The shapes are gone; the runner is not kept.

### The inline computed value in a write response

`3ff04d015` / T5453. Both shapes were single-record edits reading the value of
a same-row formula out of the answer to the write, which is what the fix is
about.

| shape                                                                                  | pre-fix `e6c338e11` / `develop` | run         |
| -------------------------------------------------------------------------------------- | ------------------------------- | ----------- |
| a formula that is one cell times a number                                              | ✅ / ✅                         | 32671032258 |
| the fix's own shape - gated on a status, branching on the order type, rounded to money | ✅ / ✅                         | 32671353944 |

In both, the answer to the write carried the recomputed value and the row
settled to the same number, so there was nothing to tell the columns apart.

What the fix changes is a gate: in `hybrid` mode - the default, and what the
lab runs - only inserts computed inline before answering, and the fix extends
that to updates. Reading the code, an update on the fix's parent should have
gone to the outbox and answered stale. It did not. **Why is not established.**
The plausible reading is that a same-record formula of this shape is resolved
when the record is read rather than from a stored value, which would make the
gate irrelevant to what the answer says - but that was not verified, and it
should be before anyone spends another run here.

The next thing to try is a computed value that cannot be resolved on read: a
rollup or a lookup over a link, where the answer has to carry something another
table produced. That is a different subject from the one the fix names, so it
may not belong to this issue at all.

The shapes are gone; the runner is not kept.

### The three computed-backfill rows

All three are the same failure: a computed backfill whose SQL assignment
disagrees with the physical type of the column it lands in, killing the
`table.update` schema operation it runs inside. All three were built as cases
on a shared runner, and all three were green on every column of every run.

The rejection is not "the failure was invisible to the cases". It is stronger
than that, and it took three runs to establish:

1. **Four shapes, ten green pre-fix columns.** A number column converted into a
   lookup of a foreign formula; a formula over a lookup stored in a leftover
   text column; a lookup of a link field added to a host whose rows were
   already linked; and a lookup that had already computed, repointed from a
   date field to a text one. Runs 32395244311, 32395779980 and 32397534038.
2. **Batch size is not the variable.** These backfills are written as one
   `UPDATE ... FROM SELECT`, so a one-row fixture is what a per-row fast path
   would answer instead. Forty rows per shape changed nothing.
3. **The precondition is never built.** A probe read the stored
   `db_field_type` and the physical column type together, on the fix's parent,
   after each sequence. They agree every time — `REAL`/`double precision`,
   `JSON`/`jsonb`, `TEXT`/`text`, and `TEXT`/`text` again after the repoint
   that was expected to leave `DATETIME` behind.

So the drift these fixes are about does not happen here. Field conversion
through the public API re-derives `db_field_type` from the resulting shape; the
unconditional copy the fix removed is in the v2 core's own rebuild path, which
these requests do not take. The cases were watching a state that was never
there, on either side of the fix.

The work is kept rather than thrown away: branch
`attempt/computed-backfill-recast-green-everywhere`, unmerged, carrying the
four shapes, their fixture checks and the type-agreement probe. If a seam
appears that drives the conversion the way the v2 container does, start there —
the fixtures are correct, they simply have nothing to catch.

### The oversized-computed-cell row

The change isolates a computed cell that is over the 262144-byte ceiling
instead of failing the task it belongs to. Before it, one row whose formula
result was too big took every other row recomputing in the same pass down with
it — a real failure, and a legible one: the write answers 200 and the
neighbouring cells simply stop updating.

Three shapes were built and run. None of them reached the code the fix
changes, and each failed to for a different reason worth writing down, because
each looks like the obvious way to write this case:

1. **Creating the formula field last**, so the creation backfill computes every
   row. Green on both columns: it stored a 300000-byte computed cell on the
   fix's parent as well as on `develop`. The ceiling is enforced in the
   pipeline's record-change path, and the backfill never consults it. Run 32649775516.
2. **A bulk write on the table the formula lives on.** Red on both columns, and
   red at the write itself, which was refused with the data-safety error. That
   compute runs inline, and inline compute fails closed by design — the change
   says so in as many words.
   Run 32650260500.
3. **The formula in a second table, reading the first through a link**, on the
   theory that a recompute past the first dependency level is handed to the
   outbox worker. Red on both columns again, the same refusal at the same
   place. Run 32650718295.

The isolation belongs to the async worker: it is the only caller that asks for
it. So a case has to make the recompute go to the worker, and the one route
left is volume — the inline path is capped at 2000 dirty rows per table, so a
fixture would have to dirty more than that in one write and then wait out a
real worker pass. That is a different class of fixture from anything here
today, and it is where the next attempt should start rather than reshaping the
small ones again.

The three shapes are kept on branch `case/computed-oversized-cell`, unmerged.

### The dangling-computed-source row

The change degrades a rollup or lookup whose aggregation source field was
deleted without the dependent being marked broken - the residue of older delete
paths - instead of failing SQL generation with "Field not found" and killing
the whole computed task. That is a real and legible failure: the task is per
table, so one unmarked column stops every other computed column on it.

The fixture is the problem. Marking the source field's `deleted_time` is what
the old delete path left behind in the database, but it is not enough to make
the current builder reach for it, and three triggers were tried:

1. **A plain text edit on the dependent table.** Green on both columns - run 32654069014. Editing a text field queues no recompute involving the lookup
   at all.
2. **A healthy formula on the same table, edited into recomputing.** Green on
   both columns - run 32654350507. The healthy column recomputed on its own;
   the lookup's SQL was never generated.
3. **Touching the source row first, then the dependent.** Green on both columns
   - run 32654659137. The lookup still read its old value, so the plan did not
     consult the deleted field even then.

What the third run shows is the informative part: after the source field is
marked deleted, the lookup goes on answering its previous value. So the plan
this fixture produces is not the plan the fix repairs - either the dependency
graph is resolved from somewhere the fixture did not touch, or a real
occurrence needs the field row gone rather than tombstoned.

The next attempt should start by making a lookup actually fail SQL generation -
confirm the "Field not found" error can be produced at all - before building a
case around surviving it. The three shapes are kept on branch
`case/dangling-computed-source`, unmerged.

### The self-referencing conditional filter row

The change is about a conditional lookup whose filter names a column of the
table being read from on both sides of a field reference. Before it, the
builder swapped the two sides and probed the referenced column on the source
alias, answering `column s.<name> does not exist` and dead-lettering the
table's whole computed run.

Two shapes were built:

1. **Source table, condition, and lookup value all on the host table.** Errored
   at field creation on both columns — `column h.Left_Key does not exist`,
   `develop` included. The product does not build that shape at all, so it
   reproduces nothing. Run 32655173550.
2. **A source table with two key columns, the condition comparing them.** Red on
   both columns for the same reason: the lookup returned the values of _every_
   source row, the non-matching one included, on the fix's parent and on
   `develop` alike. Run 32655607286.

The second result is what closes it for now: on this fixture the condition is
not a row filter on either side of the fix, so there is nothing for a case to
tell apart. Either the filter needs a shape this attempt did not find, or the
production occurrence carries persisted filter state that the field editor does
not produce.

The sibling fix `3eff0a100` (T6599), whose filter names the _host_ table on
both sides, does reproduce and ships as
`lookup/conditional-filter-over-a-foreign-table`. Its runner still supports the
source-side shape, so a future attempt starts by changing one config value.

### The import-record-history row

The change stops an import writing one record-history entry per non-empty
cell. Creating a row through the product writes none - a new row has no
previous value - and an import is creating rows, so a 10000 x 20 sheet was
200000 entries nobody asked for.

Three shapes:

1. **In-place import into an existing table.** Green on both columns - run 32656953918.
2. **The create-table import, the handler the fix names.** Green on both
   columns again - run 32657518939.
3. **The same, with a positive control added first: edit a cell and require an
   entry to appear.** The control fires on both columns - runs 32657904880 at
   15 seconds and 32658159664 at 60. Record history is not written in this
   environment at all.

The third shape is what makes the first two meaningless rather than
encouraging: "the import wrote no history" is satisfied just as well by nothing
writing any, and a case built on it would pass on every commit forever.

Whether history is off by configuration, gated to an edition, or written by a
worker this lab does not run is not established here. Settling that is where
the next attempt starts, and until it is settled no assertion about record
history can be trusted in this repository - including in cases that would use
it only incidentally.

The three shapes are kept on branch `case/import-record-history`, unmerged. The
positive control in it is worth reading first: it is the part that turned two
silent greens into a finding.

### The conditional-summary propagation row

The change makes a write dirty the filtered summaries that depend on it. The
failure it fixes is legible and worth guarding: a summary that counts only some
rows keeps its old number after one of those rows changes, with the write
answering 200 and the source row showing the new value.

Three shapes, and the first two are about the API rather than the bug:

1. **A conditional rollup with the aggregation in the lookup options.** Both
   columns answered `Unrecognized key: "rollupExpression"` - run 32659440769.
2. **A conditional rollup with the aggregation in `options.expression`.** Both
   columns answered `LinkFieldId is required when isLookup attribute is true or
field type is rollup` - run 32659721790. The public field API has no shape
   for a rollup that reaches another table by condition instead of by link.
3. **A conditional lookup of the same column**, which the public API does
   accept, showing the matching values rather than their total. Green on both
   columns: the values follow the change on the fix's parent already - run 32660089795.

So the summary this change is about is built through the v2 container's own
field API, which the product's e2e suite uses and this lab does not. What the
public API can build propagates correctly either way.

The next attempt needs either a public shape for a conditional rollup - if one
appears, this becomes a one-line config change on the runner, which is kept -
or a reason to believe the lookup path can be made to fail. The runner is on
branch `case/conditional-rollup-propagation`, unmerged.

### The FIND-over-a-multi-valued-column row

The change casts both operands of `FIND`/`SEARCH` to text, because `POSITION`
fails when it is handed multi-select or link jsonb. The failure would be
legible - a formula that works over a text column produces an empty column
when pointed at a multi-valued one, with no error to read.

Three shapes were built, each a different storage form, and all three are green
on both columns:

1. **A multi-select column** - run 32661588045.
2. **A link column**, an array of objects rather than of strings - run 32661887104.
3. **A lookup of the linked rows' names**, an array of plain values - run 32662204754.

The first two are the shapes the commit itself names, which is what makes the
result worth recording rather than filing as a bad guess. A formula written
through the public field API compiles to something that already handles all
three on the fix's parent: either the cast was already present on this path, or
the path that lacked it is reached another way.

The runner keeps all three as a config value, so re-checking any of them is one
word. What it does not cover: `SEARCH`, which the fix changes alongside `FIND`,
and `TEXTBEFORE`, whose SQL snapshots the commit also updates. If a case is
attempted again, those are the next things to try, and the ledger row should be
deleted rather than extended if one of them reproduces.

Branch `case/find-over-multi-value`, unmerged.

### The unresolved-link-value row

A link cell carries the id of the row it points at and that row's title, and
the title is what the grid draws. The report is that after a write the cell
goes blank: the answer to the write carried the id alone, and whoever made the
change renders that answer.

Two shapes were built, both asserting on the write's own reply rather than a
read afterwards - a read resolves the title for itself, so a case checking one
would pass while the person who made the change still sees nothing:

1. **Sending the link itself.** Green on both columns - run 32663754305.
2. **Touching a different column on a record whose link is already set**, so
   the reply has to carry a value the request did not send. Green on both
   columns - run 32664049848.

The commit changes two things: the v2 update handler's response fields, and the
sdk's record model, which merges a write's answer into what the browser is
already holding. Both server shapes answer with the title on the fix's parent,
which leaves the sdk half - and that is a browser-side merge this lab has no
way to drive.

If this is attempted again, it needs a client that keeps state across writes
rather than an HTTP assertion. Branch `case/link-title-in-update-response`,
unmerged, keeps both shapes as a config value.

### The exact-date-filter timezone row

A date filter saved from the filter panel carries the zone that decides which
day the date is. Ignoring that zone answers for the neighbouring day, which is
the kind of wrong worth guarding: the result is a plausible list of records
rather than an error.

Two shapes, both with the structured `{mode: exactDate, exactDate, timeZone}`
value and a UTC+8 column, and both green on the fix's parent:

1. **`is`, asking for one day.** Two instants on the same local day returned
   together, correctly - run 32665470824.
2. **`isOnOrAfter`, asking at the boundary.** Two instants that are both the
   12th in UTC, one of them 00:30 on the 13th locally: only the local-13th row
   came back, correctly - run 32666048774.

The second is where a mishandled zone shows most sharply, and it did not show.
So whatever this fix repaired, the exact-date path reachable from the record
list already honours the zone on the parent.

The change spans 32 files, including the filter documentation and the rollout
admin, so the failing shape is likely a different filter mode - the relative
modes (`today`, `pastWeek`, `withIn`) or the `exactFormatDate` variant, none of
which were tried. That is where a next attempt starts.

The shapes live on the `legacy-date-filter` runner, which ships
`filter/plain-date-string-filters-a-date-column` for the sibling fix T5584;
its `filterValue` and `operator` config values keep both of these reachable.

### The legacy unique index row

T5386 was fixed twice: once for the index the current code writes
(`a3067488b`, which ships as
`field/turning-off-no-duplicates-lets-a-duplicate-in`) and once for indexes an
older version left behind (`a5a492ca9`).

The second was built on the same runner, with a standalone unique index created
by SQL under the v1 name - schema, table, three underscores, the field id.
Switching the column's constraint off leaves that index in place on the fix's
parent **and on `develop`**, so the two columns answer the same way and the
case cannot tell them apart. Run 32669542088.

What that means is not established here, and the difference matters:

- the fixture may not be building the state the fix targets. An index made by
  hand over a v2 column is not the same artefact as one an upgrade left, even
  under the same name; and
- there may be a real gap on `develop`.

Nothing in the run separates those, so this row claims only the first: the case
as built does not discriminate. Anyone picking it up should start by finding a
base that genuinely came through the upgrade, or by reading what the fix
matches on, rather than by trusting the name.

One earlier attempt is worth knowing about: naming the index
`<table>_<column>_unique` collides with the index the product itself writes,
and both columns answer 42P07. Run 32669273437.

The shape stays on branch `case/unique-toggle-cleanup` behind the runner's
`withLegacyIndex` config value.

## Covered

Not listed here. A case's own `bug.sourceCommits` carries that, and duplicating
it in prose is how the two drift apart. To see it:

```bash
pnpm triage:covered
```

### T7070's neighbour, still open

Rejecting the T7070 case turned up something that is not T7070. On `develop`,
a base holding a link whose hidden `__fk_` column is missing **cannot accept
rows into the table on the other side at all**: the insert itself is refused
with `column t.__fk_… does not exist`, before any propagation runs. Measured on
`8f3f6df16` and on `692c2b4b5`, with both one-way and two-way links.

T7070 repaired the propagate path for exactly this state. The insert path was
not part of it and answers the same way it did before. Whether that is worth
its own report is a judgment for a person; it is recorded here so the next pass
does not spend the same afternoon rediscovering it.

### The permission-matrix family is reachable, and nobody has built the fixture yet

Four uncovered fixes wait behind one piece of setup that does not exist here
yet: `2ae77481c5`/T6997 (v2 reads over masked values), `68b7d74f05`/T7025
(archiving gated by the matrix for restricted collaborators), `6235527b4c`/T7027
(references to permission-filtered nodes), and `a4c8c3396b`+`f70f0d5083`/T6944
(a grid view whose group field the reader cannot see returns no records at all,
with "Group references a field that is not readable").

None of them is blocked by the harness. The matrix is driven entirely through
public endpoints — `PATCH /api/base/:baseId/authority-matrix/status` to turn it
on, `GET /api/base/:baseId/authority-matrix`, `PUT
/api/base/:baseId/authority-matrix/:id` to shape a role — and a second signed-in
user comes from `test/utils/axios-instance/new-user`, which runners can import
the same way they import `init-app`. `enterprise/backend-ee/test/authority/` is
the worked example.

What is missing is a fixture that puts those together: matrix on, a role that
makes one field unreadable, a second user holding that role. That is a bigger
piece of setup than any case here has needed, and it is worth building once
rather than four times. T6944 is the best first customer — its symptom is the
whole view returning nothing, which is unmistakable — and T7025 should wait
either way, since it was still on staging when this was written.

### One server-side half of `38d0e067e` is waiting for its release

Alongside the two browser fixes above, that commit tightens two server checks:
deleting your own comment now needs `record|comment` as editing it does, and the
per-record comment count now needs `record|read` so the matrix row scope covers
it. Both are paths that were open and are now closed, which is a case shape this
repository can express and `framework/authority-matrix.ts` can already build.

It is not written yet for the same reason as T7065 and T7027: the issues were
still at "deployed to staging" when this was read, and a case here would be a
public reproduction of an unenforced permission that has not shipped. Worth
writing the day it does — the count one especially, since a count that ignores
the row scope reports on rows the reader cannot open.

### Something noticed while failing to reproduce T6925

On `develop`, a formula written as `IF({a checkbox}, {a date}, "a word")` is
accepted, is not marked as having an error, and computes nothing — no date on the
row whose checkbox is ticked, and not even the word on the row whose checkbox is
not. Measured while trying the third shape above, on a two-row table.

That is not T6925 and it is not claimed to be a fault here; a formula mixing a
date branch with a text branch may simply not be a supported thing to write. But
a column that is accepted, is not flagged, and answers nothing is worth somebody
looking at, and the next person to try this shape will hit it immediately.
