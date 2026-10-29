"""Randomised e-mail experiment (Hillstrom MineThatData 2008).

64,000 customers who bought in the last 12 months were randomly split into three equal
arms: a men's merchandise e-mail, a women's merchandise e-mail, and no e-mail (control).
Outcomes were tracked for two weeks after the send. Everything here is intention to treat:
the data has no open or click information, so "received the e-mail" cannot be separated
from "was assigned the e-mail".
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import stats as st

CONTROL = "No E-Mail"
ARMS = ["No E-Mail", "Mens E-Mail", "Womens E-Mail"]
OUTCOMES = {"visit": "proportion", "conversion": "proportion", "spend": "mean"}
EXPECTED_COLUMNS = [
    "recency",
    "history_segment",
    "history",
    "mens",
    "womens",
    "zip_code",
    "newbie",
    "channel",
    "segment",
    "visit",
    "conversion",
    "spend",
]

# Subgroups offered in the browser explorer. Labels are the raw codes; the web maps
# them to Indonesian text.
SUBGROUPS = {
    "newbie": [0, 1],
    "channel": ["Phone", "Web", "Multichannel"],
    "zip_code": ["Urban", "Surburban", "Rural"],
    "history_segment": [
        "1) $0 - $100",
        "2) $100 - $200",
        "3) $200 - $350",
        "4) $350 - $500",
        "5) $500 - $750",
        "6) $750 - $1,000",
        "7) $1,000 +",
    ],
}
MIN_PER_ARM = 100
BOOTSTRAP_REPS = 2000
SEED = 20261029


class SchemaError(ValueError):
    pass


def load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if list(df.columns) != EXPECTED_COLUMNS:
        raise SchemaError(f"unexpected columns: {list(df.columns)}")
    if df.isna().any().any():
        raise SchemaError("missing values present")
    if set(df["segment"]) != set(ARMS):
        raise SchemaError(f"unexpected arms: {sorted(set(df['segment']))}")
    for col in ("visit", "conversion", "mens", "womens", "newbie"):
        if not set(df[col]).issubset({0, 1}):
            raise SchemaError(f"{col} is not binary")
    if (df["spend"] < 0).any() or ((df["spend"] > 0) & (df["conversion"] == 0)).any():
        raise SchemaError("spend must be >= 0 and only positive for converters")
    return df


def effect(df_t: pd.DataFrame, df_c: pd.DataFrame, outcome: str) -> st.Effect:
    yt, yc = df_t[outcome].to_numpy(), df_c[outcome].to_numpy()
    if OUTCOMES[outcome] == "proportion":
        return st.diff_proportions(int(yt.sum()), len(yt), int(yc.sum()), len(yc))
    return st.diff_means(
        float(yt.mean()),
        float(yt.var(ddof=1)),
        len(yt),
        float(yc.mean()),
        float(yc.var(ddof=1)),
        len(yc),
    )


def _effect_dict(e: st.Effect) -> dict:
    return {
        "control": e.control,
        "treatment": e.treatment,
        "diff": e.diff,
        "lo": e.lo,
        "hi": e.hi,
        "p_value": e.p_value,
        "lift": e.lift,
        "lift_lo": e.lift_lo,
        "lift_hi": e.lift_hi,
        "se": e.se,
    }


def design_checks(df: pd.DataFrame) -> dict:
    counts = [int((df["segment"] == a).sum()) for a in ARMS]
    srm_p = st.srm_test(counts)

    covariates = {
        "recency": df["recency"],
        "history": df["history"],
        "mens": df["mens"],
        "womens": df["womens"],
        "newbie": df["newbie"],
    }
    for col in ("zip_code", "channel"):
        for level in SUBGROUPS[col]:
            covariates[f"{col}={level}"] = (df[col] == level).astype(int)

    control = df["segment"] == CONTROL
    balance = []
    for name, values in covariates.items():
        row = {"covariate": name}
        for arm in ARMS[1:]:
            row[arm] = st.smd(values[df["segment"] == arm].to_numpy(), values[control].to_numpy())
        balance.append(row)
    max_smd = max(abs(r[a]) for r in balance for a in ARMS[1:])

    return {
        "arm_counts": dict(zip(ARMS, counts, strict=True)),
        "srm_p_value": srm_p,
        "srm_ok": srm_p >= 0.001,
        "balance": balance,
        "max_abs_smd": max_smd,
        "balance_ok": max_smd < 0.1,
        "missing_outcomes": int(df[list(OUTCOMES)].isna().sum().sum()),
    }


def primary_effects(df: pd.DataFrame) -> list[dict]:
    control = df[df["segment"] == CONTROL]
    rows = []
    for arm in ARMS[1:]:
        treated = df[df["segment"] == arm]
        for outcome in OUTCOMES:
            rows.append(
                {"arm": arm, "outcome": outcome, **_effect_dict(effect(treated, control, outcome))}
            )
    for row, adj in zip(rows, st.holm([r["p_value"] for r in rows]), strict=True):
        row["p_holm"] = adj
    return rows


def adjusted_effects(df: pd.DataFrame) -> list[dict]:
    """Covariate-adjusted ITT effects (OLS, centred covariates, HC1 errors).

    Randomisation makes adjustment optional; it is reported as a robustness check and
    should land close to the unadjusted difference.
    """
    cov = pd.DataFrame(
        {
            "recency": df["recency"],
            "history": df["history"],
            "mens": df["mens"],
            "womens": df["womens"],
            "newbie": df["newbie"],
            "zip_urban": (df["zip_code"] == "Urban").astype(int),
            "zip_rural": (df["zip_code"] == "Rural").astype(int),
            "ch_web": (df["channel"] == "Web").astype(int),
            "ch_multi": (df["channel"] == "Multichannel").astype(int),
        }
    ).astype(float)
    cov = cov - cov.mean()
    treat = np.column_stack([(df["segment"] == a).astype(float) for a in ARMS[1:]])
    x = np.column_stack([np.ones(len(df)), treat, cov.to_numpy()])
    z = st.z_crit()
    rows = []
    for outcome in OUTCOMES:
        beta, se = st.ols_hc1(df[outcome].to_numpy(dtype=float), x)
        for i, arm in enumerate(ARMS[1:], start=1):
            rows.append(
                {
                    "arm": arm,
                    "outcome": outcome,
                    "diff": float(beta[i]),
                    "lo": float(beta[i] - z * se[i]),
                    "hi": float(beta[i] + z * se[i]),
                }
            )
    return rows


def bootstrap_spend(df: pd.DataFrame) -> list[dict]:
    """Percentile bootstrap for the spend difference (spend is zero for >99% of people)."""
    rng = np.random.default_rng(SEED)
    yc = df.loc[df["segment"] == CONTROL, "spend"].to_numpy()
    mc = yc[rng.integers(0, len(yc), (BOOTSTRAP_REPS, len(yc)))].mean(axis=1)
    rows = []
    for arm in ARMS[1:]:
        yt = df.loc[df["segment"] == arm, "spend"].to_numpy()
        mt = yt[rng.integers(0, len(yt), (BOOTSTRAP_REPS, len(yt)))].mean(axis=1)
        lo, hi = np.percentile(mt - mc, [2.5, 97.5])
        rows.append(
            {
                "arm": arm,
                "diff": float(yt.mean() - yc.mean()),
                "lo": float(lo),
                "hi": float(hi),
                "reps": BOOTSTRAP_REPS,
                "seed": SEED,
            }
        )
    return rows


def power_table(df: pd.DataFrame, effects: list[dict]) -> dict:
    control = df[df["segment"] == CONTROL]
    n = len(control)
    out = {"alpha": 0.05, "power": 0.8, "n_per_arm": n, "outcomes": {}}
    for outcome, kind in OUTCOMES.items():
        if kind == "proportion":
            p0 = float(control[outcome].mean())
            mde = st.mde_two_proportions(p0, n)
            entry = {
                "baseline": p0,
                "mde_abs": mde,
                "mde_rel": mde / p0,
                "simulated_power_at_mde": st.simulate_power_two_proportions(p0, mde, n),
            }
        else:
            sd = float(control[outcome].std(ddof=1))
            mde = st.mde_means(sd, n)
            entry = {
                "baseline": float(control[outcome].mean()),
                "sd": sd,
                "mde_abs": mde,
                "mde_rel": mde / float(control[outcome].mean()),
            }
        entry["observed"] = []
        for e in effects:
            if e["outcome"] != outcome:
                continue
            obs = {"arm": e["arm"], "diff": e["diff"]}
            if kind == "proportion":
                obs["power"] = st.power_two_proportions(e["control"], e["diff"], n)
                obs["n_needed"] = st.n_two_proportions(e["control"], e["diff"])
            entry["observed"].append(obs)
        out["outcomes"][outcome] = entry
    return out


def funnel(df: pd.DataFrame) -> list[dict]:
    rows = []
    for arm in ARMS:
        g = df[df["segment"] == arm]
        n, v, c = len(g), int(g["visit"].sum()), int(g["conversion"].sum())
        rows.append(
            {
                "arm": arm,
                "assigned": n,
                "visited": v,
                "converted": c,
                "visit_rate": v / n,
                "conversion_given_visit": c / v if v else 0.0,
                "spend_per_converter": float(g.loc[g["conversion"] == 1, "spend"].mean()),
            }
        )
    return rows


def subgroup_effects(df: pd.DataFrame) -> list[dict]:
    """Exploratory effects by subgroup with a Cochran Q heterogeneity test per split."""
    rows = []
    for var, levels in SUBGROUPS.items():
        for arm in ARMS[1:]:
            for outcome in OUTCOMES:
                diffs, ses, cells = [], [], []
                for level in levels:
                    g = df[df[var] == level]
                    t, c = g[g["segment"] == arm], g[g["segment"] == CONTROL]
                    if min(len(t), len(c)) < MIN_PER_ARM:
                        continue
                    e = effect(t, c, outcome)
                    cells.append(
                        {
                            "level": str(level),
                            "n_treatment": len(t),
                            "n_control": len(c),
                            **_effect_dict(e),
                        }
                    )
                    diffs.append(e.diff)
                    ses.append(e.se)
                q, dof, p = st.cochran_q(diffs, ses) if len(diffs) > 1 else (0.0, 0, 1.0)
                rows.append(
                    {
                        "variable": var,
                        "arm": arm,
                        "outcome": outcome,
                        "cells": cells,
                        "q": q,
                        "df": dof,
                        "q_p_value": p,
                    }
                )
    # Many splits are tested, so heterogeneity p-values are Holm-adjusted as one family.
    for row, adj in zip(rows, st.holm([r["q_p_value"] for r in rows]), strict=True):
        row["q_p_holm"] = adj
    return rows


def analyse(df: pd.DataFrame) -> dict:
    effects = primary_effects(df)
    return {
        "design": design_checks(df),
        "effects": effects,
        "adjusted": adjusted_effects(df),
        "bootstrap_spend": bootstrap_spend(df),
        "power": power_table(df, effects),
        "funnel": funnel(df),
        "subgroups": subgroup_effects(df),
    }


def browser_table(df: pd.DataFrame) -> dict:
    """Compact copy of the experiment for in-browser recomputation.

    The source has no customer identifiers. Small coded columns are stored as digit
    strings (one character per person, same row order). Spend is zero for everyone who
    did not convert, so it is stored sparsely as row indices and cents, which lets the
    browser sum integers exactly.
    """
    codes = {var: {str(v): i for i, v in enumerate(levels)} for var, levels in SUBGROUPS.items()}
    coded = {
        "arm": df["segment"].map({a: i for i, a in enumerate(ARMS)}),
        "visit": df["visit"],
        "conversion": df["conversion"],
        **{var: df[var].astype(str).map(codes[var]) for var in SUBGROUPS},
    }
    if any(c.isna().any() or c.max() > 9 for c in coded.values()):
        raise ValueError("coded column does not fit one digit")
    spend = (df["spend"] * 100).round().astype(int)
    nz = np.flatnonzero(spend.to_numpy())
    return {
        "n": len(df),
        "arms": ARMS,
        "levels": {var: [str(v) for v in levels] for var, levels in SUBGROUPS.items()},
        "digits": {k: "".join(map(str, v.astype(int).tolist())) for k, v in coded.items()},
        "spend_cents": {"index": nz.tolist(), "value": spend.to_numpy()[nz].tolist()},
    }
