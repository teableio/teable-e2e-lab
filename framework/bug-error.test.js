import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBugError } from "./bug-error.ts";

test("top-level HttpError status is preserved without request config", () => {
  const error = Object.assign(new Error("Forbidden"), {
    status: 403,
    data: { message: "outside token range" },
    config: { headers: { Authorization: "not-for-artifacts" } },
  });

  const normalized = normalizeBugError(error);
  assert.equal(normalized.status, 403);
  assert.equal(normalized.response, '{"message":"outside token range"}');
  assert.equal(JSON.stringify(normalized).includes("not-for-artifacts"), false);
});

test("an Axios response remains richer than a top-level status", () => {
  const error = Object.assign(new Error("Request failed"), {
    status: 500,
    data: { message: "top level" },
    response: { status: 422, data: { message: "server response" } },
  });

  const normalized = normalizeBugError(error);
  assert.equal(normalized.status, 422);
  assert.equal(normalized.response, '{"message":"server response"}');
});
