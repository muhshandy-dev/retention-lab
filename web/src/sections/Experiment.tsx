import * as Plot from "@observablehq/plot";
import { useCallback, useMemo, useState } from "react";
import { categoryAxis, type Palette, PlotFigure } from "../components/PlotFigure.tsx";
import {
  ARM_LABEL, COVARIATE_LABEL, fmtDiff, fmtInt, fmtLevel, fmtNum, fmtP, fmtPct, fmtUsd, OUTCOME_LABEL,
} from "../lib/format.ts";
import type { ExperimentResult } from "../types.ts";

const TREATED = ["Mens E-Mail", "Womens E-Mail"];
const armColor = (p: Palette, arm: string) => (arm === "Mens E-Mail" ? p.plum : p.ochre);

export function Legend() {
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="swatch" style={{ background: "var(--plum)" }} />Email produk pria</span>
      <span><i className="swatch" style={{ background: "var(--ochre)" }} />Email produk wanita</span>
    </div>
  );
}

export function Outcomes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="group" aria-label="Pilih hasil yang diukur">
      {Object.entries(OUTCOME_LABEL).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Experiment({ data, theme }: { data: ExperimentResult; theme: string }) {
  const [outcome, setOutcome] = useState("visit");
  const rows = useMemo(() => data.effects.filter((e) => e.outcome === outcome), [data, outcome]);
  const unit = outcome === "spend" ? "US$ per orang" : "pp";

  const render = useCallback((width: number, p: Palette) => {
    const scale = outcome === "spend" ? 1 : 100;
    const d = rows.map((r) => ({ ...r, label: r.arm === "Mens E-Mail" ? "Email pria" : "Email wanita",
      x: r.diff * scale,
      x1: r.lo * scale, x2: r.hi * scale }));
    const ax = categoryAxis(width, d.map((r) => r.label), p, 110);
    return Plot.plot({
      width, height: ax.rowHeight * 2 + 80, marginLeft: ax.marginLeft, marginRight: 24,
      marginBottom: 44,
      style: { background: "transparent", color: p.ink2, fontFamily: "var(--font)", fontSize: "13px" },
      x: { label: `Selisih vs tanpa email (${unit})`, labelAnchor: "center", labelOffset: 38,
        grid: true, nice: true, tickFormat: (v: number) => fmtNum(v, Number.isInteger(v) ? 0 : 1),
        domain: [Math.min(0, ...d.map((r) => r.x1)), Math.max(...d.map((r) => r.x2))] },
      y: { label: null, domain: d.map((r) => r.label) },
      marks: [
        ...ax.marks,
        Plot.ruleX([0], { stroke: p.ink2 }),
        Plot.link(d, { x1: "x1", x2: "x2", y1: "label", y2: "label", strokeWidth: 2,
          stroke: (r) => armColor(p, r.arm), strokeLinecap: "round" }),
        Plot.dot(d, { x: "x", y: "label", r: 5, fill: (r) => armColor(p, r.arm),
          stroke: p.surface, strokeWidth: 2 }),
        Plot.tip(d, Plot.pointerY({ x: "x", y: "label", title: (r) =>
          `${r.label}\nSelisih ${fmtDiff(outcome, r.diff)}\nRentang 95%: ${fmtDiff(outcome, r.lo)} sampai ${fmtDiff(outcome, r.hi)}\nTanpa email ${fmtLevel(outcome, r.control)}, dengan email ${fmtLevel(outcome, r.treatment)}` })),
      ],
    });
  }, [rows, outcome, unit]);

  return (
    <>
      <div className="card">
        <h3>Seberapa besar efek email?</h3>
        <p className="hint">
          Titik adalah selisih rata-rata dibanding kelompok yang tidak dikirimi email. Garis adalah
          rentang 95%: kisaran nilai yang masih masuk akal mengingat ukuran sampel. Bila garis tidak
          menyentuh nol, efeknya jelas berbeda dari nol. pp = poin persen, misalnya dari 10% ke 12% adalah +2 pp.
        </p>
        <div className="controls"><Outcomes value={outcome} onChange={setOutcome} /></div>
        <Legend />
        <PlotFigure render={render} theme={theme} label={`Efek email pada ${OUTCOME_LABEL[outcome]}`} />
        <div className="table-wrap">
          <table>
            <caption>Enam perbandingan utama. Nilai p sudah dikoreksi Holm karena ada enam uji sekaligus.</caption>
            <thead>
              <tr><th>Kelompok</th><th>Hasil</th><th className="n">Tanpa email</th>
                <th className="n">Dengan email</th><th className="n">Selisih</th>
                <th className="n">Rentang 95%</th><th className="n">Kenaikan relatif</th>
                <th className="n">p (Holm)</th></tr>
            </thead>
            <tbody>
              {data.effects.map((r) => (
                <tr key={r.arm + r.outcome}>
                  <td>{ARM_LABEL[r.arm]}</td><td>{OUTCOME_LABEL[r.outcome]}</td>
                  <td className="n">{fmtLevel(r.outcome, r.control)}</td>
                  <td className="n">{fmtLevel(r.outcome, r.treatment)}</td>
                  <td className="n">{fmtDiff(r.outcome, r.diff)}</td>
                  <td className="n">{fmtDiff(r.outcome, r.lo)} sampai {fmtDiff(r.outcome, r.hi)}</td>
                  <td className="n">{fmtPct(r.lift, 0)} ({fmtPct(r.lift_lo, 0)} sampai {fmtPct(r.lift_hi, 0)})</td>
                  <td className="n">{fmtP(r.p_holm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Funnel data={data} />
      <Robustness data={data} />
    </>
  );
}

function Bar({ share, max, color }: { share: number; max: number; color: string }) {
  return (
    <span aria-hidden="true" style={{ display: "block", height: 6, marginTop: 4, borderRadius: 3,
      width: `${Math.max(2, (share / max) * 100)}%`, background: color }} />
  );
}

function Funnel({ data }: { data: ExperimentResult }) {
  const maxVisit = Math.max(...data.funnel.map((f) => f.visit_rate));
  const maxConv = Math.max(...data.funnel.map((f) => f.converted / f.assigned));
  const color = (arm: string) => arm === "No E-Mail" ? "var(--neutral)" : arm === "Mens E-Mail"
    ? "var(--plum)" : "var(--ochre)";
  return (
    <div className="card">
      <h3>Funnel: dari dikirim sampai membeli</h3>
      <p className="hint">
        Setiap baris adalah satu kelompok acak. Email terutama menambah orang yang berkunjung; dari
        yang berkunjung, peluang membeli juga sedikit lebih tinggi. Batang dibandingkan antar kelompok
        dalam kolom yang sama.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Kelompok</th><th className="n">Dikirim</th><th className="n">Berkunjung</th>
              <th className="n">Membeli</th><th className="n">Membeli dari yang berkunjung</th>
              <th className="n">Belanja per pembeli</th></tr>
          </thead>
          <tbody>
            {data.funnel.map((f) => (
              <tr key={f.arm}>
                <td>{ARM_LABEL[f.arm]}</td>
                <td className="n">{fmtInt(f.assigned)}</td>
                <td className="n">{fmtInt(f.visited)} ({fmtPct(f.visit_rate)})
                  <Bar share={f.visit_rate} max={maxVisit} color={color(f.arm)} /></td>
                <td className="n">{fmtInt(f.converted)} ({fmtPct(f.converted / f.assigned, 2)})
                  <Bar share={f.converted / f.assigned} max={maxConv} color={color(f.arm)} /></td>
                <td className="n">{fmtPct(f.conversion_given_visit)}</td>
                <td className="n">{fmtUsd(f.spend_per_converter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Catatan: "membeli dari yang berkunjung" membandingkan orang yang memilih berkunjung, jadi
        kelompoknya tidak lagi acak. Angka itu deskriptif, bukan efek email.
      </p>
    </div>
  );
}

function Robustness({ data }: { data: ExperimentResult }) {
  const plain = new Map(data.effects.map((e) => [e.arm + e.outcome, e]));
  const boot = new Map(data.bootstrap_spend.map((b) => [b.arm, b]));
  return (
    <div className="card">
      <h3>Uji ketahanan</h3>
      <p className="hint">
        Dua cara lain menghitung efek yang sama. Penyesuaian kovariat (regresi dengan riwayat belanja,
        wilayah, dan saluran) seharusnya hampir tidak mengubah hasil bila pengacakan berhasil.
        Bootstrap ({fmtInt(data.bootstrap_spend[0].reps)} kali, seed tetap) mengecek rentang belanja
        tanpa asumsi distribusi normal, karena lebih dari 99% orang belanja nol.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Kelompok</th><th>Hasil</th><th className="n">Selisih sederhana</th>
              <th className="n">Setelah penyesuaian</th><th className="n">Rentang 95% disesuaikan</th></tr>
          </thead>
          <tbody>
            {data.adjusted.map((a) => {
              const e = plain.get(a.arm + a.outcome)!;
              return (
                <tr key={a.arm + a.outcome}>
                  <td>{ARM_LABEL[a.arm]}</td><td>{OUTCOME_LABEL[a.outcome]}</td>
                  <td className="n">{fmtDiff(a.outcome, e.diff)}</td>
                  <td className="n">{fmtDiff(a.outcome, a.diff)}</td>
                  <td className="n">{fmtDiff(a.outcome, a.lo)} sampai {fmtDiff(a.outcome, a.hi)}</td>
                </tr>
              );
            })}
            {TREATED.map((arm) => {
              const b = boot.get(arm)!;
              return (
                <tr key={`boot${arm}`}>
                  <td>{ARM_LABEL[arm]}</td><td>Belanja per orang (bootstrap)</td>
                  <td className="n">{fmtDiff("spend", b.diff)}</td><td className="n">tidak berlaku</td>
                  <td className="n">{fmtDiff("spend", b.lo)} sampai {fmtDiff("spend", b.hi)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Fairness({ data, theme }: { data: ExperimentResult; theme: string }) {
  const d = data.design;
  const render = useCallback((width: number, p: Palette) => {
    const rows = d.balance.flatMap((b) => TREATED.map((arm) => ({
      covariate: COVARIATE_LABEL[b.covariate] ?? b.covariate, arm, smd: Math.abs(Number(b[arm])),
    })));
    const labels = d.balance.map((b) => COVARIATE_LABEL[b.covariate] ?? b.covariate);
    const ax = categoryAxis(width, labels, p, 230);
    return Plot.plot({
      width, height: ax.rowHeight * labels.length + 60, marginLeft: ax.marginLeft,
      marginRight: 24, marginBottom: 44,
      style: { background: "transparent", color: p.ink2, fontFamily: "var(--font)", fontSize: "13px" },
      x: { label: "Selisih terstandar (nilai mutlak)", domain: [0, 0.12], grid: true,
        labelAnchor: "center", labelOffset: 38, tickFormat: (v: number) => fmtNum(v, 2) },
      y: { label: null, domain: labels },
      marks: [
        ...ax.marks,
        Plot.ruleX([0.1], { stroke: p.ink2, strokeWidth: 1 }),
        Plot.text([{ x: 0.1 }], { x: "x", frameAnchor: "top", text: () => "batas 0,1", dy: -2,
          textAnchor: "end", dx: -4, fill: p.ink2 }),
        Plot.dot(rows, { x: "smd", y: "covariate", r: 4.5, fill: (r) => armColor(p, r.arm),
          stroke: p.surface, strokeWidth: 2, dy: 0 }),
        Plot.tip(rows, Plot.pointer({ x: "smd", y: "covariate", title: (r) =>
          `${r.covariate}\n${ARM_LABEL[r.arm]}: ${fmtNum(r.smd, 3)}` })),
      ],
    });
  }, [d]);

  return (
    <>
      <ul className="checks card">
        <li><span className={`icon ${d.srm_ok ? "pass" : "note"}`}>{d.srm_ok ? "✓" : "!"}</span>
          <div><strong>Pembagian kelompok sesuai rencana.</strong> Rencana 1/3 per kelompok; hasilnya{" "}
            {["No E-Mail", "Mens E-Mail", "Womens E-Mail"].map((a) => `${ARM_LABEL[a]} ${fmtInt(d.arm_counts[a])}`).join(", ")}.
            Uji sample ratio mismatch p = {fmtNum(d.srm_p_value, 2)} (masalah bila p &lt; 0,001).</div></li>
        <li><span className={`icon ${d.balance_ok ? "pass" : "note"}`}>{d.balance_ok ? "✓" : "!"}</span>
          <div><strong>Kelompok seimbang sebelum email dikirim.</strong> Selisih terstandar terbesar{" "}
            {fmtNum(d.max_abs_smd, 3)}, jauh di bawah batas umum 0,1.</div></li>
        <li><span className="icon pass">✓</span>
          <div><strong>Tidak ada hasil yang hilang.</strong> {fmtInt(d.missing_outcomes)} dari 64.000
            orang tanpa data hasil.</div></li>
        <li><span className="icon info">i</span>
          <div><strong>Efek yang diukur adalah efek "dikirimi email".</strong> Data tidak mencatat siapa
            yang membuka email, jadi efek membaca email tidak bisa dipisahkan (analisis intention to
            treat).</div></li>
        <li><span className="icon info">i</span>
          <div><strong>Diasumsikan tidak ada saling pengaruh antar pelanggan.</strong> Email ke satu
            orang dianggap tidak mengubah perilaku orang di kelompok lain. Asumsi ini tidak bisa diuji
            dari data.</div></li>
      </ul>
      <div className="card">
        <h3>Keseimbangan ciri pelanggan</h3>
        <p className="hint">Semakin dekat ke nol, semakin mirip kelompok email dengan kelompok tanpa email.</p>
        <Legend />
        <PlotFigure render={render} theme={theme} label="Selisih terstandar ciri pelanggan per kelompok" />
      </div>
    </>
  );
}
