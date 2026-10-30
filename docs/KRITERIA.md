# Kriteria penerimaan dan bukti

Kriteria ditulis sebelum coding (2026-10-29) berdasarkan baris DA08 di Master MagangHub:
"Retention cohort, CI, power; cek asumsi kausalitas", "SQL, Pandas, scipy",
"React/Vite + DuckDB-Wasm/Arquero + Observable Plot", "Tidak mengklaim kausal dari observasional".

Status per 2026-10-29 (diperbarui 16:50 UTC). "Sintetis" berarti dibuktikan pada data uji dengan nilai benar yang
diketahui; untuk bagian retail, bukti pada data asli **belum ada** sampai Online Retail II diproses.

| # | Kriteria | Bukti | Status |
|---|---|---|---|
| K1 | Matriks kohort Pandas == SQL DuckDB di semua sel | `tests/test_retail.py::test_sql_cohort_matrix_matches_pandas`, `test_sql_cleaning_matches_pandas`, `tests/test_ingest.py` (berkas zip + xlsx dua lembar seperti UCI, lewat CLI); pipeline menolak menerbitkan bila beda | Lulus (sintetis); data asli tertunda |
| K2 | Cakupan rentang Wilson 95% pada retensi yang diketahui: 92% sampai 98% | `test_wilson_coverage_on_known_retention`: 96,0% dari 276 sel | Lulus |
| K3 | Bulan parsial terakhir dibuang, bukan dihitung churn | `test_partial_month_is_dropped_not_counted_as_churn` | Lulus (sintetis); data asli tertunda |
| K4 | Efek RCT sama dengan statsmodels | `tests/test_stats.py`: Wilson, Newcombe, uji z, rasio log, Holm, OLS HC1 pada toleransi 1e-9; `tools/verify_published.py` menghitung ulang dari data terbit | Lulus |
| K5 | Power analitik vs Monte Carlo selisih paling banyak 2 poin persen | `test_power_formula_agrees_with_simulation` (3 skenario); data asli: 80,3% (membeli) dan 80,05% (berkunjung) vs 80% | Lulus |
| K6 | SRM dan SMD dilaporkan, SMD < 0,1 | `experiment.json`: SRM p = 0,904, SMD maks 0,0137 | Lulus |
| K7 | Koreksi Holm pada uji utama | 6 uji utama dan 24 uji heterogenitas, dicek ulang di verifier | Lulus |
| K8 | Tidak ada kalimat kausal untuk data observasional; E-value tampil | `tests/test_publication.py::test_observational_section_makes_no_causal_claims`; E-value di `retail.associations` | Lulus untuk teks; angka E-value asli tertunda |
| K9 | Statistik browser == Python | `web/tests/parity.test.ts` (efek utama, semua sel subgrup, Q, power) dan `retention.test.ts`, yang juga dijalankan oleh `tests/test_ingest.py` pada keluaran CLI dari berkas uji | Lulus untuk eksperimen; jalur kohort lulus pada berkas uji; kohort asli tertunda |
| K10 | Tanpa ID pelanggan; kohort < 10 disembunyikan | verifier menolak kunci identitas; `cli.run` mengosongkan sel kecil | Lulus (eksperimen); retail asli tertunda |
| K11 | Rerun menghasilkan berkas identik | `test_rerun_is_byte_identical`, CI `git diff --exit-code web/public/data` | Lulus |
| K12 | Statis, tiap berkas < 25 MiB | CI memeriksa `dist`; berkas data terbesar 455 KB, bundle JS 769 KB | Lulus |

## Pemeriksaan tambahan

- Aksesibilitas: axe-core (WCAG 2.1 A/AA + best practice) 0 pelanggaran pada 1440 px terang, 1440 px gelap, 390 px terang, baik untuk tampilan sekarang maupun tampilan kohort berisi data uji.
- Tidak ada scroll horizontal halaman pada 390 px; peta kohort bisa digeser di dalam kartunya.
- Asumsi pembersihan data asli (tumpang tindih lembar, prefiks faktur, kode non-produk, satu pelanggan per faktur) akan dicetak oleh `tools/inspect_retail.py` di workflow data asli sebelum angka retensi dipakai.

## Penyimpangan yang dilaporkan

1. **Toleransi K9** ditulis 1e-9 di rencana awal; diubah menjadi 1e-8 relatif karena data terbit
   dibulatkan ke 10 digit signifikan agar hasil deterministik.
2. **Arquero, bukan DuckDB-Wasm**, di browser (Master membolehkan keduanya). Konsekuensinya CSP butuh
   `'unsafe-eval'`; lihat [KEAMANAN.md](KEAMANAN.md).
3. **Nilai p belanja** memakai nilai kritis normal, bukan t. Pada data asli selisihnya di bawah 1%
   relatif karena n per kelompok sekitar 21.000.
