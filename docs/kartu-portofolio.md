# Kartu portofolio: Retention Lab

**Judul:** Retention Lab
**Subjudul:** Kohort retensi pelanggan dan eksperimen email acak, dengan ketidakpastian yang jujur
**Kategori:** Data Analytics (BI, kohort, eksperimen A/B)
**Tautan:** situs `https://retention-lab.pages.dev` (setelah deploy), repo `github.com/muhshandy-dev/retention-lab`

## Ringkasan (2 sampai 3 kalimat)

Menganalisis eksperimen email acak 64.000 pelanggan (Hillstrom) dengan rentang 95%, koreksi Holm,
power yang divalidasi simulasi, dan cek asumsi kausalitas (SRM, keseimbangan kovariat). Kohort
retensi bulanan dari Online Retail II dihitung dua kali (Pandas dan SQL) dan hanya dilaporkan
sebagai hubungan, disertai E-value. Interaksi di browser dihitung ulang dengan Arquero dan diuji
sama dengan Python.

## Angka yang boleh dikutip (data asli)

- Email produk pria: kunjungan +7,66 pp (7,00 sampai 8,32), pembelian +0,68 pp (0,50 sampai 0,86),
  belanja +US$0,77 per orang (0,49 sampai 1,05); semua signifikan setelah Holm.
- Pengacakan lolos: SRM p = 0,90; selisih terstandar terbesar 0,014.
- Tidak ada perbedaan efek antar subgrup yang bertahan setelah koreksi Holm (24 uji).

Angka retensi kohort **belum boleh dikutip** sampai Online Retail II diproses dari sumber aslinya.

## Keterampilan

Python (pandas, scipy, DuckDB SQL), desain dan analisis eksperimen, power analysis, analisis kohort,
inferensi kausal (ITT, SUTVA, E-value), React + Vite + TypeScript, Arquero, Observable Plot,
pengujian paritas lintas bahasa, CI GitHub Actions, Cloudflare Pages.

## Batasan yang disebut terus terang

Eksperimen dari satu toko AS tahun 2008; efek adalah efek "dikirimi email" (tanpa data buka email);
data retail observasional dan banyak pelanggan grosir.
