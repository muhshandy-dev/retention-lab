// In-browser recomputation of the Hillstrom experiment with Arquero.
// Mirrors experiment.effect() / subgroup_effects() in the Python package.

import * as aq from "arquero";
import { cochranQ, diffMeans, diffProportions, type Effect } from "./stats.ts";

export type Outcome = "visit" | "conversion" | "spend";
export type Variable = "newbie" | "channel" | "zip_code" | "history_segment";
export const OUTCOMES: Outcome[] = ["visit", "conversion", "spend"];
export const VARIABLES: Variable[] = ["newbie", "channel", "zip_code", "history_segment"];
export const MIN_PER_ARM = 100;

export interface HillstromFile {
  n: number;
  arms: string[];
  levels: Record<Variable, string[]>;
  digits: Record<"arm" | "visit" | "conversion" | Variable, string>;
  spend_cents: { index: number[]; value: number[] };
}

export interface ArmSummary {
  arm: number;
  n: number;
  visit: number;
  conversion: number;
  spend: number; // sum of cents
  spend2: number; // sum of squared cents
}

function digits(s: string): Int8Array {
  const out = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) - 48;
  return out;
}

export function toTable(file: HillstromFile) {
  const spend = new Float64Array(file.n);
  file.spend_cents.index.forEach((row, i) => {
    spend[row] = file.spend_cents.value[i];
  });
  const cols: Record<string, ArrayLike<number>> = { spend };
  for (const [name, s] of Object.entries(file.digits)) cols[name] = digits(s);
  return aq.table(cols);
}

/** Per-arm totals, optionally restricted to one level of one variable. */
export function summarise(table: ReturnType<typeof toTable>, variable?: Variable, level?: number):
  ArmSummary[] {
  let t = table;
  if (variable !== undefined && level !== undefined) {
    t = t.filter(aq.escape((d: Record<string, number>) => d[variable] === level));
  }
  const rows = t
    .groupby("arm")
    .rollup({
      n: aq.op.count(),
      visit: aq.op.sum("visit"),
      conversion: aq.op.sum("conversion"),
      spend: aq.op.sum("spend"),
      spend2: (d: any) => aq.op.sum(d.spend * d.spend),
    })
    .orderby("arm")
    .objects() as unknown as ArmSummary[];
  return rows;
}

export function effectFor(t: ArmSummary, c: ArmSummary, outcome: Outcome): Effect {
  if (outcome !== "spend") return diffProportions(t[outcome], t.n, c[outcome], c.n);
  const mean = (s: ArmSummary) => s.spend / 100 / s.n;
  // Sums are exact integers (cents), so the one-pass variance is exact up to rounding.
  const variance = (s: ArmSummary) => (s.spend2 - (s.spend * s.spend) / s.n) / (s.n - 1) / 10000;
  return diffMeans(mean(t), variance(t), t.n, mean(c), variance(c), c.n);
}

export interface SubgroupCell extends Effect {
  level: string;
  n_treatment: number;
  n_control: number;
}

export function subgroup(table: ReturnType<typeof toTable>, file: HillstromFile, variable: Variable,
  arm: number, outcome: Outcome): { cells: SubgroupCell[]; q: number; df: number; p: number } {
  const cells: SubgroupCell[] = [];
  file.levels[variable].forEach((level, code) => {
    const s = summarise(table, variable, code);
    const t = s.find((r) => r.arm === arm);
    const c = s.find((r) => r.arm === 0);
    if (!t || !c || Math.min(t.n, c.n) < MIN_PER_ARM) return;
    cells.push({ level, n_treatment: t.n, n_control: c.n, ...effectFor(t, c, outcome) });
  });
  const het = cells.length > 1
    ? cochranQ(cells.map((c) => c.diff), cells.map((c) => c.se))
    : { q: 0, df: 0, p: 1 };
  return { cells, ...het };
}
