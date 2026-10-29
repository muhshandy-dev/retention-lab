"""Diagnostics for the raw Online Retail II file, printed as Markdown.

Checks the assumptions the cleaning rules rely on, so they can be confirmed on the real
data before any retention number is published:
- the two sheets overlap on 2010-12-01..2010-12-09 with the same rows,
- invoice prefixes (C = cancellation, A = bad-debt adjustment),
- which stock codes are not products,
- every invoice belongs to one customer.

    python tools/inspect_retail.py data/raw/online_retail_ii.zip
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from retention_lab import retail


def main(path: Path) -> None:
    raw = retail.read_raw(path)
    print("## Raw file\n")
    print(f"- rows: {len(raw):,}")
    for sheet, g in raw.groupby("sheet"):
        print(
            f"- sheet {sheet}: {len(g):,} rows, "
            f"{g['InvoiceDate'].min()} to {g['InvoiceDate'].max()}"
        )

    if (raw["sheet"] >= 0).any():
        lo, hi = retail.SHEET_CUTOVER, raw.loc[raw["sheet"] == 0, "InvoiceDate"].max()
        win = raw[(raw["InvoiceDate"] >= lo) & (raw["InvoiceDate"] <= hi)]
        cols = retail.RAW_COLUMNS
        a = win[win["sheet"] == 0][cols].astype(str).value_counts()
        b = win[win["sheet"] == 1][cols].astype(str).value_counts()
        same = a.sort_index().equals(b.sort_index())
        print(f"\n## Sheet overlap {lo.date()} to {hi.date()}\n")
        print(f"- sheet 0 rows: {int(a.sum()):,}; sheet 1 rows: {int(b.sum()):,}")
        print(f"- identical multisets of rows: {same}")

    print("\n## Invoice prefixes\n")
    prefix = raw["Invoice"].str.extract(r"^([A-Za-z]*)")[0].replace("", "(digits)")
    for k, v in prefix.value_counts().items():
        print(f"- {k}: {v:,}")

    print("\n## Non-product stock codes (top 25)\n")
    nonprod = raw.loc[~raw["StockCode"].str.match(retail.PRODUCT_CODE), "StockCode"]
    for k, v in nonprod.value_counts().head(25).items():
        print(f"- {k}: {v:,}")

    known = raw[raw["Customer ID"].notna()]
    multi = known.groupby("Invoice")["Customer ID"].nunique().gt(1).sum()
    print("\n## Other checks\n")
    print(f"- invoices with more than one customer: {int(multi)}")
    print(f"- lines without customer: {int(raw['Customer ID'].isna().sum()):,}")
    print(f"- lines with price <= 0: {int((raw['Price'] <= 0).sum()):,}")
    print(
        f"- exact duplicate lines (within sheet): "
        f"{int(raw.duplicated(subset=[*retail.RAW_COLUMNS, 'sheet']).sum()):,}"
    )
    print(
        f"- countries: {raw['Country'].nunique()}; UK share of lines: "
        f"{(raw['Country'] == 'United Kingdom').mean():.1%}"
    )


if __name__ == "__main__":
    pd.set_option("display.width", 120)
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "data/raw/online_retail_ii.zip"))
