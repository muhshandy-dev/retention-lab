"""Synthetic Online Retail II style transactions with a known retention probability.

Used only by tests. Each customer is acquired in a random month and is then active in
every later month independently with probability `p`, so the true retention for any
cohort and any k >= 1 is exactly `p`. Dirty lines of every kind the cleaning step must
remove are mixed in.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

MONTHS = pd.period_range("2009-12", "2011-11", freq="M")
DATA_END = pd.Timestamp("2011-12-09 17:00")


def _ts(rng: np.random.Generator, month: pd.Period, last_day: int | None = None) -> pd.Timestamp:
    days = last_day or month.days_in_month
    return month.to_timestamp() + pd.Timedelta(
        days=int(rng.integers(0, days)),
        hours=int(rng.integers(8, 18)),
        minutes=int(rng.integers(0, 60)),
    )


def make(n_customers: int = 3000, p: float = 0.2, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[tuple] = []
    inv = 500000

    def order(cust, ts, country, n_lines=None, cancel=False):
        nonlocal inv
        inv += 1
        code = f"C{inv}" if cancel else str(inv)
        for _ in range(n_lines or int(rng.integers(1, 5))):
            q = int(rng.integers(1, 13))
            rows.append(
                (
                    code,
                    f"{int(rng.integers(10000, 99999))}",
                    "ITEM",
                    -q if cancel else q,
                    ts,
                    round(float(rng.uniform(0.5, 9)), 2),
                    cust,
                    country,
                )
            )
        return code

    for cust in range(12000, 12000 + n_customers):
        country = "United Kingdom" if rng.random() < 0.85 else "France"
        start = int(rng.integers(0, len(MONTHS)))
        order(cust, _ts(rng, MONTHS[start]), country)
        for m in MONTHS[start + 1 :]:
            if rng.random() < p:
                order(cust, _ts(rng, m), country)
        if rng.random() < p:  # activity in the partial last month, must be ignored
            order(cust, _ts(rng, pd.Period("2011-12", "M"), last_day=8), country)
        if rng.random() < 0.05:  # cancellation in a random month, must not count as activity
            order(
                cust, _ts(rng, MONTHS[int(rng.integers(start, len(MONTHS)))]), country, cancel=True
            )

    df = pd.DataFrame(
        rows,
        columns=[
            "Invoice",
            "StockCode",
            "Description",
            "Quantity",
            "InvoiceDate",
            "Price",
            "Customer ID",
            "Country",
        ],
    )
    df["Customer ID"] = df["Customer ID"].astype("Int64")

    noise = df.sample(frac=0.02, random_state=seed).copy()  # guest checkouts
    noise["Customer ID"] = pd.NA
    noise["Invoice"] = "9" + noise["Invoice"].str[1:]
    post = df.sample(frac=0.01, random_state=seed + 1).copy()
    post["StockCode"] = "POST"
    zero = df.sample(frac=0.005, random_state=seed + 2).copy()
    zero["Price"] = 0.0
    dupes = df.sample(frac=0.01, random_state=seed + 3)
    out = pd.concat([df, noise, post, zero, dupes], ignore_index=True)
    out["sheet"] = -1
    return out.sample(frac=1, random_state=seed).reset_index(drop=True)
