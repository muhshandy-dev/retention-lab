// Cohort matrix from published segment cells, recomputed in the browser with Arquero so the
// country and first-order filters work without any customer-level data.

import * as aq from "arquero";
import { wilsonCi } from "./stats.ts";

export interface RetentionCells {
  cohort: string[];
  country_group: string[];
  value_tier: string[];
  k: number[];
  active: number[];
  size: number[];
}

export interface MatrixCell {
  cohort: string;
  k: number;
  active: number;
  size: number;
  retention: number;
  lo: number;
  hi: number;
  suppressed: boolean;
}

export interface Filter {
  country: "all" | "uk" | "non_uk";
  tier: "all" | "high" | "low";
}

export function matrix(cells: RetentionCells, filter: Filter, minCell: number): MatrixCell[] {
  let t = aq.table(cells);
  if (filter.country !== "all") {
    const c = filter.country;
    t = t.filter(aq.escape((d: { country_group: string }) => d.country_group === c));
  }
  if (filter.tier !== "all") {
    const v = filter.tier;
    t = t.filter(aq.escape((d: { value_tier: string }) => d.value_tier === v));
  }
  // Every customer is active in their own acquisition month, so k = 0 carries cohort size.
  const sizes = t
    .filter((d: any) => d.k === 0)
    .groupby("cohort")
    .rollup({ size: aq.op.sum("size") });
  const active = t.groupby("cohort", "k").rollup({ active: aq.op.sum("active") });
  const rows = active.join(sizes, "cohort").orderby("cohort", "k").objects() as unknown as
    { cohort: string; k: number; active: number; size: number }[];
  return rows.map((r) => {
    const [lo, hi] = wilsonCi(r.active, r.size);
    return { ...r, retention: r.active / r.size, lo, hi, suppressed: r.size < minCell };
  });
}

/** Customer-weighted average retention by month since acquisition, over unsuppressed cohorts. */
export function curve(rows: MatrixCell[]): { k: number; retention: number; lo: number; hi: number;
  customers: number }[] {
  const byK = new Map<number, { active: number; size: number }>();
  for (const r of rows) {
    if (r.suppressed) continue;
    const e = byK.get(r.k) ?? { active: 0, size: 0 };
    e.active += r.active;
    e.size += r.size;
    byK.set(r.k, e);
  }
  return [...byK.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, e]) => {
      const [lo, hi] = wilsonCi(e.active, e.size);
      return { k, retention: e.active / e.size, lo, hi, customers: e.size };
    });
}
