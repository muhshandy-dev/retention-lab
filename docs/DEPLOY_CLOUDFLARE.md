# Deploy ke Cloudflare Pages

1. Dashboard Cloudflare, Workers & Pages, Create, Pages, Connect to Git.
2. Pilih repo `muhshandy-dev/retention-lab`.
3. Pengaturan build:
   - Project name: `retention-lab`. Nama di `pages.dev` berlaku global dan bisa sudah dipakai orang
     lain (pada 2 November 2026 `retention-lab.pages.dev` sudah dimiliki proyek lain). Kalau
     begitu, pakai nama lain, misalnya `customer-retention-lab`. Alamat yang sah ada di dashboard,
     tab Deployments atau Custom domains. Untuk deploy pertama alamatnya
     `https://retention-lab-d6m.pages.dev` (Cloudflare menambah akhiran `-d6m`).
   - Production branch: `main`
   - Framework preset: None
   - Root directory: `web`
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. Save and Deploy.

Data situs sudah ada di `web/public/data` (hasil pipeline, di-commit), jadi build di Cloudflare
tidak menjalankan Python.

Opsional: matikan preview build untuk cabang selain `main` (Settings, Builds, Branch control) agar
kuota 500 build per bulan per akun tidak cepat habis.

Setelah deploy, cek manual: alamat yang dibuka adalah milikmu (judulnya "Retention Lab", teksnya
bahasa Indonesia), halaman terbuka, grafik muncul, ganti tema terang/gelap, ubah pilihan di
"Jelajah subgrup" dan pastikan grafik berubah.
