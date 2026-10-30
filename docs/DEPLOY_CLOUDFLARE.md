# Deploy ke Cloudflare Pages

1. Dashboard Cloudflare, Workers & Pages, Create, Pages, Connect to Git.
2. Pilih repo `muhshandy-dev/retention-lab`.
3. Pengaturan build:
   - Project name: `retention-lab` (alamat `https://retention-lab.pages.dev`)
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

Setelah deploy, cek manual: halaman terbuka, grafik muncul, ganti tema terang/gelap, ubah pilihan di
"Jelajah subgrup" dan pastikan grafik berubah.
