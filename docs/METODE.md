# Metode

## Eksperimen email (Hillstrom, RCT)

**Desain.** 64.000 pelanggan yang belanja dalam 12 bulan terakhir dibagi acak menjadi tiga
kelompok sama besar: email produk pria, email produk wanita, tanpa email (kontrol). Hasil dicatat
dua minggu setelah pengiriman: berkunjung (`visit`), membeli (`conversion`), nilai belanja (`spend`).

**Estimand.** Efek intention to treat (ITT): selisih rata-rata hasil antara kelompok yang
ditugaskan menerima email dan kontrol. Tidak ada data buka atau klik, jadi efek "membaca email"
tidak bisa diestimasi.

**Estimasi.**

| Hasil | Selisih | Rentang 95% | Nilai p |
|---|---|---|---|
| Proporsi (berkunjung, membeli) | p1 minus p0 | Newcombe hybrid score (metode 10) | uji z dua proporsi pooled |
| Rata-rata (belanja) | m1 minus m0 | galat baku Welch, nilai kritis normal | uji z Welch |
| Kenaikan relatif | p1/p0 minus 1 | log Katz (proporsi), metode delta (rata-rata) | |

Enam uji utama (2 kelompok email x 3 hasil) dikoreksi Holm. Nilai kritis normal dipakai untuk
belanja agar kembaran JavaScript sederhana; subgrup dengan kurang dari 100 orang per sisi tidak
dihitung, sehingga selisih t dan z di bawah 1%.

**Uji ketahanan.**
- Regresi OLS dengan kovariat terpusat (recency, history, mens, womens, newbie, wilayah, saluran)
  dan galat baku HC1. Pada RCT, hasilnya harus dekat dengan selisih sederhana.
- Bootstrap persentil 2.000 kali (seed 20261029) untuk selisih belanja, karena lebih dari 99% nilai
  belanja adalah nol.

**Cek asumsi kausalitas.**

| Asumsi | Cara cek | Hasil |
|---|---|---|
| Pengacakan berjalan sesuai rencana | uji chi-square sample ratio mismatch vs 1/3 | p = 0,90 |
| Kelompok sebanding sebelum perlakuan | selisih terstandar (SMD) 11 kovariat, batas 0,1 | maks 0,014 |
| Tidak ada hasil hilang | hitung nilai kosong | 0 |
| Kepatuhan (siapa membaca) | tidak bisa diuji, dilaporkan sebagai ITT | dicatat |
| Tidak ada interferensi antar pelanggan (SUTVA) | tidak bisa diuji dari data | dicatat sebagai asumsi |

**Power.** Rumus pendekatan normal untuk uji dua proporsi dengan kelompok sama besar; MDE dicari
dengan root finding. Rumus divalidasi simulasi Monte Carlo (4.000 percobaan): pada MDE, power
simulasi 80,3% (membeli) dan 80,05% (berkunjung), target 80%. Sampel binomial dibuat dari invers CDF atas bilangan acak seragam, sehingga hasilnya sama di semua versi numpy.

**Subgrup.** Efek per tingkat newbie, saluran, wilayah, dan segmen riwayat belanja. Heterogenitas
diuji dengan Cochran Q; 24 uji Q dikoreksi Holm sebagai satu keluarga. Bersifat eksploratif.

## Kohort retensi (Online Retail II, observasional)

**Pembersihan** (urutan tetap, jumlah baris per aturan dilaporkan):
1. Dua lembar kerja tumpang tindih 1 sampai 9 Desember 2010: tanggal sebelum 2010-12-01 dari
   lembar pertama, sesudahnya dari lembar kedua.
2. Buang baris tanpa nomor pelanggan.
3. Buang faktur pembatalan (diawali `C`).
4. Buang jumlah atau harga nol/negatif.
5. Buang kode non-produk (kode produk diawali lima digit).
6. Buang baris kembar persis.

**Kohort.** Pelanggan dikelompokkan menurut bulan pesanan pertama. Retensi bulan ke-k = bagian
kohort yang punya minimal satu pesanan di bulan kohort + k. Rentang 95% Wilson per sel.

**Sensor.**
- Kanan: data berakhir 9 Desember 2011, jadi Desember 2011 dibuang dari jendela analisis. Bulan
  parsial tidak boleh terlihat seperti pelanggan berhenti.
- Kiri: kohort Desember 2009 (bulan pertama data) bercampur dengan pelanggan lama; ditandai di
  situs dan tidak dipakai di funnel maupun analisis asosiasi.

**Satu kali belanja = satu hari.** Beberapa faktur dari pelanggan yang sama di hari yang sama
dihitung satu kali belanja. Tanpa aturan ini, keranjang yang dipecah menjadi dua faktur terlihat
seperti pelanggan kembali.

**Funnel pembelian ulang.** Berapa kali pelanggan belanja dalam 180 hari sejak belanja pertama,
hanya untuk pelanggan yang diamati penuh 180 hari. Kohort Desember 2009 tidak dihitung karena
bercampur dengan pelanggan lama.

**Asosiasi.** Pembelian ulang berarti belanja lagi di hari lain dalam 90 hari. Rasio risiko untuk (a) nilai pesanan pertama di atas median
dan (b) pelanggan Inggris, dengan rentang log Katz dan E-value (VanderWeele & Ding 2017). Tidak
ada klaim sebab-akibat.

**SQL vs Pandas.** Pembersihan dan matriks kohort ditulis dua kali (Pandas dan SQL DuckDB).
Pipeline menolak menerbitkan data bila keduanya tidak identik.

**Privasi.** Tidak ada nomor pelanggan atau faktur yang diterbitkan. Python menghitung matriks
kohort untuk setiap pilihan filter di situs, lalu menyembunyikan kelompok di bawah 10 pelanggan.
Filter dipakai satu per satu (negara atau nilai pesanan pertama, 5 tampilan). Gabungan keduanya
tidak diterbitkan karena kebanyakan kelompok luar Inggris per nilai pesanan berisi kurang dari 10
pelanggan, sehingga hampir seluruh petanya akan tersembunyi. Pasangan dari kelompok itu (separuh lain dari
pembagian yang sama) ikut disembunyikan, dan total yang tersembunyi menyembunyikan kedua
separuhnya, berulang sampai stabil. Dengan begitu angka yang disembunyikan tidak bisa dihitung
balik dengan mengurangkan angka yang tampil. Kelompok tersembunyi tidak membawa angka apa pun,
termasuk jumlah pelanggannya. `tools/verify_published.py` memeriksa aturan ini secara terpisah.

## Interaksi di browser

Arquero menghitung ulang efek subgrup dari 64.000 baris Hillstrom (tanpa identitas) dan matriks
kohort per filter dari tampilan agregat yang sudah disaring. Rumus di `web/src/lib/stats.ts` adalah kembaran `stats.py`; tes paritas
memastikan selisih relatif di bawah 1e-8 (ekspor memakai 10 digit signifikan).

## Batasan

- Hillstrom: satu toko di Amerika Serikat tahun 2008, jendela hasil dua minggu.
- Online Retail II: satu toko daring di Inggris, banyak pelanggan grosir; retensi tidak mewakili
  ritel konsumen umum.
- DuckDB-Wasm tidak dipakai di browser: berkasnya lebih dari 34 MiB, di atas batas 25 MiB per berkas
  Cloudflare Pages. Arquero dipakai sebagai pilihan yang diizinkan Master.
