"""Publication rules: reproducible output, honest copy, independent verification."""

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

from retention_lab import cli

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PUBLISHED = ROOT / "web" / "public" / "data"
WEB_SRC = ROOT / "web" / "src"

have_raw = pytest.mark.skipif(
    not (RAW / "hillstrom.csv.gz").exists(), reason="raw data not downloaded"
)


@have_raw
def test_rerun_is_byte_identical(tmp_path):
    """K11: two runs on the same inputs produce identical files."""
    a, b = tmp_path / "a", tmp_path / "b"
    assert cli.run(RAW, a) == 0 and cli.run(RAW, b) == 0
    names = sorted(p.name for p in a.iterdir())
    assert names == sorted(p.name for p in b.iterdir())
    for name in names:
        assert (a / name).read_bytes() == (b / name).read_bytes(), name


def _published_sources_present() -> bool:
    """Every source the published manifest says is real has its raw file on disk."""
    manifest = json.loads((PUBLISHED / "manifest.json").read_text())
    files = {"hillstrom": "hillstrom.csv.gz", "online_retail_ii": "online_retail_ii.zip"}
    return all(
        (RAW / files[name]).exists()
        for name, src in manifest["sources"].items()
        if src.get("status") == "real"
    )


@pytest.mark.skipif(
    not _published_sources_present(), reason="raw files behind the published data not downloaded"
)
def test_committed_data_matches_pipeline(tmp_path):
    """The files the site serves are exactly what the pipeline produces from the raw data."""
    out = tmp_path / "out"
    assert cli.run(RAW, out) == 0
    for p in out.iterdir():
        assert (PUBLISHED / p.name).read_bytes() == p.read_bytes(), p.name


def test_independent_verifier_passes():
    res = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "verify_published.py"), str(PUBLISHED)],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, res.stdout + res.stderr


def _visible_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_observational_section_makes_no_causal_claims():
    """K8: the retention (observational) section never words an association as a cause."""
    text = _visible_text(WEB_SRC / "sections" / "Retention.tsx").lower()
    for word in ("menyebabkan", "dampak", "efek", "pengaruh", "meningkatkan retensi"):
        assert word not in text, word
    assert "bukan sebab-akibat" in text and "e-value" in text


def test_no_em_dash_in_site_or_docs():
    files = [
        *WEB_SRC.rglob("*.ts*"),
        *(ROOT / "docs").glob("*.md"),
        ROOT / "README.md",
        ROOT / "web" / "index.html",
    ]
    for f in files:
        if f.exists():
            assert "—" not in f.read_text(encoding="utf-8"), f.name


def test_site_never_shows_synthetic_data():
    for f in WEB_SRC.rglob("*.ts*"):
        assert not re.search(r"synthetic|sintetis", f.read_text(encoding="utf-8"), re.I), f.name
