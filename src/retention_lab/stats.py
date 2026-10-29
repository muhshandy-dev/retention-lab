"""Statistical building blocks: intervals, tests, power, balance and sensitivity.

Every function here has a twin in web/src/lib/stats.ts. The browser recomputes
interactive results with those twins, and tests/parity.test.mjs checks that both
sides agree, so keep the formulas in sync when changing either file.

All intervals are two-sided and use the normal approximation unless noted.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from scipy import optimize, stats


def z_crit(conf: float = 0.95) -> float:
    return float(stats.norm.ppf(1 - (1 - conf) / 2))


def wilson_ci(k: int, n: int, conf: float = 0.95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion."""
    if n <= 0:
        return (math.nan, math.nan)
    z = z_crit(conf)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


@dataclass(frozen=True)
class Effect:
    """Treatment minus control, with a 95% interval and a two-sided p-value."""

    control: float
    treatment: float
    diff: float
    lo: float
    hi: float
    p_value: float
    lift: float
    lift_lo: float
    lift_hi: float
    se: float  # unpooled standard error of diff, used for heterogeneity tests


def diff_proportions(k1: int, n1: int, k0: int, n0: int, conf: float = 0.95) -> Effect:
    """Difference p1 - p0.

    Interval: Newcombe hybrid score (method 10), built from two Wilson intervals.
    p-value: pooled two-proportion z test.
    Relative lift: p1/p0 - 1 with a Katz log interval.
    """
    p1, p0 = k1 / n1, k0 / n0
    l1, u1 = wilson_ci(k1, n1, conf)
    l0, u0 = wilson_ci(k0, n0, conf)
    d = p1 - p0
    lo = d - math.sqrt((p1 - l1) ** 2 + (u0 - p0) ** 2)
    hi = d + math.sqrt((u1 - p1) ** 2 + (p0 - l0) ** 2)

    pooled = (k1 + k0) / (n1 + n0)
    se_pooled = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n0))
    p_value = 2 * stats.norm.sf(abs(d) / se_pooled) if se_pooled > 0 else 1.0

    lift, lift_lo, lift_hi = math.nan, math.nan, math.nan
    if k1 > 0 and k0 > 0:
        z = z_crit(conf)
        log_rr = math.log(p1 / p0)
        se_log = math.sqrt(1 / k1 - 1 / n1 + 1 / k0 - 1 / n0)
        lift = p1 / p0 - 1
        lift_lo = math.exp(log_rr - z * se_log) - 1
        lift_hi = math.exp(log_rr + z * se_log) - 1
    se = math.sqrt(p1 * (1 - p1) / n1 + p0 * (1 - p0) / n0)
    return Effect(p0, p1, d, lo, hi, float(p_value), lift, lift_lo, lift_hi, se)


def diff_means(
    mean1: float, var1: float, n1: int, mean0: float, var0: float, n0: int, conf: float = 0.95
) -> Effect:
    """Difference of means with an unpooled (Welch) standard error and a normal critical value.

    The normal critical value keeps the browser twin simple; the web hides subgroups with
    fewer than 100 people per arm, where t and z differ by less than 1%.
    Relative lift uses the delta method on log(mean1 / mean0).
    """
    z = z_crit(conf)
    d = mean1 - mean0
    se = math.sqrt(var1 / n1 + var0 / n0)
    p_value = 2 * stats.norm.sf(abs(d) / se) if se > 0 else 1.0
    lift, lift_lo, lift_hi = math.nan, math.nan, math.nan
    if mean1 > 0 and mean0 > 0:
        se_log = math.sqrt(var1 / (n1 * mean1**2) + var0 / (n0 * mean0**2))
        log_r = math.log(mean1 / mean0)
        lift = mean1 / mean0 - 1
        lift_lo = math.exp(log_r - z * se_log) - 1
        lift_hi = math.exp(log_r + z * se_log) - 1
    return Effect(
        mean0, mean1, d, d - z * se, d + z * se, float(p_value), lift, lift_lo, lift_hi, se
    )


