import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEngineRuntimeEnv,
  assertServedByV2,
  labEngine,
  pickRoutingHeaders,
} from "./engine.ts";

const headers = (engine, feature, reason = "env_force_v2_all") => ({
  "x-teable-v2": engine,
  "x-teable-v2-feature": feature,
  "x-teable-v2-reason": reason,
});

test("a v2 response with the expected feature is accepted", () => {
  const routing = assertServedByV2(headers("true", "getRecords"), {
    operation: "GET /record",
    feature: "getRecords",
  });
  assert.equal(routing.engine, "true");
  assert.equal(routing.feature, "getRecords");
  assert.equal(routing.reason, "env_force_v2_all");
});

// The failure this whole module exists for: v1 answered, the case found
// nothing because v1 never had the bug, and without this it reported a pass.
test("a v1 answer is refused rather than passed", () => {
  assert.throws(
    () =>
      assertServedByV2(headers("false", "getRecords", "disabled"), {
        operation: "GET /record",
        feature: "getRecords",
      }),
    /was not served by v2/,
  );
});

test("a response with no routing headers at all is refused", () => {
  assert.throws(
    () => assertServedByV2({}, { operation: "GET /record" }),
    /was not served by v2/,
  );
});

// v2 answering by some other path is nearly as bad as v1 answering: the case
// runs, finds nothing, and the row looks earned.
test("v2 answering by the wrong feature is refused", () => {
  assert.throws(
    () =>
      assertServedByV2(headers("true", "getRecordsGeneric"), {
        operation: "GET /record",
        feature: "getRecords",
      }),
    /wrong feature/,
  );
});

test("no declared feature means only the engine is checked", () => {
  const routing = assertServedByV2(headers("true", "whatever"), {
    operation: "GET /record",
  });
  assert.equal(routing.expectedFeature, undefined);
});

test("header lookup tolerates casing and array-valued headers", () => {
  const routing = pickRoutingHeaders({
    "X-Teable-V2": ["true"],
    "x-teable-v2-feature": "getRecords",
  });
  assert.equal(routing["x-teable-v2"], "true");
  assert.equal(routing["x-teable-v2-feature"], "getRecords");
  assert.equal(routing["x-teable-v2-reason"], "");
});

test("the engine is read live, not captured at import", () => {
  const previous = process.env.E2E_LAB_ENGINE;
  try {
    process.env.E2E_LAB_ENGINE = "v1";
    assert.equal(labEngine(), "v1");
    process.env.E2E_LAB_ENGINE = "v2";
    assert.equal(labEngine(), "v2");
    // Anything unrecognised is the guarded engine: a typo must not silently
    // demote a run to the reference column.
    process.env.E2E_LAB_ENGINE = "v3";
    assert.equal(labEngine(), "v2");
    delete process.env.E2E_LAB_ENGINE;
    assert.equal(labEngine(), "v2");
  } finally {
    if (previous === undefined) delete process.env.E2E_LAB_ENGINE;
    else process.env.E2E_LAB_ENGINE = previous;
  }
});

test("applyEngineRuntimeEnv sets the switch each engine needs", () => {
  const previous = process.env.FORCE_V2_ALL;
  try {
    applyEngineRuntimeEnv("v1");
    assert.equal(process.env.FORCE_V2_ALL, "false");
    applyEngineRuntimeEnv("v2");
    assert.equal(process.env.FORCE_V2_ALL, "true");
  } finally {
    if (previous === undefined) delete process.env.FORCE_V2_ALL;
    else process.env.FORCE_V2_ALL = previous;
  }
});

test("a v1 run answered by v2 throws rather than reporting v1's name", () => {
  const previous = process.env.E2E_LAB_ENGINE;
  process.env.E2E_LAB_ENGINE = "v1";
  try {
    // The failure this guards is a fabricated reference column: the base was
    // never unstamped, so v2 answered and the cell would carry v1's label.
    assert.throws(
      () =>
        assertServedByV2(headers("true", "", "new_base"), {
          operation: "GET /table/{tableId}/record",
        }),
      /requested of v1 but v2 answered/,
    );
    // v1 answering a v1 request is the expected case, and the missing feature
    // header is not a mismatch - that header is a v2 concept.
    const routing = assertServedByV2(headers("false", "", "disabled"), {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    assert.equal(routing.engine, "false");
    assert.equal(routing.reason, "disabled");
  } finally {
    if (previous === undefined) delete process.env.E2E_LAB_ENGINE;
    else process.env.E2E_LAB_ENGINE = previous;
  }
});
