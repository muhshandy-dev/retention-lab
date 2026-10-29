// K9 for the cohort section: the browser matrix rebuilt from segment cells equals Python's.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { curve, matrix, type RetentionCells } from "../src/lib/retention.ts";

const retention = JSON.parse(readFileSync(new URL("../public/data/retention.json", import.meta.url), "utf8"));
const real = retention.status !== "missing";

test("browser cohort matrix equals the published matrix", { skip: !real && "retail data not run yet" }, () => {
  const rows = matrix(retention.cells, { country: "all", tier: "all" }, retention.min_cell);
  const m = retention.matrix;
  assert.equal(rows.length, m.cohort.length);
  rows.forEach((r, i) => {
    assert.equal(r.cohort, m.cohort[i]);
    assert.equal(r.k, m.k[i]);
    assert.equal(r.size, m.size[i]);
    assert.equal(r.suppressed, m.suppressed[i]);
    if (!r.suppressed) {
      assert.equal(r.active, m.active[i]);
      for (const f of ["retention", "lo", "hi"] as const) {
        assert.ok(Math.abs(r[f] - m[f][i]) <= 1e-8 * Math.max(1e-12, Math.abs(m[f][i])), `${f} ${i}`);
      }
    }
  });
});

test("segment filters partition the customers", () => {
  const cells: RetentionCells = {
    cohort: ["2010-01", "2010-01", "2010-01", "2010-01", "2010-01"],
    country_group: ["uk", "uk", "non_uk", "uk", "non_uk"],
    value_tier: ["high", "low", "high", "high", "high"],
    k: [0, 0, 0, 1, 1],
    active: [30, 20, 12, 9, 3],
    size: [30, 20, 12, 30, 12],
  };
  const all = matrix(cells, { country: "all", tier: "all" }, 10);
  assert.deepEqual(all.map((r) => [r.k, r.active, r.size]), [[0, 62, 62], [1, 12, 62]]);
  const uk = matrix(cells, { country: "uk", tier: "all" }, 10);
  assert.deepEqual(uk.map((r) => [r.k, r.active, r.size]), [[0, 50, 50], [1, 9, 50]]);
  const small = matrix(cells, { country: "non_uk", tier: "all" }, 13);
  assert.ok(small.every((r) => r.suppressed));
  assert.equal(curve(small).length, 0);
  const c = curve(all);
  assert.equal(c[1].retention, 12 / 62);
});
