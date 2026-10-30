# Retention Lab

Lab analisis retensi pelanggan dan eksperimen A/B. Situs statis yang menjawab dua pertanyaan
dengan jujur soal ketidakpastian:

1. **Apakah sebuah email benar-benar mengubah perilaku pelanggan?** Dijawab dengan eksperimen acak
   (RCT) Hillstrom: 64.000 pelanggan, tiga kelompok acak, efek beserta rentang 95%, koreksi Holm,
   power, uji SRM, keseimbangan kovariat, dan uji ketahanan.
2. **Berapa banyak pelanggan baru yang kembali belanja?** Dijawab dengan kohort retensi bulanan dari
   Online Retail II. Data ini observasional, jadi hanya hubungan yang dilaporkan, disertai E-value.

## Status

| Bagian | Data | Status |
|---|---|---|
| Eksperimen email | Hillstrom MineThatData 2008 | Diproses dari data asli |
| Kohort retensi | Online Retail II (UCI 502) | Diproses dari data asli |

Data asli diunduh dan diproses oleh workflow **Real data run** di GitHub Actions. Data sintetis
hanya dipakai di tes otomatis dan tidak pernah diterbitkan.

## Hasil utama eksperimen (data asli)

| Kelompok vs tanpa email | Berkunjung | Membeli | Belanja per orang |
|---|---|---|---|
| Email produk pria | +7,66 pp (7,00 sampai 8,32) | +0,68 pp (0,50 sampai 0,86) | +US$0,77 (0,49 sampai 1,05) |
| Email produk wanita | +4,52 pp (3,89 sampai 5,16) | +0,31 pp (0,15 sampai 0,47) | +US$0,42 (0,17 sampai 0,68) |

Rentang 95% dalam kurung; semua enam uji tetap signifikan setelah koreksi Holm. Pengacakan lolos
(SRM p = 0,90; selisih terstandar terbesar 0,014). Tidak ada perbedaan efek antar subgrup yang
bertahan setelah koreksi Holm atas 24 uji heterogenitas. pp = poin persen.

## Hasil utama kohort retensi (data asli)

- Data bersih: 776.577 baris, 36.594 faktur, 5.824 pelanggan, Desember 2009 sampai November 2011
  (Desember 2011 belum penuh, jadi dibuang).
- Hanya sekitar 1 dari 5 pelanggan baru belanja lagi di bulan berikutnya: median retensi bulan
  pertama 20,8% atas 22 kohort (terendah 9,2%, tertinggi 31,7%; kohort Desember 2009 tidak
  dihitung).
- Dalam 180 hari sejak belanja pertama, 56,5% pelanggan belanja lagi di hari lain (54,9% sampai
  58,0%), dan 10,3% belanja 5 kali atau lebih.
- Pelanggan dengan pesanan pertama di atas median 1,37 kali lebih sering belanja lagi dalam 90 hari
  (1,27 sampai 1,47). Ini hubungan, bukan sebab-akibat; E-value 2,07. Pelanggan Inggris dan luar
  Inggris tidak berbeda jelas (RR 0,97; 0,86 sampai 1,09).
- Matriks SQL DuckDB dan Pandas identik di 300 sel.

## Struktur

```
src/retention_lab/   pipeline Python (pandas, scipy, DuckDB)
  stats.py           rentang Wilson/Newcombe, Welch, Holm, power, SRM, SMD, OLS HC1, E-value
  experiment.py      analisis RCT Hillstrom
  retail.py          pembersihan, pesanan, kohort, funnel pembelian ulang, asosiasi
  sql/               versi SQL independen untuk pembersihan dan matriks kohort
  cli.py             retention-lab fetch | run
tests/               tes Python (termasuk data sintetis dengan retensi yang diketahui)
tools/               verify_published.py (cek independen), inspect_retail.py (diagnostik data
                     mentah), serve_dist.py (server lokal + header)
web/                 React + Vite + Arquero + Observable Plot
  src/lib/stats.ts   kembaran statistik Python untuk interaksi di browser
  tests/             tes paritas browser vs Python
  public/data/       data yang diterbitkan (hasil pipeline, bukan ditulis tangan)
docs/                metode, kriteria penerimaan, keamanan, deploy
```

## Menjalankan

```bash
pip install -e ".[dev]"
retention-lab fetch          # unduh data publik (cek SHA-256)
retention-lab run            # tulis web/public/data
pytest -q
python tools/verify_published.py

cd web
npm ci
npm test                     # paritas browser vs Python
npm run build                # hasil di web/dist
```

Workflow manual **Real data run** di GitHub Actions mengunduh kedua dataset dari sumber aslinya,
membangun ulang data situs, memverifikasinya, lalu meng-commit hasilnya.

## Dokumen

- [docs/METODE.md](docs/METODE.md): metode statistik, asumsi, batasan
- [docs/KRITERIA.md](docs/KRITERIA.md): kriteria penerimaan dan buktinya
- [docs/KEAMANAN.md](docs/KEAMANAN.md): header keamanan dan alasannya
- [docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md): langkah deploy
- [docs/kartu-portofolio.md](docs/kartu-portofolio.md): ringkasan untuk situs portofolio

## Sumber data dan lisensi

- Kevin Hillstrom (2008), *MineThatData E-Mail Analytics and Data Mining Challenge*. Dirilis
  publik untuk analisis tanpa lisensi formal; salinan diambil dari mirror yang dipakai
  scikit-uplift.
- Daqing Chen (2019), *Online Retail II*, UCI Machine Learning Repository,
  doi:10.24432/C5CG6D, lisensi CC BY 4.0.

Kode: MIT.
