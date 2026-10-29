"""Command line: `retention-lab fetch` downloads sources, `retention-lab run` builds site data."""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

from . import __version__, experiment, retail
from .export import sha256, write_json

SOURCES = {
    "hillstrom": {
        "file": "hillstrom.csv.gz",
        # Mirror maintained by scikit-uplift; original at minethatdata.com (2008).
        "url": "https://hillstorm1.s3.us-east-2.amazonaws.com/hillstorm_no_indices.csv.gz",
        "sha256": "bab6578f60db5d792f1c2372c502f029152a5249cf5ea84390f3b7f885d7234f",
    },
    "online_retail_ii": {
        "file": "online_retail_ii.zip",
        "url": "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip",
        "sha256": None,  # pinned after the first verified download
    },
}


def fetch(dest: Path, only: list[str] | None = None) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    status = 0
    for name, src in SOURCES.items():
        if only and name not in only:
            continue
        target = dest / src["file"]
        if not target.exists():
            print(f"download {name} from {src['url']}")
            try:
                urllib.request.urlretrieve(src["url"], target)  # noqa: S310 (fixed https URL)
            except OSError as exc:
                print(f"  failed: {exc}", file=sys.stderr)
                status = 1
                continue
        digest = sha256(target)
        if src["sha256"] and digest != src["sha256"]:
            print(f"  {name}: sha256 mismatch {digest}", file=sys.stderr)
            status = 1
        else:
            print(f"  {name}: {digest}")
    return status


def run(raw_dir: Path, out_dir: Path) -> int:
    manifest = {"version": __version__, "sources": {}}

    h_path = raw_dir / SOURCES["hillstrom"]["file"]
    df = experiment.load(h_path)
    manifest["sources"]["hillstrom"] = {"status": "real", "sha256": sha256(h_path), "rows": len(df)}
    write_json(out_dir / "experiment.json", experiment.analyse(df))
    write_json(out_dir / "hillstrom.json", experiment.browser_table(df))

    r_path = raw_dir / SOURCES["online_retail_ii"]["file"]
    if r_path.exists():
        raw = retail.read_raw(r_path)
        result = retail.analyse(raw)
        lines = result.pop("_lines")
        sql = retail.cohort_matrix_sql(lines, result["window"]["last_full_month"])
        pandas_matrix = result["matrix"][["cohort", "k", "active", "size"]]
        equal = (
            pandas_matrix.astype({"k": "int64"})
            .reset_index(drop=True)
            .equals(sql.astype({"k": "int64"}))
        )
        sql_lines = len(retail.clean_sql(raw))
        result["sql_check"] = {
            "matrix_equal": bool(equal),
            "cells": len(sql),
            "clean_lines_sql": sql_lines,
            "clean_lines_pandas": len(lines),
        }
        if not equal or sql_lines != len(lines):
            print("SQL and Pandas disagree; refusing to publish", file=sys.stderr)
            return 1
        result["min_cell"] = retail.MIN_CELL
        m = result["matrix"]
        small = m["size"] < retail.MIN_CELL
        m.loc[small, ["active", "retention", "lo", "hi"]] = None
        m["suppressed"] = small
        manifest["sources"]["online_retail_ii"] = {
            "status": "real",
            "sha256": sha256(r_path),
            "rows": len(raw),
        }
        write_json(out_dir / "retention.json", result)
    else:
        manifest["sources"]["online_retail_ii"] = {"status": "missing"}
        write_json(out_dir / "retention.json", {"status": "missing"})
        print(f"note: {r_path} not found, retention section published as missing")

    write_json(out_dir / "manifest.json", manifest)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="retention-lab")
    sub = parser.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download the public datasets")
    f.add_argument("--dest", type=Path, default=Path("data/raw"))
    f.add_argument("--only", action="append", choices=sorted(SOURCES), help="repeatable")
    r = sub.add_parser("run", help="analyse and write site data")
    r.add_argument("--raw", type=Path, default=Path("data/raw"))
    r.add_argument("--out", type=Path, default=Path("web/public/data"))
    args = parser.parse_args(argv)
    if args.cmd == "fetch":
        return fetch(args.dest, args.only)
    return run(args.raw, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
