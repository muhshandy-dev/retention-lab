"""Observational retention cohorts from Online Retail II (UCI 502, CC BY 4.0).

Transactions of a UK online gift retailer, 2009-12-01 to 2011-12-09. Nothing here is
randomised, so every comparison between groups is an association, never an effect.

Pipeline: raw lines -> cleaned lines -> orders -> monthly activity -> cohort cells.
The same steps are written in SQL (sql/clean.sql, sql/cohort.sql); tests and
tools/verify_published.py require both versions to agree cell by cell.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from . import stats as st

RAW_COLUMNS = [
    "Invoice",
    "StockCode",
    "Description",
    "Quantity",
    "InvoiceDate",
    "Price",
    "Customer ID",
    "Country",
]
SHEETS = ("Year 2009-2010", "Year 2010-2011")
# The two workbook sheets overlap on 2010-12-01..2010-12-09. Rows on or after this date
# come only from the second sheet, rows before it only from the first.
SHEET_CUTOVER = pd.Timestamp("2010-12-01")
PRODUCT_CODE = r"^[0-9]{5}"
MIN_CELL = 10
REPEAT_WINDOW_DAYS = 180
ASSOCIATION_WINDOW_DAYS = 90
FUNNEL_STEPS = 5


@dataclass(frozen=True)
class Window:
    """Observation window. `last_full_month` is the last calendar month fully covered."""

    first_month: pd.Period
    last_full_month: pd.Period
    data_end: pd.Timestamp  # last day with transactions
    partial_month_dropped: bool


# ---------------------------------------------------------------- ingest


def read_raw(path: Path) -> pd.DataFrame:
    """Read the UCI zip/xlsx (two sheets) or a CSV export with the same columns."""
    path = Path(path)
    if path.suffix == ".csv" or path.name.endswith(".csv.gz"):
        df = pd.read_csv(path, dtype={"Invoice": str, "StockCode": str}, encoding="utf-8")
        return _normalise(df, sheet=None)
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            name = next(n for n in zf.namelist() if n.endswith(".xlsx"))
            with zf.open(name) as fh:
                sheets = pd.read_excel(
                    fh, sheet_name=list(SHEETS), dtype={"Invoice": str, "StockCode": str}
                )
    else:
        sheets = pd.read_excel(
            path, sheet_name=list(SHEETS), dtype={"Invoice": str, "StockCode": str}
        )
    parts = [_normalise(sheets[s], sheet=i) for i, s in enumerate(SHEETS)]
    return pd.concat(parts, ignore_index=True)


def _normalise(df: pd.DataFrame, sheet: int | None) -> pd.DataFrame:
    missing = [c for c in RAW_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    out = df[RAW_COLUMNS].copy()
    out["Invoice"] = out["Invoice"].astype(str).str.strip()
    out["StockCode"] = out["StockCode"].astype(str).str.strip()
    out["InvoiceDate"] = pd.to_datetime(out["InvoiceDate"])
    out["Customer ID"] = pd.to_numeric(out["Customer ID"], errors="coerce").astype("Int64")
    out["Quantity"] = out["Quantity"].astype("int64")
    out["Price"] = out["Price"].astype(float)
    out["sheet"] = -1 if sheet is None else sheet
    return out


# ---------------------------------------------------------------- cleaning


def clean(raw: pd.DataFrame) -> tuple[pd.DataFrame, list[dict]]:
    """Apply the cleaning rules in order and report how many lines each rule removed."""
    log: list[dict] = [{"rule": "input", "rows": len(raw)}]
    df = raw
    if (df["sheet"] >= 0).any():
        keep = ((df["sheet"] == 0) & (df["InvoiceDate"] < SHEET_CUTOVER)) | (
            (df["sheet"] == 1) & (df["InvoiceDate"] >= SHEET_CUTOVER)
        )
        df = _step(df, keep, "sheet_overlap", log)
    df = _step(df, df["Customer ID"].notna(), "missing_customer", log)
    df = _step(df, ~df["Invoice"].str.startswith("C"), "cancellation", log)
    df = _step(df, (df["Quantity"] > 0) & (df["Price"] > 0), "non_positive_qty_or_price", log)
    df = _step(df, df["StockCode"].str.match(PRODUCT_CODE), "non_product_code", log)
    df = _step(df, ~df.duplicated(subset=RAW_COLUMNS), "exact_duplicate", log)
    log.append({"rule": "output", "rows": len(df)})
    return df.drop(columns="sheet").reset_index(drop=True), log


def _step(df: pd.DataFrame, keep: pd.Series, rule: str, log: list[dict]) -> pd.DataFrame:
    log.append({"rule": rule, "removed": int((~keep).sum())})
    return df[keep]


def orders(lines: pd.DataFrame) -> pd.DataFrame:
    """One row per invoice: customer, timestamp, revenue, country."""
    lines = lines.assign(revenue=lines["Quantity"] * lines["Price"])
    out = (
        lines.groupby("Invoice", sort=True)
        .agg(
            customer=("Customer ID", "first"),
            ts=("InvoiceDate", "min"),
            revenue=("revenue", "sum"),
            country=("Country", "first"),
            n_customers=("Customer ID", "nunique"),
        )
        .reset_index()
    )
    if (out["n_customers"] != 1).any():
        raise ValueError("an invoice maps to more than one customer")
    return out.drop(columns="n_customers")


def window_for(orders_df: pd.DataFrame) -> Window:
    end = orders_df["ts"].max().normalize()
    first = orders_df["ts"].min().to_period("M")
    month_end = (end + pd.offsets.MonthEnd(0)).normalize()
    partial = end < month_end
    last_full = end.to_period("M") - (1 if partial else 0)
    return Window(first, last_full, end, bool(partial))


# ---------------------------------------------------------------- customers and cohorts


def customers(orders_df: pd.DataFrame, window: Window) -> pd.DataFrame:
    """Customer table restricted to the full-month window, with segment attributes."""
    o = orders_df[orders_df["ts"].dt.to_period("M") <= window.last_full_month]
    o = o.sort_values(["customer", "ts", "Invoice"])
    first = o.groupby("customer").first()
    cust = pd.DataFrame(
        {
            "first_ts": first["ts"],
            "cohort": first["ts"].dt.to_period("M"),
            "first_revenue": first["revenue"],
            "country": first["country"],
        }
    )
    median = float(cust["first_revenue"].median())
    cust["value_tier"] = np.where(cust["first_revenue"] > median, "high", "low")
    cust["country_group"] = np.where(cust["country"] == "United Kingdom", "uk", "non_uk")
    cust.attrs["first_order_median"] = median
    return cust


def activity(orders_df: pd.DataFrame, window: Window) -> pd.DataFrame:
    o = orders_df[orders_df["ts"].dt.to_period("M") <= window.last_full_month]
    return o.assign(month=o["ts"].dt.to_period("M"))[["customer", "month"]].drop_duplicates()


def cohort_cells(orders_df: pd.DataFrame, window: Window) -> pd.DataFrame:
    """Active customers per (cohort, months since acquisition, country group, value tier)."""
    cust = customers(orders_df, window)
    act = activity(orders_df, window).join(cust, on="customer")
    act["k"] = (act["month"] - act["cohort"]).apply(lambda d: d.n).astype(int)
    keys = ["cohort", "country_group", "value_tier"]
    active = act.groupby([*keys, "k"]).size().rename("active").reset_index()
    sizes = cust.groupby(keys).size().rename("size").reset_index()
    cells = active.merge(sizes, on=keys, how="left")
    cells["cohort"] = cells["cohort"].astype(str)
    return cells.sort_values([*keys, "k"]).reset_index(drop=True)


def cohort_matrix(cells: pd.DataFrame) -> pd.DataFrame:
    """Collapse segment cells to one row per (cohort, k) with Wilson intervals."""
    size = (
        cells[cells["k"] == 0].groupby("cohort")["size"].sum().rename("size")
    )  # k=0 holds every customer once
    m = cells.groupby(["cohort", "k"])["active"].sum().reset_index().join(size, on="cohort")
    ci = [st.wilson_ci(int(a), int(n)) for a, n in zip(m["active"], m["size"], strict=True)]
    m["retention"] = m["active"] / m["size"]
    m["lo"] = [c[0] for c in ci]
    m["hi"] = [c[1] for c in ci]
    return m.sort_values(["cohort", "k"]).reset_index(drop=True)


def cohort_matrix_sql(lines: pd.DataFrame, last_full_month: str) -> pd.DataFrame:
    """Independent SQL computation of (cohort, k, active, size) from cleaned lines."""
    sql = resources.files("retention_lab").joinpath("sql/cohort.sql").read_text()
    con = duckdb.connect()
    con.register("clean_lines", lines)
    out = con.execute(sql, [last_full_month]).df()
    con.close()
    return out


def clean_sql(raw: pd.DataFrame) -> pd.DataFrame:
    """Independent SQL version of `clean`, returning the cleaned lines."""
    sql = resources.files("retention_lab").joinpath("sql/clean.sql").read_text()
    con = duckdb.connect()
    con.register("raw_lines", raw)
    out = con.execute(sql, [SHEET_CUTOVER.to_pydatetime()]).df()
    con.close()
    return out


# ---------------------------------------------------------------- funnel and associations


def repeat_funnel(orders_df: pd.DataFrame, window: Window) -> dict:
    """Share of customers reaching their 2nd..5th order within 180 days of the first.

    Only customers whose first order leaves a full 180-day window before the data end
    are counted, so late cohorts do not look worse just because they were observed less.
    """
    cust = customers(orders_df, window)
    window_end = window.last_full_month.to_timestamp(how="end").normalize()
    eligible = cust[cust["first_ts"] + pd.Timedelta(days=REPEAT_WINDOW_DAYS) <= window_end]
    o = orders_df.join(eligible["first_ts"], on="customer", how="inner")
    within = o[o["ts"] < o["first_ts"] + pd.Timedelta(days=REPEAT_WINDOW_DAYS)]
    n_orders = within.groupby("customer").size().reindex(eligible.index, fill_value=0)
    n = len(eligible)
    steps = []
    for s in range(1, FUNNEL_STEPS + 1):
        k = int((n_orders >= s).sum())
        lo, hi = st.wilson_ci(k, n)
        steps.append(
            {"orders": s, "customers": k, "share": k / n if n else 0.0, "lo": lo, "hi": hi}
        )
    return {"window_days": REPEAT_WINDOW_DAYS, "eligible": n, "steps": steps}


def associations(orders_df: pd.DataFrame, window: Window) -> list[dict]:
    """Observational associations with 90-day repeat purchase, with E-values.

    The first cohort is excluded: customers first seen in the first month of data may
    have bought before the data starts, so they are not new customers.
    """
    cust = customers(orders_df, window)
    window_end = window.last_full_month.to_timestamp(how="end").normalize()
    eligible = cust[
        (cust["cohort"] > window.first_month)
        & (cust["first_ts"] + pd.Timedelta(days=ASSOCIATION_WINDOW_DAYS) <= window_end)
    ]
    o = orders_df.join(eligible["first_ts"], on="customer", how="inner")
    later = o[
        (o["ts"] > o["first_ts"])
        & (o["ts"] < o["first_ts"] + pd.Timedelta(days=ASSOCIATION_WINDOW_DAYS))
    ]
    repeat = eligible.index.isin(later["customer"].unique())
    rows = []
    for name, exposed in (
        ("first_order_above_median", eligible["value_tier"].to_numpy() == "high"),
        ("country_uk", eligible["country_group"].to_numpy() == "uk"),
    ):
        k1, n1 = int(repeat[exposed].sum()), int(exposed.sum())
        k0, n0 = int(repeat[~exposed].sum()), int((~exposed).sum())
        if min(k1, k0, n1 - k1, n0 - k0) == 0:
            rr = lo = hi = ev = ev_ci = float("nan")  # undefined, published as null
        else:
            rr, lo, hi = st.risk_ratio(k1, n1, k0, n0)
            ev, ev_ci = st.e_value(rr, lo, hi)
        rows.append(
            {
                "exposure": name,
                "outcome": f"repeat_{ASSOCIATION_WINDOW_DAYS}d",
                "exposed": n1,
                "exposed_repeat": k1,
                "unexposed": n0,
                "unexposed_repeat": k0,
                "rr": rr,
                "rr_lo": lo,
                "rr_hi": hi,
                "e_value": ev,
                "e_value_ci": ev_ci,
            }
        )
    return rows


def analyse(raw: pd.DataFrame) -> dict:
    lines, log = clean(raw)
    o = orders(lines)
    w = window_for(o)
    cells = cohort_cells(o, w)
    matrix = cohort_matrix(cells)
    cust = customers(o, w)
    return {
        "window": {
            "first_month": str(w.first_month),
            "last_full_month": str(w.last_full_month),
            "data_end": w.data_end.date().isoformat(),
            "partial_month_dropped": w.partial_month_dropped,
            "left_censored_cohort": str(w.first_month),
        },
        "cleaning": log,
        "totals": {
            "lines": len(lines),
            "orders": len(o),
            "customers": len(cust),
            "first_order_median": cust.attrs["first_order_median"],
        },
        "cells": cells,
        "matrix": matrix,
        "funnel": repeat_funnel(o, w),
        "associations": associations(o, w),
        "_lines": lines,
    }
