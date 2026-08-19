import { defineBugCase } from "../../framework/types";

// T6844: a scalar number formula reading a linked text value through a
// oneMany lookup produced a computed UPDATE that cast a jsonb array straight
// to double precision. Postgres answered 22P02 ("invalid input syntax for
// type double precision: [0.0003]"), the pipeline retried and dead-lettered,
// and the user's cell just stayed empty forever.
export default defineBugCase({
  id: "formula/scalar-value-over-linked-text",
  title: "公式 VALUE() 读关联表的文本数字，结果要真的落到单元格",
  runner: "computed-value-lands",
  timeoutMs: 180_000,
  bug: {
    issue: "T6844",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-scalar-value-link",
    // The value from the production report. A leading-zero decimal is what
    // makes the failure legible: "[0.0003]" is a string Postgres will not read
    // as a double, while a value like "3" survives some of the broken casts by
    // accident.
    sourceValue: "0.0002",
    // Changed, not rewritten: the same value back is a no-op that queues no
    // recompute. Both are leading-zero decimals, the shape from the report -
    // "[0.0003]" is a string Postgres will not read as a double, while a value
    // like "3" can survive a broken cast by accident.
    sourceValueAfter: "0.0003",
    settleTimeoutMs: 30_000,
    settlePollIntervalMs: 500,
  },
});
