import type { Manifest } from "../types.ts";

export function Method({ manifest }: { manifest: Manifest }) {
  const src = manifest.sources;
  return (
    <div className="grid-2">
      <div className="card">
        <h3>Cara menghitung</h3>
        <ul>
          <li><strong>Rentang 95%</strong> untuk persentase memakai metode Wilson (per kohort) dan
            Newcombe (untuk selisih dua kelompok). Untuk belanja dipakai selisih rata-rata dengan galat
            baku Welch, dicek ulang dengan bootstrap.</li>
          <li><strong>Banyak uji sekaligus</strong> dikoreksi dengan metode Holm, agar peluang salah
            menyimpulkan tetap paling banyak 5% untuk seluruh keluarga uji.</li>
          <li><strong>Power</strong> dihitung dengan rumus pendekatan normal untuk dua proporsi dan
            divalidasi dengan simulasi Monte Carlo.</li>
          <li><strong>Kohort</strong> dikelompokkan menurut bulan belanja pertama. Satu pelanggan
            dihitung aktif di suatu bulan bila punya minimal satu pesanan yang tidak dibatalkan.</li>
          <li><strong>SQL dan Pandas</strong> menghitung matriks kohort secara terpisah; data hanya
            diterbitkan bila keduanya identik.</li>
          <li><strong>Interaksi di browser</strong> (subgrup, filter kohort, kalkulator) dihitung ulang
            dengan Arquero dan rumus yang sama dengan Python; tes otomatis memastikan hasilnya sama.</li>
        </ul>
      </div>
      <div className="card">
        <h3>Yang tidak diklaim</h3>
        <ul>
          <li>Hubungan pada data transaksi (Online Retail II) bukan sebab-akibat. Tidak ada pengacakan,
            jadi faktor lain bisa menjelaskan perbedaannya.</li>
          <li>Efek email adalah efek "dikirimi email", bukan efek "membaca email".</li>
          <li>Eksperimen berasal dari satu toko di Amerika Serikat tahun 2008; hasilnya belum tentu
            berlaku untuk toko lain atau masa sekarang.</li>
          <li>Hasil subgrup bersifat eksploratif.</li>
          <li>Tidak ada data pelanggan perorangan yang diterbitkan untuk data transaksi; yang
            diterbitkan hanya jumlah per kohort dan segmen. Data Hillstrom sejak awal tidak memuat
            identitas pelanggan.</li>
        </ul>
        <h3>Sumber data</h3>
        <ul>
          <li>Hillstrom MineThatData E-Mail Analytics and Data Mining Challenge (Kevin Hillstrom,
            2008), salinan dari mirror scikit-uplift. Status: {src.hillstrom?.status === "real"
              ? `diproses, ${src.hillstrom.rows?.toLocaleString("id-ID")} baris` : "belum"}.</li>
          <li>Online Retail II, UCI Machine Learning Repository nomor 502 (Chen, 2019), lisensi CC BY
            4.0. Status: {src.online_retail_ii?.status === "real"
              ? `diproses, ${src.online_retail_ii.rows?.toLocaleString("id-ID")} baris`
              : "belum dijalankan"}.</li>
        </ul>
        <p className="hint">Versi pipeline {manifest.version}.</p>
      </div>
    </div>
  );
}
