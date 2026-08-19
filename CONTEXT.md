# Vocabulary

The point of this list is that people, agents, and reports say the same thing.
The most expensive ambiguity is what "passed" means, so **Observation**,
**Verdict**, and **Acceptance** are kept strictly apart: a case observes, the
framework judges the observation against a declaration, and acceptance asks
whether the whole run produced the evidence it planned to.

Each entry gives the definition and the words to avoid. The avoided words are
not a style preference — each one quietly changes a conclusion when it turns up
in a discussion.

**Case**
The complete declaration of one reproduction: a runner, a config, and the bug
it is about. Pure data, no behavior of its own.
_Avoid_: test, script, scenario.

**Runner**
The execution shared by a family of cases. It builds the fixture, verifies the
fixture stands up, observes the bug inside a checkpoint, and cleans up. Cases
pair with exactly one runner kind, and the type system enforces the pairing.
_Avoid_: executor, driver, handler.

**Group**
The segment before the slash in a case id, matching one directory under
`cases/`, and the unit the case filter selects on.
_Avoid_: suite, scope, folder.

**Fixture**
The state a case builds before it can ask its question: tables, fields, rows,
and — where the API cannot express it — state written straight to the database
(see `framework/fixture-db.ts`). Built and torn down inside the case.
_Avoid_: test data, seed data, environment.

**Checkpoint**
The region of a runner where the bug is observed, marked by `bugCheckpoint()`.
Anything thrown inside it counts as the bug reproducing, including a 500 from
the endpoint under test; anything thrown outside it is setup trouble. This
boundary is the single most important convention in the repository — it is what
separates "the bug is present" from "the case is broken".
_Avoid_: assertion block, test body.

**Observation**
What a run saw: `absent`, `present`, or `error`. A case never "passes" — it
observes, and the observation is judged separately.
_Avoid_: result, outcome, status.

**Bug status**
The human-maintained declaration on a case: `open` (known, unfixed) or `fixed`
(the correct behavior is expected to hold). The only judgment input a person
maintains, and the reason an observation can be judged at all.
_Avoid_: expected result, state.

**Verdict**
The label the framework computes from observation × status: `pass`,
`expected-fail`, `unexpected-pass`, `regression`, `error`. Derived, never
interpreted by a person. The table is in `framework/verdict.ts`.
_Avoid_: result, conclusion, pass/fail.

**Gating column**
The revision a comparison actually judges — the newest commit of a comparison,
or the single commit of a targeted run. A `regression` turns the run red only
here: on older columns, a fixed bug reproducing is history, not a regression.
_Avoid_: baseline, main, latest.

**Case error**
The case never reached its checkpoint: the fixture would not build, the engine
would not route, the harness broke. Distinct from observing the bug, stored as
a different field in the artifact, and red on every column — a case that
observed nothing must never be counted as agreeing with anything.
_Avoid_: failure, crash.

**Evidence**
The structured facts explaining a verdict: resource ids, the routing record,
expected versus observed values, the server's own error body.
_Avoid_: logs, output, debug info.

**Artifact**
The JSON one case produces in one run, written before any assertion is allowed
to throw — so a red run always leaves its evidence behind.
_Avoid_: report, log file.

**Comparison**
The bug × commit table built from artifacts, plus the transitions read off it
("fixed between these two", "regression appeared between these two").
_Avoid_: matrix, summary.

**Acceptance**
The fail-closed judgment over a whole run, starting from the plan: every
planned (case × commit) cell must carry exactly one readable result. Stricter
than "was anything red" — missing evidence fails, because an empty cell reads
as green to whoever opens the table.
_Avoid_: pass rate, success rate.

**Engine**
The record engine serving the requests, v1 or v2. teable-ee is migrating to v2
and v1 bugs are not being fixed, so the lab runs v2 and every runner proves it
(`framework/engine.ts`).
_Avoid_: mode, version, backend.

**Run**
One dispatch of `e2e-lab.yml`: a pinned list of teable-ee commits, one job per
commit, one artifact per case per commit.
_Avoid_: batch, build, job.
