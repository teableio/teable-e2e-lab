import assert from "node:assert/strict";
import test from "node:test";
import { assertServedByV2, pickRoutingHeaders } from "./engine.ts";

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
