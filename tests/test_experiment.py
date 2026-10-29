from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from retention_lab import experiment as ex

RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "hillstrom.csv.gz"


def toy(n_per_arm=400, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for arm, pv in zip(ex.ARMS, (0.10, 0.18, 0.15), strict=True):
        visit = rng.random(n_per_arm) < pv
        conv = visit & (rng.random(n_per_arm) < 0.2)
        rows.append(
            pd.DataFrame(
                {
                    "recency": rng.integers(1, 13, n_per_arm),
                    "history_segment": rng.choice(ex.SUBGROUPS["history_segment"], n_per_arm),
                    "history": rng.uniform(30, 900, n_per_arm).round(2),
                    "mens": rng.integers(0, 2, n_per_arm),
                    "womens": rng.integers(0, 2, n_per_arm),
                    "zip_code": rng.choice(ex.SUBGROUPS["zip_code"], n_per_arm),
                    "newbie": rng.integers(0, 2, n_per_arm),
                    "channel": rng.choice(ex.SUBGROUPS["channel"], n_per_arm),
                    "segment": arm,
                    "visit": visit.astype(int),
                    "conversion": conv.astype(int),
                    "spend": np.where(conv, rng.uniform(30, 400, n_per_arm).round(2), 0.0),
                }
            )
        )
    return pd.concat(rows, ignore_index=True)


def test_schema_rejects_spend_without_conversion(tmp_path):
    df = toy()
    df.loc[0, ["spend", "conversion"]] = [10.0, 0]
    p = tmp_path / "bad.csv"
    df.to_csv(p, index=False)
    with pytest.raises(ex.SchemaError):
        ex.load(p)


def test_effects_equal_direct_computation():
    df = toy()
    rows = ex.primary_effects(df)
    assert len(rows) == 6 and all(r["p_holm"] >= r["p_value"] for r in rows)
    c = df[df.segment == ex.CONTROL]
    for r in rows:
        t = df[df.segment == r["arm"]]
        assert r["diff"] == pytest.approx(t[r["outcome"]].mean() - c[r["outcome"]].mean())


def test_adjusted_close_to_unadjusted_under_randomisation():
    df = toy(3000)
    plain = {(r["arm"], r["outcome"]): r for r in ex.primary_effects(df)}
    for r in ex.adjusted_effects(df):
        ref = plain[(r["arm"], r["outcome"])]
        assert abs(r["diff"] - ref["diff"]) < 0.25 * ref["se"]


def test_browser_table_round_trip():
    df = toy()
    t = ex.browser_table(df)
    assert t["n"] == len(df) and all(len(v) == len(df) for v in t["digits"].values())
    arm = np.array([int(c) for c in t["digits"]["arm"]])
    assert (np.array(ex.ARMS)[arm] == df["segment"].to_numpy()).all()
    cents = np.zeros(len(df), dtype=int)
    cents[t["spend_cents"]["index"]] = t["spend_cents"]["value"]
    assert np.allclose(cents / 100, df["spend"].to_numpy())


@pytest.mark.skipif(not RAW.exists(), reason="Hillstrom not downloaded")
def test_real_hillstrom_design_checks():
    df = ex.load(RAW)
    d = ex.design_checks(df)
    assert len(df) == 64000 and d["missing_outcomes"] == 0
    assert d["srm_ok"] and d["balance_ok"]
    assert sum(d["arm_counts"].values()) == 64000
