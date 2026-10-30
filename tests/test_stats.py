import math

import numpy as np
import pytest
from scipy import stats as sps
from statsmodels.regression.linear_model import OLS
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.proportion import (
    confint_proportions_2indep,
    proportion_confint,
    proportions_ztest,
)

from retention_lab import stats as st

TOL = 1e-9


@pytest.mark.parametrize("k,n", [(0, 10), (3, 10), (122, 21306), (500, 500), (1, 1)])
def test_wilson_matches_statsmodels(k, n):
    lo, hi = st.wilson_ci(k, n)
    ref = proportion_confint(k, n, method="wilson")
    assert lo == pytest.approx(ref[0], abs=TOL)
    assert hi == pytest.approx(ref[1], abs=TOL)


def test_diff_proportions_matches_statsmodels():
    k1, n1, k0, n0 = 267, 21307, 122, 21306
    e = st.diff_proportions(k1, n1, k0, n0)
    lo, hi = confint_proportions_2indep(k1, n1, k0, n0, method="newcomb", compare="diff")
    assert e.lo == pytest.approx(lo, abs=TOL)
    assert e.hi == pytest.approx(hi, abs=TOL)
    _, p = proportions_ztest([k1, k0], [n1, n0])
    assert e.p_value == pytest.approx(p, rel=1e-9)
    lo_r, hi_r = confint_proportions_2indep(k1, n1, k0, n0, method="log", compare="ratio")
    assert e.lift_lo == pytest.approx(lo_r - 1, abs=TOL)
    assert e.lift_hi == pytest.approx(hi_r - 1, abs=TOL)


def test_diff_means_is_welch_with_normal_critical_value():
    rng = np.random.default_rng(1)
    a, b = rng.exponential(2.0, 5000), rng.exponential(1.8, 4000)
    e = st.diff_means(a.mean(), a.var(ddof=1), len(a), b.mean(), b.var(ddof=1), len(b))
    se = math.sqrt(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b))
    assert e.diff == pytest.approx(a.mean() - b.mean(), abs=TOL)
    assert e.hi - e.lo == pytest.approx(2 * sps.norm.ppf(0.975) * se, abs=TOL)
    welch = sps.ttest_ind(a, b, equal_var=False)
    assert e.p_value == pytest.approx(welch.pvalue, rel=0.05)  # t vs z, deep in the tail


def test_holm_matches_statsmodels():
    p = [0.01, 0.04, 0.03, 0.005, 0.2, 0.04]
    assert st.holm(p) == pytest.approx(list(multipletests(p, method="holm")[1]), abs=TOL)


def test_power_formula_agrees_with_simulation():
    """K5: analytic power within 2 points of Monte Carlo."""
    for p0, n in [(0.0057, 21306), (0.106, 21306), (0.2, 800)]:
        mde = st.mde_two_proportions(p0, n)
        assert st.power_two_proportions(p0, mde, n) == pytest.approx(0.8, abs=1e-9)
        sim = st.simulate_power_two_proportions(p0, mde, n, sims=6000, seed=3)
        assert abs(sim - 0.8) <= 0.02
        n_need = st.n_two_proportions(p0, mde)
        assert abs(n_need - n) <= 2


def test_mde_means_inverts_power():
    sd, n = 11.6, 21306
    mde = st.mde_means(sd, n)
    z = mde / (sd * math.sqrt(2 / n)) - sps.norm.ppf(0.975)
    assert sps.norm.cdf(z) == pytest.approx(0.8, abs=1e-12)


def test_srm_detects_mismatch():
    assert st.srm_test([21307, 21306, 21387]) > 0.5
    assert st.srm_test([21000, 21000, 22500]) < 0.001


def test_smd_zero_for_identical_and_scale_free():
    x = np.arange(100, dtype=float)
    assert st.smd(x, x) == 0
    assert st.smd(x + 10, x) == pytest.approx(st.smd(10 * x + 100, 10 * x), abs=TOL)


def test_ols_hc1_matches_statsmodels():
    rng = np.random.default_rng(2)
    x = np.column_stack([np.ones(3000), rng.integers(0, 2, 3000), rng.normal(size=3000)])
    y = 0.5 + 0.2 * x[:, 1] + 0.3 * x[:, 2] + rng.standard_t(3, 3000)
    beta, se = st.ols_hc1(y, x)
    ref = OLS(y, x).fit(cov_type="HC1")
    assert beta == pytest.approx(ref.params, abs=1e-9)
    assert se == pytest.approx(ref.bse, abs=1e-9)


def test_cochran_q_zero_when_equal():
    q, df, p = st.cochran_q([0.1, 0.1, 0.1], [0.01, 0.02, 0.03])
    assert q == pytest.approx(0) and df == 2 and p == pytest.approx(1)


def test_e_value_reference_values():
    # VanderWeele & Ding (2017): RR 3.9 gives E-value 7.26.
    ev, _ = st.e_value(3.9, 1.8, 8.7)
    assert ev == pytest.approx(7.26, abs=0.01)
    ev, ci = st.e_value(0.8, 0.6, 1.1)  # protective, interval crosses 1
    assert ev == pytest.approx(1.25 + math.sqrt(1.25 * 0.25)) and ci == 1.0
