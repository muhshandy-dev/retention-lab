import pandas as pd
import pytest
import synthetic

from retention_lab import retail


@pytest.fixture(scope="module")
def result():
    raw = synthetic.make()
    return raw, retail.analyse(raw)


def test_every_cleaning_rule_fires(result):
    _, r = result
    removed = {s["rule"]: s.get("removed") for s in r["cleaning"]}
    for rule in (
        "missing_customer",
        "cancellation",
        "non_positive_qty_or_price",
        "non_product_code",
        "exact_duplicate",
    ):
        assert removed[rule] > 0, rule
    total_in = r["cleaning"][0]["rows"]
    total_removed = sum(v for v in removed.values() if v is not None)
    assert total_in - total_removed == r["cleaning"][-1]["rows"]


def test_sql_cleaning_matches_pandas(result):
    """K1 (part): the SQL cleaning returns exactly the same lines."""
    raw, r = result
    sql = retail.clean_sql(raw)
    key = list(retail.RAW_COLUMNS)
    a = r["_lines"][key].sort_values(key).reset_index(drop=True)
    b = sql[key].sort_values(key).reset_index(drop=True)
    b["Customer ID"] = b["Customer ID"].astype("Int64")
    pd.testing.assert_frame_equal(a, b, check_dtype=False)


def test_sql_cohort_matrix_matches_pandas(result):
    """K1: every (cohort, k) cell is identical in SQL and Pandas."""
    _, r = result
    sql = retail.cohort_matrix_sql(r["_lines"], r["window"]["last_full_month"])
    pandas_m = r["matrix"][["cohort", "k", "active", "size"]].astype({"k": "int64"})
    pd.testing.assert_frame_equal(
        pandas_m.reset_index(drop=True), sql.astype({"k": "int64"}), check_dtype=False
    )


def test_wilson_coverage_on_known_retention(result):
    """K2: 95% Wilson intervals cover the true retention (0.2) in 92-98% of cells."""
    _, r = result
    m = r["matrix"][r["matrix"]["k"] >= 1]
    coverage = ((m["lo"] <= 0.2) & (m["hi"] >= 0.2)).mean()
    assert len(m) > 250
    assert 0.92 <= coverage <= 0.98


def test_partial_month_is_dropped_not_counted_as_churn(result):
    """K3: December 2011 (data ends on the 9th) is outside the matrix."""
    _, r = result
    assert r["window"]["partial_month_dropped"]
    assert r["window"]["last_full_month"] == "2011-11"
    last = pd.Period("2011-11", "M")
    m = r["matrix"]
    reach = m["cohort"].map(lambda c: pd.Period(c, "M")) + m["k"]
    assert (reach.map(lambda p: p <= last)).all()
    assert "2011-12" not in set(m["cohort"])


def test_k0_is_full_cohort_and_retention_bounded(result):
    _, r = result
    m = r["matrix"]
    k0 = m[m["k"] == 0]
    assert (k0["active"] == k0["size"]).all()
    assert m["retention"].between(0, 1).all()
    assert k0["size"].sum() == r["totals"]["customers"]


def test_cancellation_alone_is_not_activity():
    raw = pd.DataFrame(
        {
            "Invoice": ["500001", "C500002"],
            "StockCode": ["10001", "10001"],
            "Description": ["A", "A"],
            "Quantity": [2, -2],
            "InvoiceDate": pd.to_datetime(["2010-01-05", "2010-03-05"]),
            "Price": [1.0, 1.0],
            "Customer ID": pd.array([1, 1], dtype="Int64"),
            "Country": ["United Kingdom"] * 2,
            "sheet": [-1, -1],
        }
    )
    extra = raw.iloc[[0]].assign(
        Invoice="500003",
        InvoiceDate=pd.Timestamp("2010-04-30"),
        **{"Customer ID": pd.array([2], dtype="Int64")},
    )
    r = retail.analyse(pd.concat([raw, extra], ignore_index=True))
    m = r["matrix"]
    jan = m[m["cohort"] == "2010-01"]
    assert list(jan["k"]) == [0]  # no activity in March from the cancellation


