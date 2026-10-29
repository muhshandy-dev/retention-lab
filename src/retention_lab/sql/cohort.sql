-- Independent SQL version of the cohort matrix. Parameter $1: last full month 'YYYY-MM'.
-- Input table clean_lines = output of the cleaning step.
WITH orders AS (
    SELECT "Invoice", any_value("Customer ID") AS customer, min("InvoiceDate") AS ts
    FROM clean_lines
    GROUP BY "Invoice"
),
in_window AS (
    SELECT customer, ts, date_trunc('month', ts) AS month
    FROM orders
    WHERE strftime(ts, '%Y-%m') <= $1
),
firsts AS (
    SELECT customer, min(month) AS cohort
    FROM in_window
    GROUP BY customer
),
sizes AS (
    SELECT cohort, count(*) AS size FROM firsts GROUP BY cohort
),
active AS (
    SELECT f.cohort, date_diff('month', f.cohort, a.month) AS k,
           count(DISTINCT a.customer) AS active
    FROM in_window a JOIN firsts f USING (customer)
    GROUP BY 1, 2
)
SELECT strftime(a.cohort, '%Y-%m') AS cohort, CAST(a.k AS INTEGER) AS k,
       CAST(a.active AS BIGINT) AS active, CAST(s.size AS BIGINT) AS size
FROM active a JOIN sizes s USING (cohort)
ORDER BY cohort, k
