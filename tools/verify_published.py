"""Independent check of the published site data (web/public/data).

Recomputes the headline numbers from the published files with statsmodels, which the
pipeline itself does not use, and checks publication rules. Exit code 1 on any failure.

    python tools/verify_published.py [web/public/data]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.proportion import confint_proportions_2indep, proportions_ztest

MAX_BYTES = 25 * 1024 * 1024
FORBIDDEN_KEYS = {"customer", "customer_id", "Customer ID", "invoice", "Invoice"}
REL = 1e-8


def close(a: float, b: float, rel: float = REL) -> bool:
    return abs(a - b) <= rel * max(abs(b), 1e-300)


def keys(obj, found: set[str]) -> set[str]:
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(k)
            keys(v, found)
    elif isinstance(obj, list):
        for v in obj:
            keys(v, found)
    return found


def main(root: Path) -> int:
    problems: list[str] = []
    files = {p.name: json.loads(p.read_text()) for p in root.glob("*.json")}
    for p in root.iterdir():
        if p.stat().st_size > MAX_BYTES:
            problems.append(f"{p.name} above 25 MiB")
    for name, payload in files.items():
        leaked = keys(payload, set()) & FORBIDDEN_KEYS
        if leaked:
            problems.append(f"{name} contains identifier fields {sorted(leaked)}")

    # Experiment: decode the browser table and recompute with statsmodels.
    h, ex = files["hillstrom.json"], files["experiment.json"]
    arm = np.frombuffer(h["digits"]["arm"].encode(), dtype=np.uint8) - 48
    cols = {k: np.frombuffer(v.encode(), dtype=np.uint8) - 48 for k, v in h["digits"].items()}
    spend = np.zeros(h["n"])
    spend[h["spend_cents"]["index"]] = np.array(h["spend_cents"]["value"]) / 100
    if len(arm) != h["n"] or h["n"] != 64000:
        problems.append("hillstrom row count")
    for row in ex["effects"]:
        t, c = arm == h["arms"].index(row["arm"]), arm == 0
        if row["outcome"] == "spend":
            d = spend[t].mean() - spend[c].mean()
            ok = close(d, row["diff"])
        else:
            y = cols[row["outcome"]]
            k1, n1, k0, n0 = int(y[t].sum()), int(t.sum()), int(y[c].sum()), int(c.sum())
            lo, hi = confint_proportions_2indep(k1, n1, k0, n0, method="newcomb", compare="diff")
            _, p = proportions_ztest([k1, k0], [n1, n0])
            ok = close(lo, row["lo"]) and close(hi, row["hi"]) and close(p, row["p_value"], 1e-6)
        if not ok:
            problems.append(f"effect mismatch {row['arm']} {row['outcome']}")
    holm = multipletests([r["p_value"] for r in ex["effects"]], method="holm")[1]
    if not all(close(a, r["p_holm"], 1e-6) for a, r in zip(holm, ex["effects"], strict=True)):
        problems.append("Holm adjustment mismatch")
    if not (ex["design"]["srm_ok"] and ex["design"]["balance_ok"]):
        problems.append("design checks failed (SRM or balance)")

    # Retention: structure and internal consistency.
    ret, manifest = files["retention.json"], files["manifest.json"]
    retail_status = manifest["sources"]["online_retail_ii"]["status"]
    if retail_status == "missing":
        if ret != {"status": "missing"}:
            problems.append("retention.json must be the missing placeholder")
    else:
        cells, m = ret["cells"], ret["matrix"]
        if not ret["sql_check"]["matrix_equal"]:
            problems.append("SQL and Pandas cohort matrices differ")
        size_from_cells: dict[str, int] = {}
        for cohort, k, size in zip(cells["cohort"], cells["k"], cells["size"], strict=True):
            if k == 0:
                size_from_cells[cohort] = size_from_cells.get(cohort, 0) + size
        for cohort, k, size in zip(m["cohort"], m["k"], m["size"], strict=True):
            if size_from_cells.get(cohort) != size:
                problems.append(f"cohort size mismatch {cohort} k={k}")
                break
        if sum(size_from_cells.values()) != ret["totals"]["customers"]:
            problems.append("customer total mismatch")
        last = ret["window"]["last_full_month"]
        if any(c > last for c in m["cohort"]):
            problems.append("cohort after last full month")
        for i, size in enumerate(m["size"]):
            if size < ret["min_cell"] and m["retention"][i] is not None:
                problems.append("small cohort not suppressed")
                break

    for p in problems:
        print("FAIL", p)
    print(f"checked {len(files)} files, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "web/public/data")))
