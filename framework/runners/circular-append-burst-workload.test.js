import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPUTED_FIELD_COUNTS,
  FIELD_COUNTS,
  appendedHostSubOrderRows,
  appendedPurificationRows,
  expectedPurificationComputed,
  expectedSubOrderComputed,
  expectedSubOrderExpressionCard,
  purificationRowBySubOrderRow,
  purificationRowTotal,
  subOrderRowForPurification,
} from "./circular-append-burst-workload.ts";

// The committed case config's model subset.
const config = {
  orderRowCount: 6_000,
  subOrderRowCount: 3_000,
  purificationRowCount: 500,
  plasmidRowCount: 3,
  orderPermutation: { multiplier: 7, offset: 3 },
  purificationSubOrderPermutation: { multiplier: 13, offset: 5 },
  purificationOrderPermutation: { multiplier: 11, offset: 2 },
  appendRowCount: 400,
};

test("field counts match the incident fingerprint totals", () => {
  assert.deepEqual(FIELD_COUNTS, {
    plasmid: 16,
    orders: 34,
    subOrders: 85,
    purification: 88,
  });
  // Every computed family count matches the fingerprint: SubOrders 6+7+3+8,
  // Purification 18+8+1+14.
  assert.deepEqual(COMPUTED_FIELD_COUNTS, {
    orders: 6,
    subOrders: 24,
    purification: 41,
  });
});

test("purification -> sub-order mapping is injective over both phases", () => {
  const seedMap = purificationRowBySubOrderRow(config, "seed");
  assert.equal(seedMap.size, 500);
  assert.equal(subOrderRowForPurification(1, config), 6);
  assert.equal(seedMap.get(6), 1);

  const appendedMap = purificationRowBySubOrderRow(config, "appended");
  assert.equal(appendedMap.size, 900);
  assert.equal(purificationRowTotal(config, "appended"), 900);
});

test("the burst appends rows 501..900 onto previously purification-free hosts", () => {
  const appended = appendedPurificationRows(config);
  assert.equal(appended.length, 400);
  assert.equal(appended[0], 501);
  assert.equal(appended[399], 900);

  const hosts = appendedHostSubOrderRows(config);
  assert.equal(hosts.length, 400);
  assert.equal(new Set(hosts).size, 400, "each appended row has its own host");

  // Every appended host was purification-free before the burst, so its
  // lookups flip from empty to values — presence, not a value diff.
  const seedMap = purificationRowBySubOrderRow(config, "seed");
  for (const host of hosts) {
    assert.equal(seedMap.get(host), undefined);
  }
});

test("a host's expectations flip from empty lookups to the full computed set", () => {
  const host = subOrderRowForPurification(501, config);
  const before = expectedSubOrderComputed(host, config, undefined);
  assert.deepEqual(before.lu_p_batch_code, { kind: "empty" });
  assert.deepEqual(before.so_is_expressible, { kind: "skip" });

  const after = expectedSubOrderComputed(host, config, 501);
  assert.deepEqual(after.lu_p_batch_code, {
    kind: "value",
    value: "p-batch-501",
  });
  assert.deepEqual(after.lu_p_expression_mg_l, { kind: "value", value: 5_010 });
  // The incident's signature field: stuck on "NO-..." when propagation is
  // dropped, "YES-..." once the appended row's link has landed.
  assert.equal(after.so_is_expressible.kind, "value");
  assert.ok(String(after.so_is_expressible.value).startsWith("YES-"));
  assert.equal(
    after.so_expression_card.value,
    expectedSubOrderExpressionCard(host, 501, config),
  );
  // Fields outside the purification chain are phase-stable.
  assert.deepEqual(before.lu_o_attr_01, after.lu_o_attr_01);
  assert.deepEqual(before.so_formula_08, after.so_formula_08);
});

test("appended purification rows follow the same algebra as seeded rows", () => {
  const seeded = expectedPurificationComputed(1, config);
  const appended = expectedPurificationComputed(501, config);
  assert.deepEqual(Object.keys(seeded), Object.keys(appended));
  assert.equal(appended.p_formula_13.value, "PF13 Purification 501");
  const host = subOrderRowForPurification(501, config);
  assert.equal(appended.lu_so_title.value, `SubOrder ${host}`);
  // The circle-closing chain: p_chain_card sits on the reverse lookup of the
  // SubOrders formula that consumed this row's own formula.
  assert.equal(
    appended.p_chain_card.value,
    `P Purification 501 :: ${expectedSubOrderExpressionCard(host, 501, config)}`,
  );
});

test("no computed cell survives with a constant value across rows", () => {
  // Two different hosts must not share expectations for row-derived fields —
  // a copy-paste error in the value functions would otherwise let a stale
  // row pass by coincidence.
  const a = expectedPurificationComputed(501, config);
  const b = expectedPurificationComputed(502, config);
  const differing = Object.keys(a).filter(
    (field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]),
  );
  assert.ok(
    differing.length >= 30,
    `expected most purification computed fields to differ between rows, got ${differing.length}`,
  );
});