def holm(p_values: Sequence[float]) -> list[float]:
    """Holm step-down adjusted p-values (family-wise error control)."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adjusted = [0.0] * m
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p_values[i]))
        adjusted[i] = running
    return adjusted


# ---------------------------------------------------------------- power


def power_two_proportions(p0: float, delta: float, n_per_arm: float, alpha: float = 0.05) -> float:
    """Power of a two-sided pooled z test with equal arms (normal approximation)."""
    p1 = p0 + delta
    if not 0 < p1 < 1 or n_per_arm <= 0:
        return math.nan
    za = z_crit(1 - alpha)
    pbar = (p0 + p1) / 2
    se0 = math.sqrt(2 * pbar * (1 - pbar) / n_per_arm)
    se1 = math.sqrt((p0 * (1 - p0) + p1 * (1 - p1)) / n_per_arm)
    return float(stats.norm.cdf((abs(delta) - za * se0) / se1))


def n_two_proportions(p0: float, delta: float, alpha: float = 0.05, power: float = 0.8) -> int:
    """People per arm needed to detect an absolute change `delta` from baseline `p0`."""
    p1 = p0 + delta
    za, zb = z_crit(1 - alpha), float(stats.norm.ppf(power))
    pbar = (p0 + p1) / 2
    num = za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p0 * (1 - p0) + p1 * (1 - p1))
    return math.ceil((num / delta) ** 2)


def mde_two_proportions(
    p0: float, n_per_arm: float, alpha: float = 0.05, power: float = 0.8
) -> float:
    """Smallest absolute increase detectable with the given power."""

    def gap(d: float) -> float:
        return power_two_proportions(p0, d, n_per_arm, alpha) - power

    return float(optimize.brentq(gap, 1e-9, 1 - p0 - 1e-9, xtol=1e-12))


def mde_means(sd: float, n_per_arm: float, alpha: float = 0.05, power: float = 0.8) -> float:
    za, zb = z_crit(1 - alpha), float(stats.norm.ppf(power))
    return (za + zb) * sd * math.sqrt(2 / n_per_arm)


def simulate_power_two_proportions(
    p0: float, delta: float, n_per_arm: int, alpha: float = 0.05, sims: int = 4000, seed: int = 0
) -> float:
    """Monte Carlo power of the pooled z test, used to validate the analytic formula."""
    rng = np.random.default_rng(seed)
    k1 = rng.binomial(n_per_arm, p0 + delta, sims)
    k0 = rng.binomial(n_per_arm, p0, sims)
    pooled = (k1 + k0) / (2 * n_per_arm)
    se = np.sqrt(pooled * (1 - pooled) * 2 / n_per_arm)
    with np.errstate(divide="ignore", invalid="ignore"):
        zstat = np.where(se > 0, (k1 - k0) / n_per_arm / se, 0.0)
    return float(np.mean(np.abs(zstat) > z_crit(1 - alpha)))


# ---------------------------------------------------------------- design checks


def srm_test(counts: Sequence[int], ratios: Sequence[float] | None = None) -> float:
    """Sample ratio mismatch: chi-square goodness of fit p-value against planned ratios."""
    counts = np.asarray(counts, dtype=float)
    ratios = np.full(len(counts), 1 / len(counts)) if ratios is None else np.asarray(ratios)
    expected = counts.sum() * ratios / ratios.sum()
    return float(stats.chisquare(counts, expected).pvalue)


def smd(x1: np.ndarray, x0: np.ndarray) -> float:
    """Standardised mean difference with the average-variance denominator."""
    v = (np.var(x1, ddof=1) + np.var(x0, ddof=1)) / 2
    return float((np.mean(x1) - np.mean(x0)) / math.sqrt(v)) if v > 0 else 0.0


def cochran_q(diffs: Sequence[float], ses: Sequence[float]) -> tuple[float, int, float]:
    """Heterogeneity of subgroup effects: Q statistic, degrees of freedom, p-value."""
    d = np.asarray(diffs, dtype=float)
    w = 1 / np.asarray(ses, dtype=float) ** 2
    pooled = np.sum(w * d) / np.sum(w)
    q = float(np.sum(w * (d - pooled) ** 2))
    df = len(d) - 1
    return q, df, float(stats.chi2.sf(q, df))


def ols_hc1(y: np.ndarray, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """OLS coefficients and HC1 robust standard errors. `x` must include the intercept."""
    xtx_inv = np.linalg.inv(x.T @ x)
    beta = xtx_inv @ x.T @ y
    resid = y - x @ beta
    meat = (x * resid[:, None] ** 2).T @ x
    n, k = x.shape
    cov = xtx_inv @ meat @ xtx_inv * n / (n - k)
    return beta, np.sqrt(np.diag(cov))


# ---------------------------------------------------------------- observational sensitivity


def risk_ratio(
    k1: int, n1: int, k0: int, n0: int, conf: float = 0.95
) -> tuple[float, float, float]:
    """Risk ratio (k1/n1)/(k0/n0) with a Katz log interval."""
    z = z_crit(conf)
    rr = (k1 / n1) / (k0 / n0)
    se = math.sqrt(1 / k1 - 1 / n1 + 1 / k0 - 1 / n0)
    return rr, math.exp(math.log(rr) - z * se), math.exp(math.log(rr) + z * se)


def e_value(rr: float, lo: float, hi: float) -> tuple[float, float]:
    """E-value for a risk ratio and for the interval limit closest to 1 (VanderWeele & Ding 2017).

    The E-value is the minimum strength of association, on the risk-ratio scale, that an
    unmeasured confounder would need with both exposure and outcome to explain the
    observed association away.
    """

    def ev(r: float) -> float:
        r = 1 / r if r < 1 else r
        return r + math.sqrt(r * (r - 1))

    near = lo if rr >= 1 else hi  # interval limit closest to the null
    crosses_null = (lo <= 1) if rr >= 1 else (hi >= 1)
    return ev(rr), 1.0 if crosses_null else ev(near)
