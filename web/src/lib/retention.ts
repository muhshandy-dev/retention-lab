// Cohort matrix for the filter chosen on the site. Python publishes every filter view with
// small groups already hidden; the browser selects the view with Arquero, recomputes the
// Wilson intervals from the counts, and averages the visible cohorts into a curve.

import * as aq from "arquero";
import { wilsonCi } from "./stats.ts";

export interface RetentionViews {
  country: string[];
  tier: string[];
  cohort: string[];
  k: number[];
  active: (number | null)[];
  size: (number | null)[];
  suppressed: boolean[];
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

export function matrix(views: RetentionViews, filter: Filter): MatrixCell[] {
  const { country, tier } = filter;
  const rows = aq
    .table(views)
    .filter(aq.escape((d: { country: string; tier: string }) => d.country === country && d.tier === tier))
    .orderby("cohort", "k")
    .objects() as unknown as { cohort: string; k: number; active: number | null; size: number | null;
      suppressed: boolean }[];
  return rows.map((r) => {
    if (r.suppressed || r.size === null || r.active === null) {
      return { cohort: r.cohort, k: r.k, active: NaN, size: NaN, retention: NaN, lo: NaN, hi: NaN, suppressed: true };
    }
    const [lo, hi] = wilsonCi(r.active, r.size);
    return { cohort: r.cohort, k: r.k, active: r.active, size: r.size, retention: r.active / r.size, lo, hi,
      suppressed: false };
  });
}

/** Customer-weighted average retention by month since acquisition, over visible cohorts. */
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
