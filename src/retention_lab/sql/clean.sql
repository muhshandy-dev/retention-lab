-- Independent SQL version of retail.clean(). Parameter $1: sheet cutover timestamp.
-- Input table raw_lines has the Online Retail II columns plus `sheet`
-- (0 or 1 for the two workbook sheets, -1 for a single CSV export).
SELECT DISTINCT
    "Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price",
    "Customer ID", "Country"
FROM raw_lines
WHERE (sheet = -1
       OR (sheet = 0 AND "InvoiceDate" < $1)
       OR (sheet = 1 AND "InvoiceDate" >= $1))
  AND "Customer ID" IS NOT NULL
  AND NOT starts_with("Invoice", 'C')
  AND "Quantity" > 0
  AND "Price" > 0
  AND regexp_matches("StockCode", '^[0-9]{5}')
