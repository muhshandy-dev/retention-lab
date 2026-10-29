import { useMemo, useState } from "react";
import { fmtInt, fmtNum, fmtPct, fmtUsd } from "../lib/format.ts";
import { mdeTwoProportions, nTwoProportions, powerTwoProportions } from "../lib/stats.ts";
import type { ExperimentResult } from "../types.ts";

function parse(s: string): number {
  return Number(s.replace(",", "."));
}

export function Power({ data }: { data: ExperimentResult }) {
  const p = data.power;
  const [baseline, setBaseline] = useState("0,57");
  const [lift, setLift] = useState("0,30");
  const [n, setN] = useState("21306");
  const [power, setPower] = useState("80");

  const calc = useMemo(() => {
    const p0 = parse(baseline) / 100;
    const d = parse(lift) / 100;
    const nn = Math.round(parse(n));
    const pw = parse(power) / 100;
    const valid = p0 > 0 && p0 < 1 && d > 0 && p0 + d < 1 && nn > 1 && pw > 0.05 && pw < 0.999;
    if (!valid) return null;
    return {
      need: nTwoProportions(p0, d, 0.05, pw),
      achieved: powerTwoProportions(p0, d, nn),
      mde: mdeTwoProportions(p0, nn, 0.05, pw),
    };
  }, [baseline, lift, n, power]);

  const conv = p.outcomes.conversion;
  const visit = p.outcomes.visit;
  const spend = p.outcomes.spend;

  return (
    <>
      <div className="tiles">
        <div className="tile"><div className="label">Perubahan kunjungan terkecil yang bisa dideteksi</div>
          <div className="value">{fmtNum(visit.mde_abs * 100, 2)} pp</div>
          <div className="sub">dari dasar {fmtPct(visit.baseline)}, dengan {fmtInt(p.n_per_arm)} orang per kelompok</div></div>
        <div className="tile"><div className="label">Perubahan pembelian terkecil yang bisa dideteksi</div>
          <div className="value">{fmtNum(conv.mde_abs * 100, 2)} pp</div>
          <div className="sub">dari dasar {fmtPct(conv.baseline, 2)}, atau naik {fmtPct(conv.mde_rel, 0)}</div></div>
        <div className="tile"><div className="label">Perubahan belanja terkecil yang bisa dideteksi</div>
          <div className="value">{fmtUsd(spend.mde_abs)}</div>
          <div className="sub">dari dasar {fmtUsd(spend.baseline)} per orang</div></div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Semua dengan peluang deteksi 80% dan batas kesalahan 5%. Rumus power dicek dengan simulasi
        Monte Carlo (4.000 percobaan buatan): pada ukuran efek terkecil di atas, simulasi menghasilkan
        peluang deteksi {fmtPct(conv.simulated_power_at_mde ?? NaN)} untuk pembelian dan{" "}
        {fmtPct(visit.simulated_power_at_mde ?? NaN)} untuk kunjungan, dekat dengan target 80%.
        pp = poin persen.
      </p>
      <div className="card">
        <h3>Kalkulator ukuran sampel</h3>
        <p className="hint">Untuk merencanakan eksperimen berikutnya dengan hasil berupa persentase (misalnya tingkat pembelian).</p>
        <div className="controls">
          <label className="field">Tingkat dasar (%)<input inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} /></label>
          <label className="field">Kenaikan yang ingin dideteksi (pp)<input inputMode="decimal" value={lift} onChange={(e) => setLift(e.target.value)} /></label>
          <label className="field">Orang per kelompok<input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></label>
          <label className="field">Peluang deteksi (%)<input inputMode="decimal" value={power} onChange={(e) => setPower(e.target.value)} /></label>
        </div>
        {calc ? (
          <ul className="checks" aria-live="polite">
            <li><span className="icon info">i</span><div>Butuh <strong className="num">{fmtInt(calc.need)}</strong> orang per kelompok untuk peluang deteksi {power}%.</div></li>
            <li><span className="icon info">i</span><div>Dengan {fmtInt(Math.round(parse(n)))} orang per kelompok, peluang deteksinya <strong className="num">{fmtPct(calc.achieved)}</strong>.</div></li>
            <li><span className="icon info">i</span><div>Dengan ukuran itu, kenaikan terkecil yang bisa dideteksi adalah <strong className="num">{fmtNum(calc.mde * 100, 3)} pp</strong>.</div></li>
          </ul>
        ) : (
          <p className="hint">Isi angka yang masuk akal: tingkat dasar antara 0 dan 100, kenaikan lebih dari 0.</p>
        )}
      </div>
    </>
  );
}
