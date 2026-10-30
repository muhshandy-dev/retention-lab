# Keamanan

Situs sepenuhnya statis (Cloudflare Pages), tanpa server, tanpa formulir, tanpa skrip pihak ketiga,
tanpa cookie. Header di `web/public/_headers`:

| Header | Nilai | Alasan |
|---|---|---|
| Content-Security-Policy | `default-src 'self'` dan seterusnya | semua aset dari domain sendiri; font di-host sendiri |
| script-src | `'self'`, hash skrip tema, `'unsafe-eval'` | lihat di bawah |
| style-src | `'self' 'unsafe-inline'` | Observable Plot dan React menulis atribut `style` |
| X-Content-Type-Options | nosniff | |
| Referrer-Policy | strict-origin-when-cross-origin | |
| Cache-Control | `no-cache` untuk halaman dan data, `immutable` untuk `/assets/*` | berkas aset memakai hash di nama, jadi aman disimpan lama; halaman dan data selalu dicek ulang agar tidak terjadi campuran versi lama dan baru |

## Mengapa `'unsafe-eval'`

Arquero menyusun ekspresi tabel (filter, rollup) menjadi fungsi JavaScript dengan konstruktor
`Function`. Tanpa `'unsafe-eval'` interaksi subgrup dan filter kohort tidak berjalan.

Risikonya kecil di situs ini: tidak ada masukan pengguna yang dieksekusi sebagai kode, tidak ada
skrip pihak ketiga, dan semua skrip berasal dari domain sendiri. Alternatif yang dipertimbangkan:

- DuckDB-Wasm hanya butuh `'wasm-unsafe-eval'`, tetapi berkas wasm-nya 34 sampai 41 MiB, di atas
  batas 25 MiB per berkas Cloudflare Pages, dan memuatnya dari CDN menambah ketergantungan luar.
- Menulis ulang agregasi tanpa Arquero menghapus kebutuhan eval, tetapi menyimpang dari blueprint
  Master (DuckDB-Wasm/Arquero). Keputusan ini perlu persetujuan Shandy.
