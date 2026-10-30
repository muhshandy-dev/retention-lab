# Kriteria penerimaan dan bukti

Kriteria ditulis sebelum coding (2026-10-29) berdasarkan baris DA08 di Master MagangHub:
"Retention cohort, CI, power; cek asumsi kausalitas", "SQL, Pandas, scipy",
"React/Vite + DuckDB-Wasm/Arquero + Observable Plot", "Tidak mengklaim kausal dari observasional".

Status per 2026-10-30. Kedua dataset sudah diproses dari sumber aslinya lewat workflow **Real data
run** di GitHub Actions (Online Retail II: 1.067.371 baris, SHA-256 `572e3627...7bfb`, dipin di
`cli.py`). "Sintetis" berarti juga dibuktikan pada data uji dengan nilai benar yang diketahui.

| # | Kriteria | Bukti | Status |
|---|---|---|---|
| K1 | Matriks kohort Pandas == SQL DuckDB di semua sel | Data asli: 300 sel identik, 776.577 baris bersih di Pandas dan SQL. Tes: `test_sql_cohort_matrix_matches_pandas`, `test_sql_cleaning_matches_pandas`, `tests/test_ingest.py`; pipeline menolak menerbitkan bila beda | Lulus |
| K2 | Cakupan rentang Wilson 95% pada retensi yang diketahui: 92% sampai 98% | `test_wilson_coverage_on_known_retention`: 96,0% dari 276 sel | Lulus |
| K3 | Bulan parsial terakhir dibuang, bukan dihitung churn | Data asli berakhir 9 Desember 2011; bulan terakhir di matriks November 2011. Tes: `test_partial_month_is_dropped_not_counted_as_churn` | Lulus |
| K4 | Efek RCT sama dengan statsmodels | `tests/test_stats.py`: Wilson, Newcombe, uji z, rasio log, Holm, OLS HC1 pada toleransi 1e-9; `tools/verify_published.py` menghitung ulang dari data terbit | Lulus |
| K5 | Power analitik vs Monte Carlo selisih paling banyak 2 poin persen | `test_power_formula_agrees_with_simulation` (3 skenario); data asli: 80,3% (membeli) dan 80,05% (berkunjung) vs 80% | Lulus |
| K6 | SRM dan SMD dilaporkan, SMD < 0,1 | `experiment.json`: SRM p = 0,904, SMD maks 0,0137 | Lulus |
| K7 | Koreksi Holm pada uji utama | 6 uji utama dan 24 uji heterogenitas, dicek ulang di verifier | Lulus |
| K8 | Tidak ada kalimat kausal untuk data observasional; E-value tampil | `test_observational_section_makes_no_causal_claims`. Data asli: nilai pesanan pertama di atas median, RR 1,37 (1,27 sampai 1,47), E-value 2,07 (batas rentang 1,85); pelanggan Inggris, RR 0,97 (0,86 sampai 1,09), E-value 1,22 (batas rentang 1,00) | Lulus |
| K9 | Statistik browser == Python | `web/tests/parity.test.ts` (efek utama, semua sel subgrup, Q, power) dan `retention.test.ts` (matriks gabungan dan 5 tampilan filter pada data asli, 7 tes, 0 dilewati) | Lulus |
| K10 | Tanpa ID pelanggan; kelompok < 10 disembunyikan | Verifier menolak kunci identitas, kelompok kecil yang tampil, dan kelompok yang bisa dihitung balik. Data asli: 0 kohort tersembunyi di tampilan semua pelanggan dan per nilai pesanan, 1 kohort di tampilan per negara. Tes: `test_hidden_group_cannot_be_recovered_by_subtraction`, `test_published_views_respect_min_cell` | Lulus |
| K11 | Rerun menghasilkan berkas identik | `test_rerun_is_byte_identical`, CI `git diff --exit-code web/public/data` | Lulus |
| K12 | Statis, tiap berkas < 25 MiB | CI memeriksa `dist`; berkas data terbesar 455 KB, bundle JS 769 KB | Lulus |

## Pemeriksaan tambahan

- Aksesibilitas: axe-core (WCAG 2.1 A/AA + best practice) 0 pelanggaran pada 1440 px terang, 1440 px gelap, 390 px terang, dengan data asli kedua dataset.
- Tidak ada scroll horizontal halaman pada 390 px; peta kohort bisa digeser di dalam kartunya.
- Asumsi pembersihan pada data asli (`tools/inspect_retail.py`, dicetak di ringkasan workflow):
  22.523 baris di 1 sampai 9 Desember 2010 ada di kedua lembar dan identik; prefiks faktur hanya
  angka, C (pembatalan) dan A (6 baris penyesuaian utang); 0 faktur dengan lebih dari satu
  pelanggan; 290 dari 4.234 pelanggan dengan 2+ faktur membuat faktur kedua di hari yang sama
  dengan yang pertama.

## Penyimpangan yang dilaporkan

1. **Toleransi K9** ditulis 1e-9 di rencana awal; diubah menjadi 1e-8 relatif karena data terbit
   dibulatkan ke 10 digit signifikan agar hasil deterministik.
2. **Arquero, bukan DuckDB-Wasm**, di browser (Master membolehkan keduanya). Konsekuensinya CSP butuh
   `'unsafe-eval'`; lihat [KEAMANAN.md](KEAMANAN.md).
3. **Definisi pembelian ulang diperketat setelah melihat data asli.** Faktur di hari yang sama
   dihitung satu kali belanja, dan kohort Desember 2009 tidak dihitung di funnel. Funnel
   pembelian kedua dalam 180 hari turun dari 62,2% menjadi 56,5%.
4. **Filter kohort satu per satu.** Rencana awal membolehkan gabungan negara dan nilai pesanan.
   Setelah aturan kelompok kecil diterapkan, 19 dari 24 kohort tersembunyi di tiap tampilan
   gabungan, jadi gabungan tidak diterbitkan.
   Kurva rata-rata dan angka ringkas retensi juga tidak memakai kohort Desember 2009.
5. **Nilai p belanja** memakai nilai kritis normal, bukan t. Pada data asli selisihnya di bawah 1%
   relatif karena n per kelompok sekitar 21.000.
