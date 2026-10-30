// K9 for the cohort section: the browser matrix rebuilt from segment cells equals Python's.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { curve, matrix, type RetentionViews } from "../src/lib/retention.ts";

// RETENTION_JSON lets the Python end-to-end test point this at a freshly built file.
const source = process.env.RETENTION_JSON ?? new URL("../public/data/retention.json", import.meta.url);
const retention = JSON.parse(readFileSync(source, "utf8"));
const real = retention.status !== "missing";

test("browser cohort matrix equals the published matrix", { skip: !real && "retail data not run yet" }, () => {
  const rows = matrix(retention.views, { country: "all", tier: "all" });
  const m = retention.matrix;
  assert.equal(rows.length, m.cohort.length);
  rows.forEach((r, i) => {
    assert.equal(r.cohort, m.cohort[i]);
    assert.equal(r.k, m.k[i]);
    assert.equal(r.suppressed, m.suppressed[i]);
    if (!r.suppressed) {
      assert.equal(r.size, m.size[i]);
      assert.equal(r.active, m.active[i]);
      for (const f of ["retention", "lo", "hi"] as const) {
        assert.ok(Math.abs(r[f] - m[f][i]) <= 1e-8 * Math.max(1e-12, Math.abs(m[f][i])), `${f} ${i}`);
      }
    }
  });
});

test("every filter view matches Python and hides small groups", { skip: !real && "retail data not run yet" }, () => {
  const v = retention.views;
  for (const country of ["all", "uk", "non_uk"] as const) {
    for (const tier of ["all", "high", "low"] as const) {
      const rows = matrix(v, { country, tier });
      const idx = v.country.flatMap((c: string, i: number) => (c === country && v.tier[i] === tier ? [i] : []));
      assert.equal(rows.length, idx.length);
      rows.forEach((r, j) => {
        const i = idx[j];
        assert.equal(r.suppressed, v.suppressed[i]);
        if (!r.suppressed) {
          assert.ok(r.size >= retention.min_cell);
          assert.ok(Math.abs(r.lo - v.lo[i]) <= 1e-8 && Math.abs(r.hi - v.hi[i]) <= 1e-8, `${country}/${tier} ${i}`);
        }
      });
    }
  }
});

test("hidden groups carry no counts and are left out of the curve", () => {
  const views: RetentionViews = {
    country: ["all", "all", "uk", "uk"],
    tier: ["all", "all", "all", "all"],
    cohort: ["2010-01", "2010-01", "2010-01", "2010-01"],
    k: [0, 1, 0, 1],
    active: [62, 12, null, null],
    size: [62, 62, null, null],
    suppressed: [false, false, true, true],
  };
  const all = matrix(views, { country: "all", tier: "all" });
  assert.deepEqual(all.map((r) => [r.k, r.active, r.size]), [[0, 62, 62], [1, 12, 62]]);
  const uk = matrix(views, { country: "uk", tier: "all" });
  assert.ok(uk.every((r) => r.suppressed));
  assert.equal(curve(uk).length, 0);
  assert.equal(curve(all)[1].retention, 12 / 62);
});
