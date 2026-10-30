// K9: the browser statistics must reproduce the Python results.
// Exported floats carry 10 significant digits, so agreement is checked at 1e-8 relative.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { effectFor, type HillstromFile, OUTCOMES, subgroup, summarise, toTable, VARIABLES }
  from "../src/lib/experiment.ts";
import * as st from "../src/lib/stats.ts";

const data = (name: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf8"));
const experiment = data("experiment.json");
const file: HillstromFile = data("hillstrom.json");
const table = toTable(file);

function close(actual: number, expected: number | null, label: string, rel = 1e-8) {
  if (expected === null) {
    assert.ok(Number.isNaN(actual), `${label}: expected NaN, got ${actual}`);
    return;
  }
  const tol = rel * Math.max(1e-300, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);
}

const FIELDS = ["control", "treatment", "diff", "lo", "hi", "p_value", "lift", "lift_lo", "lift_hi",
  "se"] as const;

test("normal functions match known values", () => {
  close(st.normPpf(0.975), 1.959963984540054, "ppf", 1e-14);
  close(st.normSf(1.959963984540054), 0.025, "sf", 1e-13);
  close(st.normSf(8), 6.22096057427174e-16, "sf tail", 1e-12);
  close(st.normSf(22), 1.4398924351450382e-107, "sf deep tail", 1e-10);
  close(st.chi2Sf(3.84145882069412, 1), 0.05, "chi2", 1e-12);
  close(st.chi2Sf(12.591587243743977, 6), 0.05, "chi2 df6", 1e-12);
});

test("primary effects recomputed from the raw table", () => {
  const arms = summarise(table);
  assert.equal(arms.reduce((a, r) => a + r.n, 0), 64000);
  for (const row of experiment.effects) {
    const t = arms[file.arms.indexOf(row.arm)];
    const e = effectFor(t, arms[0], row.outcome);
    for (const f of FIELDS) close(e[f], row[f], `${row.arm}/${row.outcome}/${f}`);
  }
  const adj = st.holm(experiment.effects.map((r: { p_value: number }) => r.p_value));
  experiment.effects.forEach((r: { p_holm: number }, i: number) => close(adj[i], r.p_holm, "holm"));
});

test("every subgroup cell and heterogeneity test", () => {
  let checked = 0;
  for (const row of experiment.subgroups) {
    const res = subgroup(table, file, row.variable, file.arms.indexOf(row.arm), row.outcome);
    assert.equal(res.cells.length, row.cells.length, `${row.variable} cell count`);
    res.cells.forEach((cell, i) => {
      const ref = row.cells[i];
      assert.equal(cell.level, ref.level);
      assert.equal(cell.n_treatment, ref.n_treatment);
      for (const f of FIELDS) close(cell[f], ref[f], `${row.variable}=${cell.level}/${f}`);
      checked++;
    });
    close(res.q, row.q, `${row.variable} Q`, 1e-7);
    close(res.p, row.q_p_value, `${row.variable} Q p`, 1e-7);
  }
  assert.ok(checked >= 80, `only ${checked} cells`);
  assert.deepEqual([...new Set(experiment.subgroups.map((r: { variable: string }) => r.variable))],
    VARIABLES);
  assert.deepEqual([...new Set(experiment.effects.map((r: { outcome: string }) => r.outcome))],
    OUTCOMES);
});

test("power and MDE", () => {
  const p = experiment.power;
  for (const o of ["visit", "conversion"]) {
    const e = p.outcomes[o];
    close(st.mdeTwoProportions(e.baseline, p.n_per_arm), e.mde_abs, `${o} mde`, 1e-8);
    for (const obs of e.observed) {
      close(st.powerTwoProportions(e.baseline, obs.diff, p.n_per_arm), obs.power, `${o} power`);
      assert.equal(st.nTwoProportions(e.baseline, obs.diff), obs.n_needed);
    }
  }
  close(st.mdeMeans(p.outcomes.spend.sd, p.n_per_arm), p.outcomes.spend.mde_abs, "spend mde");
});
