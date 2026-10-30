"""Deterministic JSON export for the static site.

Floats are rounded to 10 significant digits and keys are sorted, so rerunning the
pipeline on the same inputs produces byte-identical files.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

MAX_FILE_BYTES = 25 * 1024 * 1024  # Cloudflare Pages per-file limit
SIG_DIGITS = 10


def _clean(value):
    if isinstance(value, dict):
        return {str(k): _clean(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_clean(v) for v in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, float | np.floating):
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return float(f"{f:.{SIG_DIGITS}g}")
    if isinstance(value, pd.DataFrame):
        return {c: _clean(value[c].tolist()) for c in value.columns}
    return value


def write_json(path: Path, payload: dict) -> int:
    text = json.dumps(_clean(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    data = (text + "\n").encode("utf-8")
    if len(data) > MAX_FILE_BYTES:
        raise ValueError(f"{path.name} is {len(data)} bytes, above the Pages limit")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()
