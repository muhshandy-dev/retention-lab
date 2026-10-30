import * as Plot from "@observablehq/plot";
import { useCallback, useMemo, useState } from "react";
import { categoryAxis, type Palette, PlotFigure } from "../components/PlotFigure.tsx";
import { fmtDate, fmtGbp, fmtInt, fmtMonth, fmtNum, fmtPct } from "../lib/format.ts";
import { curve, type Filter, matrix } from "../lib/retention.ts";
import type { RetentionResult } from "../types.ts";

const RULE_LABEL: Record<string, string> = {
  sheet_overlap: "Baris ganda karena dua lembar kerja tumpang tindih (1 sampai 9 Desember 2010)",
  missing_customer: "Tanpa nomor pelanggan (tidak bisa diikuti dari bulan ke bulan)",
  cancellation: "Faktur pembatalan (kode diawali C)",
  non_positive_qty_or_price: "Jumlah atau harga nol atau negatif",
  non_product_code: "Bukan produk (ongkos kirim, biaya bank, penyesuaian)",
  exact_duplicate: "Baris kembar persis",
};

export function Retention({ data, theme }: { data: RetentionResult; theme: string }) {
  if (data.status === "missing") return <Missing />;
  return <RetentionReal data={data} theme={theme} />;
}

function Missing() {
  return (
    <div className="empty">
      <h3>Data transaksi belum dijalankan</h3>
      <p>
        Bagian ini akan menampilkan kohort retensi dari Online Retail II (UCI, sekitar satu juta baris
        transaksi 2009 sampai 2011). Kode analisis, versi SQL pembandingnya, dan tes otomatisnya sudah
        ada, tetapi datanya belum diunduh dan diproses, jadi belum ada angka yang ditampilkan.
      </p>
      <p className="hint">
        Situs ini sengaja tidak mengisi bagian ini dengan data buatan agar tidak ada angka yang
        terlihat seperti hasil nyata padahal bukan.
      </p>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="field"><span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function RetentionReal({ data, theme }: { data: RetentionResult; theme: string }) {
  const [filter, setFilter] = useState<Filter>({ country: "all", tier: "all" });
  const rows = useMemo(() => matrix(data.views, filter), [data, filter]);
  const avg = useMemo(() => curve(rows), [rows]);
  const w = data.window;

  const heat = useCallback((width: number, p: Palette) => {
    const cells = rows.filter((r) => r.k >= 1);
    const cohorts = [...new Set(rows.map((r) => r.cohort))];
    const maxK = Math.max(...cells.map((r) => r.k));
    return Plot.plot({
      width, height: 22 * cohorts.length + 70, marginLeft: 76, marginBottom: 40, padding: 0.06,
      style: { background: "transparent", color: p.ink2, fontFamily: "var(--font)", fontSize: "12px" },
      x: { label: "Bulan setelah belanja pertama", labelAnchor: "center", labelOffset: 34, domain: Array.from({ length: maxK }, (_, i) => i + 1),
        tickFormat: (k: number) => (k % 3 === 0 || k === 1 ? String(k) : "") },
      y: { label: null, domain: cohorts, tickFormat: fmtMonth },
      color: { type: "linear", domain: [0, Math.max(0.05, ...cells.filter((c) => !c.suppressed)
        .map((c) => c.retention))], range: [p.seq0, p.seq1], label: "Kembali belanja",
        legend: true, tickFormat: (v: number) => fmtPct(v, 0) },
      marks: [
        Plot.cell(cells.filter((c) => !c.suppressed), { x: "k", y: "cohort", fill: "retention", inset: 0.5, rx: 2 }),
        Plot.cell(cells.filter((c) => c.suppressed), { x: "k", y: "cohort", fill: p.line, inset: 0.5 }),
        Plot.tip(cells, Plot.pointer({ x: "k", y: "cohort", title: (r) => r.suppressed
          ? `Kohort ${fmtMonth(r.cohort)}: disembunyikan untuk melindungi kelompok di bawah ${data.min_cell} pelanggan`
          : `Kohort ${fmtMonth(r.cohort)}, bulan ke-${r.k}\n${fmtPct(r.retention)} kembali (${fmtInt(r.active)} dari ${fmtInt(r.size)})\nRentang 95%: ${fmtPct(r.lo)} sampai ${fmtPct(r.hi)}` })),
      ],
    });
  }, [rows, data.min_cell]);

  const line = useCallback((width: number, p: Palette) => {
    const d = avg.filter((r) => r.k >= 1);
    return Plot.plot({
      width, height: 260, marginLeft: 48,
      style: { background: "transparent", color: p.ink2, fontFamily: "var(--font)", fontSize: "13px" },
      x: { label: "Bulan setelah belanja pertama", labelAnchor: "center", labelOffset: 38 },
      marginBottom: 44,
      y: { label: "Kembali belanja", grid: true, tickFormat: (v: number) => fmtPct(v, 0), domain: [0, Math.max(...d.map((r) => r.hi))] },
      marks: [
        Plot.areaY(d, { x: "k", y1: "lo", y2: "hi", fill: p.plum, fillOpacity: 0.12 }),
        Plot.lineY(d, { x: "k", y: "retention", stroke: p.plum, strokeWidth: 2 }),
        Plot.ruleY([0], { stroke: p.line }),
        Plot.tip(d, Plot.pointerX({ x: "k", y: "retention", title: (r) =>
          `Bulan ke-${r.k}: ${fmtPct(r.retention)}\nRentang 95%: ${fmtPct(r.lo)} sampai ${fmtPct(r.hi)}\nDari ${fmtInt(r.customers)} pelanggan` })),
      ],
    });
  }, [avg]);

  const funnel = useCallback((width: number, p: Palette) => {
    const d = data.funnel.steps.map((s) => ({ ...s, label: s.orders === 1 ? "Belanja 1 kali" : `Belanja ${s.orders} kali atau lebih` }));
    const ax = categoryAxis(width, d.map((s) => s.label), p, 170);
    return Plot.plot({
      width, height: ax.rowHeight * d.length + 60, marginLeft: ax.marginLeft, marginRight: 56,
      marginBottom: 44,
      style: { background: "transparent", color: p.ink2, fontFamily: "var(--font)", fontSize: "13px" },
      x: { label: "Bagian pelanggan", tickFormat: (v: number) => fmtPct(v, 0), domain: [0, 1], grid: true,
        labelAnchor: "center", labelOffset: 38 },
      y: { label: null, domain: d.map((s) => s.label) },
      marks: [
        ...ax.marks,
        Plot.barX(d, { x: "share", y: "label", fill: p.plum, rx: 4,
          insetTop: ax.narrow ? 24 : 10, insetBottom: ax.narrow ? 8 : 10 }),
        Plot.link(d, { x1: "lo", x2: "hi", y1: "label", y2: "label", stroke: p.ink, strokeWidth: 1.5 }),
        Plot.text(d, { x: "share", y: "label", text: (s) => fmtPct(s.share), dx: 8, textAnchor: "start", fill: p.ink }),
        Plot.tip(d, Plot.pointerY({ x: "share", y: "label", title: (s) =>
          `${s.label}: ${fmtInt(s.customers)} dari ${fmtInt(data.funnel.eligible)} pelanggan\nRentang 95%: ${fmtPct(s.lo)} sampai ${fmtPct(s.hi)}` })),
      ],
    });
  }, [data]);

  const k1 = avg.find((r) => r.k === 1);
  const k6 = avg.find((r) => r.k === 6);
  const k12 = avg.find((r) => r.k === 12);

  return (
    <>
      <div className="tiles">
        <div className="tile"><div className="label">Pelanggan yang dianalisis</div>
          <div className="value">{fmtInt(data.totals.customers)}</div>
          <div className="sub">{fmtInt(data.totals.orders)} pesanan, {fmtMonth(w.first_month)} sampai {fmtMonth(w.last_full_month)}</div></div>
        {[k1, k6, k12].filter(Boolean).map((r) => (
          <div className="tile" key={r!.k}><div className="label">Kembali belanja di bulan ke-{r!.k}</div>
            <div className="value">{fmtPct(r!.retention)}</div>
            <div className="sub">rentang 95% {fmtPct(r!.lo)} sampai {fmtPct(r!.hi)}</div></div>
        ))}
      </div>
      <div className="card">
        <h3>Peta retensi per kohort</h3>
        <p className="hint">
          Satu baris = pelanggan yang pertama kali belanja di bulan itu. Satu kotak = bagian dari
          mereka yang belanja lagi sekian bulan kemudian. Makin gelap, makin banyak yang kembali.
        </p>
        <div className="controls">
          <Seg label="Negara" value={filter.country} onChange={(country) => setFilter({ ...filter, country })}
            options={[["all", "Semua"], ["uk", "Inggris"], ["non_uk", "Luar Inggris"]]} />
          <Seg label="Nilai pesanan pertama" value={filter.tier} onChange={(tier) => setFilter({ ...filter, tier })}
            options={[["all", "Semua"], ["high", "Di atas median"], ["low", "Median ke bawah"]]} />
        </div>
        <p className="hint only-narrow">Geser peta ke samping untuk melihat bulan-bulan berikutnya.</p>
        <PlotFigure render={heat} theme={theme} minWidth={560} label="Peta retensi kohort bulanan" />
        <p className="hint">
          Kotak abu-abu: disembunyikan karena kelompoknya di bawah {data.min_cell} pelanggan, atau karena angkanya bisa dihitung balik dari kelompok lain yang tampil.
          Kohort {fmtMonth(w.left_censored_cohort)} adalah bulan pertama data, jadi berisi juga pelanggan
          lama yang sudah belanja sebelum data dimulai; jangan dibandingkan langsung dengan kohort lain.
          {w.partial_month_dropped && ` Data berakhir ${fmtDate(w.data_end)}, jadi bulan terakhir yang belum penuh tidak dihitung agar tidak terlihat seperti pelanggan berhenti.`}
        </p>
      </div>
      <div className="grid-2">
        <div className="card">
          <h3>Rata-rata kurva retensi</h3>
          <p className="hint">Gabungan semua kohort pada filter yang dipilih. Bulan-bulan yang jauh hanya berisi kohort lama.</p>
          <PlotFigure render={line} theme={theme} label="Kurva retensi rata-rata" />
        </div>
        <div className="card">
          <h3>Funnel pembelian ulang</h3>
          <p className="hint">Berapa kali pelanggan belanja dalam {data.funnel.window_days} hari sejak belanja pertama. Beberapa faktur di hari yang sama dihitung satu kali. Hanya {fmtInt(data.funnel.eligible)} pelanggan yang sudah diamati penuh {data.funnel.window_days} hari; kohort Desember 2009 tidak dihitung karena bercampur dengan pelanggan lama.</p>
          <PlotFigure render={funnel} theme={theme} label="Funnel pembelian ulang" />
        </div>
      </div>
      <Associations data={data} />
      <div className="card">
        <h3>Pembersihan data</h3>
        <div className="table-wrap" tabIndex={0}>
          <table>
            <thead><tr><th>Aturan</th><th className="n">Baris dibuang</th></tr></thead>
            <tbody>
              <tr><td>Baris awal</td><td className="n">{fmtInt(data.cleaning[0].rows ?? 0)}</td></tr>
              {data.cleaning.filter((c) => c.removed !== undefined).map((c) => (
                <tr key={c.rule}><td>{RULE_LABEL[c.rule] ?? c.rule}</td><td className="n">{fmtInt(c.removed!)}</td></tr>
              ))}
              <tr><td><strong>Baris dipakai</strong></td><td className="n"><strong>{fmtInt(data.cleaning.at(-1)?.rows ?? 0)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <p className="hint">
          Matriks kohort dihitung dua kali secara terpisah, dengan Pandas dan dengan SQL (DuckDB).
          Hasil: {data.sql_check.matrix_equal ? "identik" : "BERBEDA"} untuk {fmtInt(data.sql_check.cells)} sel.
        </p>
      </div>
    </>
  );
}

const EXPOSURE_LABEL: Record<string, [string, string]> = {
  first_order_above_median: ["Pesanan pertama di atas median", "pesanan pertama median ke bawah"],
  country_uk: ["Pelanggan di Inggris", "pelanggan di luar Inggris"],
};

function Associations({ data }: { data: RetentionResult }) {
  return (
    <div className="card">
      <h3>Hubungan, bukan sebab-akibat</h3>
      <p className="hint">
        Data transaksi ini tidak berasal dari eksperimen, jadi perbandingan di bawah hanya menunjukkan
        hubungan. Contoh: pelanggan dengan pesanan pertama besar bisa jadi memang pedagang grosir, dan
        itu yang membuat mereka kembali, bukan besarnya pesanan. Median pesanan pertama:{" "}
        {fmtGbp(data.totals.first_order_median)}.
      </p>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <thead><tr><th>Perbandingan</th><th className="n">Belanja lagi dalam 90 hari</th>
            <th className="n">Rasio</th><th className="n">Rentang 95%</th><th className="n">E-value</th></tr></thead>
          <tbody>
            {data.associations.map((a) => {
              const [yes, no] = EXPOSURE_LABEL[a.exposure] ?? [a.exposure, "lainnya"];
              return (
                <tr key={a.exposure}>
                  <td>{yes} dibanding {no}</td>
                  <td className="n">{fmtPct(a.exposed_repeat / a.exposed)} vs {fmtPct(a.unexposed_repeat / a.unexposed)}</td>
                  <td className="n">{a.rr === null ? "tidak terdefinisi" : fmtNum(a.rr, 2)}</td>
                  <td className="n">{a.rr_lo === null ? "" : `${fmtNum(a.rr_lo, 2)} sampai ${fmtNum(a.rr_hi!, 2)}`}</td>
                  <td className="n">{a.e_value === null ? "" : `${fmtNum(a.e_value, 2)} (batas ${fmtNum(a.e_value_ci!, 2)})`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        E-value: seberapa kuat faktor tersembunyi (misalnya jenis usaha pelanggan) harus berhubungan
        dengan kedua sisi, dalam skala rasio risiko, agar hubungan ini hilang sepenuhnya. Makin dekat
        ke 1, makin mudah hubungan itu dijelaskan oleh faktor lain. Kohort bulan pertama tidak ikut
        dihitung karena berisi pelanggan lama.
      </p>
    </div>
  );
}
