import type { Effect } from "./lib/stats.ts";
import type { RetentionCells } from "./lib/retention.ts";

export interface EffectRow extends Effect {
  arm: string;
  outcome: "visit" | "conversion" | "spend";
  p_holm: number;
}

export interface ExperimentResult {
  design: {
    arm_counts: Record<string, number>;
    srm_p_value: number;
    srm_ok: boolean;
    balance: ({ covariate: string } & Record<string, number | string>)[];
    max_abs_smd: number;
    balance_ok: boolean;
    missing_outcomes: number;
  };
  effects: EffectRow[];
  adjusted: { arm: string; outcome: string; diff: number; lo: number; hi: number }[];
  bootstrap_spend: { arm: string; diff: number; lo: number; hi: number; reps: number; seed: number }[];
  power: {
    alpha: number;
    power: number;
    n_per_arm: number;
    outcomes: Record<string, {
      baseline: number;
      mde_abs: number;
      mde_rel: number;
      sd?: number;
      simulated_power_at_mde?: number;
      observed: { arm: string; diff: number; power?: number; n_needed?: number }[];
    }>;
  };
  funnel: {
    arm: string; assigned: number; visited: number; converted: number; visit_rate: number;
    conversion_given_visit: number; spend_per_converter: number;
  }[];
  subgroups: {
    variable: string; arm: string; outcome: string; q: number; df: number; q_p_value: number;
    q_p_holm: number; cells: unknown[];
  }[];
}

export interface RetentionResult {
  status?: "missing";
  window: { first_month: string; last_full_month: string; data_end: string;
    partial_month_dropped: boolean; left_censored_cohort: string };
  cleaning: { rule: string; rows?: number; removed?: number }[];
  totals: { lines: number; orders: number; customers: number; first_order_median: number };
  cells: RetentionCells;
  min_cell: number;
  funnel: { window_days: number; eligible: number;
    steps: { orders: number; customers: number; share: number; lo: number; hi: number }[] };
  associations: {
    exposure: string; outcome: string; exposed: number; exposed_repeat: number; unexposed: number;
    unexposed_repeat: number; rr: number | null; rr_lo: number | null; rr_hi: number | null;
    e_value: number | null; e_value_ci: number | null;
  }[];
  sql_check: { matrix_equal: boolean; cells: number; clean_lines_sql: number;
    clean_lines_pandas: number };
}

export interface Manifest {
  version: string;
  sources: Record<string, { status: "real" | "missing"; sha256?: string; rows?: number }>;
}
