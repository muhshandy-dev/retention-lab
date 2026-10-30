"""The UCI download is a zip holding one workbook with two overlapping sheets. These tests
build a file with that exact layout (from synthetic rows) and run it through the real CLI,
so the path the real data takes is exercised before the real data is available."""

import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pandas as pd
import pytest
import synthetic

from retention_lab import cli, retail

ROOT = Path(__file__).resolve().parents[1]
HILLSTROM = ROOT / "data" / "raw" / "hillstrom.csv.gz"


def uci_like_zip(path: Path, raw: pd.DataFrame) -> pd.DataFrame:
    """Write raw rows as the UCI zip: sheet 1 up to 2010-12-09, sheet 2 from 2010-12-01."""
    df = raw.drop(columns="sheet").copy()
    # Excel stores the customer number as a float and some stock codes as integers.
    df["Customer ID"] = (
        df["Customer ID"]
        .astype("Float64")
        .astype(object)
        .where(df["Customer ID"].notna(), float("nan"))
        .astype("float64")
    )
    df["StockCode"] = df["StockCode"].map(lambda s: int(s) if s.isdigit() else s)
    first = df[df["InvoiceDate"] < pd.Timestamp("2010-12-10")]
    second = df[df["InvoiceDate"] >= retail.SHEET_CUTOVER]
    xlsx = path.with_suffix(".xlsx")
    with pd.ExcelWriter(xlsx) as w:
        first.to_excel(w, sheet_name=retail.SHEETS[0], index=False)
        second.to_excel(w, sheet_name=retail.SHEETS[1], index=False)
    with zipfile.ZipFile(path, "w") as zf:
        zf.write(xlsx, "online_retail_II.xlsx")
    return df


@pytest.fixture(scope="module")
def uci_zip(tmp_path_factory):
    raw = synthetic.make(n_customers=600, seed=11)
    path = tmp_path_factory.mktemp("uci") / "online_retail_ii.zip"
    uci_like_zip(path, raw)
    return path, raw


def test_zip_reading_matches_direct_cleaning(uci_zip):
    path, raw = uci_zip
    from_zip = retail.read_raw(path)
    assert set(from_zip["sheet"]) == {0, 1}
    overlap = (from_zip["InvoiceDate"] >= retail.SHEET_CUTOVER) & (
        from_zip["InvoiceDate"] < pd.Timestamp("2010-12-10")
    )
    assert from_zip.loc[overlap, "sheet"].value_counts().nunique() == 1  # same rows in both
    a, log = retail.clean(from_zip)
    b, _ = retail.clean(raw)
    assert len(a) == len(b)
    assert next(s for s in log if s["rule"] == "sheet_overlap")["removed"] == overlap.sum() / 2
    assert from_zip["StockCode"].map(type).eq(str).all()
    assert str(from_zip["Customer ID"].dtype) == "Int64"


@pytest.mark.skipif(not HILLSTROM.exists(), reason="Hillstrom not downloaded")
def test_cli_end_to_end_with_retail(uci_zip, tmp_path):
    """Full publish path: CLI, SQL check, suppression, verifier and browser parity."""
    path, _ = uci_zip
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    (raw_dir / "hillstrom.csv.gz").symlink_to(HILLSTROM)
    (raw_dir / "online_retail_ii.zip").symlink_to(path)
    out = tmp_path / "data"
    assert cli.run(raw_dir, out) == 0

    ret = json.loads((out / "retention.json").read_text())
    assert ret["sql_check"]["matrix_equal"] is True
    assert ret["sql_check"]["clean_lines_sql"] == ret["sql_check"]["clean_lines_pandas"]
    assert ret["window"]["last_full_month"] == "2011-11"
    m = ret["matrix"]
    for size, retention, suppressed in zip(m["size"], m["retention"], m["suppressed"], strict=True):
        assert suppressed == (size < ret["min_cell"])
        assert (retention is None) == suppressed
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["sources"]["online_retail_ii"]["status"] == "real"

    verify = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "verify_published.py"), str(out)],
        capture_output=True,
        text=True,
    )
    assert verify.returncode == 0, verify.stdout

    if not (ROOT / "web" / "node_modules").exists():
        pytest.skip("web dependencies not installed")
    node = subprocess.run(
        ["node", "--test", "tests/retention.test.ts"],
        cwd=ROOT / "web",
        env={"RETENTION_JSON": str(out / "retention.json"), "PATH": _path()},
        capture_output=True,
        text=True,
    )
    assert node.returncode == 0, node.stdout + node.stderr
    assert "# skipped 0" in node.stdout


def _path() -> str:
    import os

    return os.environ.get("PATH", "")