def test_sheet_overlap_takes_each_date_from_one_sheet():
    base = {
        "StockCode": "10001",
        "Description": "A",
        "Quantity": 1,
        "Price": 1.0,
        "Customer ID": 5,
        "Country": "United Kingdom",
    }
    rows = [
        {**base, "Invoice": "1", "InvoiceDate": pd.Timestamp("2010-11-30"), "sheet": 0},
        {**base, "Invoice": "2", "InvoiceDate": pd.Timestamp("2010-12-03"), "sheet": 0},
        {**base, "Invoice": "2", "InvoiceDate": pd.Timestamp("2010-12-03"), "sheet": 1},
    ]
    raw = pd.DataFrame(rows).astype({"Customer ID": "Int64"})
    lines, log = retail.clean(raw)
    assert len(lines) == 2
    assert next(s for s in log if s["rule"] == "sheet_overlap")["removed"] == 1
    assert len(retail.clean_sql(raw)) == 2


def test_associations_exclude_left_censored_cohort(result):
    _, r = result
    for a in r["associations"]:
        assert a["exposed"] + a["unexposed"] > 0
        assert a["e_value"] >= 1 and a["e_value_ci"] >= 1
        assert a["rr_lo"] <= a["rr"] <= a["rr_hi"]


def test_repeat_funnel_monotone(result):
    _, r = result
    shares = [s["share"] for s in r["funnel"]["steps"]]
    assert shares[0] == 1 and all(a >= b for a, b in zip(shares, shares[1:], strict=False))


def _orders(rows):
    return pd.DataFrame(
        [
            {
                "Invoice": str(i),
                "customer": c,
                "ts": pd.Timestamp(t),
                "revenue": 10.0,
                "country": "United Kingdom",
            }
            for i, (c, t) in enumerate(rows)
        ]
    )


def test_same_day_invoices_are_one_purchase():
    o = _orders(
        [
            (1, "2009-12-05 10:00"),  # first cohort: excluded from funnel and associations
            (1, "2009-12-20 10:00"),
            (2, "2010-01-10 09:00"),  # second invoice on the same day: not a repeat
            (2, "2010-01-10 15:00"),
            (3, "2010-01-11 09:00"),  # repeat on a later day: counted
            (3, "2010-02-01 09:00"),
            (4, "2011-11-20 09:00"),  # keeps the window open until 2011-10
        ]
    )
    window = retail.window_for(o)
    funnel = retail.repeat_funnel(o, window)
    assert funnel["eligible"] == 2
    assert [s["customers"] for s in funnel["steps"][:2]] == [2, 1]
    assoc = retail.associations(o, window)
    total = assoc[0]["exposed"] + assoc[0]["unexposed"]
    repeats = assoc[0]["exposed_repeat"] + assoc[0]["unexposed_repeat"]
    assert (total, repeats) == (2, 1)


def test_hidden_group_cannot_be_recovered_by_subtraction():
    """K10: a group under 10 is hidden together with the groups that would reveal it."""
    sizes = {}
    for c in retail.COUNTRY_VIEWS:
        for t in retail.TIER_VIEWS:
            sizes[("2010-01", c, t)] = 50
    sizes[("2010-01", "non_uk", "high")] = 4  # small interior group
    hidden = retail.hidden_groups(sizes)
    # its own split partners, then their partners: all four interior groups
    assert {("2010-01", c, t) for c in ("uk", "non_uk") for t in ("high", "low")} <= hidden
    # margins of the 2x2 table stay visible: four unknowns, three independent sums
    assert ("2010-01", "all", "all") not in hidden
    assert ("2010-01", "uk", "all") not in hidden
    sizes[("2010-01", "all", "all")] = 8  # a hidden total hides everything under it
    assert len(retail.hidden_groups(sizes)) == 9


def test_published_views_respect_min_cell(result):
    _, r = result
    v = r["views"]
    visible = v[~v["suppressed"]]
    assert (visible["size"] >= retail.MIN_CELL).all()
    assert v.loc[v["suppressed"], ["active", "size", "retention"]].isna().all().all()
    top = v[(v["country"] == "all") & (v["tier"] == "all")].reset_index(drop=True)
    m = r["matrix"]
    assert list(top["size"]) == list(m["size"]) and list(top["active"]) == list(m["active"])
