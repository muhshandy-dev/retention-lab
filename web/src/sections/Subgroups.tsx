import * as Plot from "@observablehq/plot";
import { useCallback, useMemo, useState } from "react";
import { categoryAxis, type Palette, PlotFigure } from "../components/PlotFigure.tsx";
import {
  type HillstromFile, type Outcome, subgroup, type toTable, type Variable, VARIABLES,
} from "../lib/experiment.ts";
import { ARM_LABEL, fmtDiff, fmtInt, fmtNum, fmtP, LEVEL_LABEL, VARIABLE_LABEL } from "../lib/format.ts";
import type { ExperimentResult } from "../types.ts";
import { Outcomes } from "./Experiment.tsx";

export function Subgroups({ data, file, table, theme }: {
  data: ExperimentResult;
  file: HillstromFile;
  table: ReturnType<typeof toTable>;
  theme: string;
}) {
  const [variable, setVariable] = useState<Variable>("newbie");
  const [arm, setArm] = useState(1);
  const [outcome, setOutcome] = useState<Outcome>("visit");

  // Recomputed in the browser from the 64,000 rows (Arquero); tests check it equals Python.
  const result = useMemo(() => subgroup(table, file, variable, arm, outcome),
    [table, file, variable, arm, outcome]);
  const overall = data.effects.find((e) => e.arm === file.arms[arm] && e.outcome === outcome)!;
  const published = data.subgroups.find((s) => s.variable === variable && s.arm === file.arms[arm]
    && s.outcome === outcome)!;
  const color = arm === 1 ? "plum" : "ochre";

  const render = useCallback((width: number, p: Palette) => {
    const scale = outcome === "spend" ? 1 : 100;
    const rows = result.cells.map((c) => ({ ...c, label: LEVEL_LABEL[c.level] ?? c.level,
      x: c.diff * scale, x1: c.lo * scale, x2: c.hi * scale }));
    const fill = p[color];
    const ax = categoryAxis(width, rows.map((r) => r.label), p, 200);
    return Plot.plot({
      width, height: ax.rowHeight * rows.length + 64, marginLeft: ax.marginLeft, marginRight: 24,
      marginBottom: 44,
      style: { background: "transparent", color: p.ink2, fontFamily: "var(--font)", fontSize: "13px" },
      x: { label: outcome === "spend" ? "Selisih belanja (US$ per orang)" : "Selisih (pp)",
        grid: true, nice: true, labelAnchor: "center", labelOffset: 38,
        tickFormat: (v: number) => fmtNum(v, Number.isInteger(v) ? 0 : 1) },
      y: { label: null, domain: rows.map((r) => r.label) },
      marks: [
        ...ax.marks,
        Plot.ruleX([0], { stroke: p.ink2 }),
        Plot.ruleX([overall.diff * scale], { stroke: p.neutral, strokeWidth: 1 }),
        Plot.link(rows, { x1: "x1", x2: "x2", y1: "label", y2: "label", stroke: fill, strokeWidth: 2,
          strokeLinecap: "round" }),
        Plot.dot(rows, { x: "x", y: "label", r: 5, fill, stroke: p.surface, strokeWidth: 2 }),
        Plot.tip(rows, Plot.pointerY({ x: "x", y: "label", title: (r) =>
          `${r.label}\nSelisih ${fmtDiff(outcome, r.diff)}\nRentang 95%: ${fmtDiff(outcome, r.lo)} sampai ${fmtDiff(outcome, r.hi)}\n${fmtInt(r.n_treatment)} dikirimi email, ${fmtInt(r.n_control)} tanpa email` })),
      ],
    });
  }, [result, outcome, overall, color]);

  return (
    <div className="card">
      <h3>Apakah efeknya berbeda untuk tiap jenis pelanggan?</h3>
      <p className="hint">
        Pilih ciri pelanggan. Angka dihitung ulang langsung di browser Anda dari 64.000 baris data.
        Garis tipis abu-abu adalah efek untuk semua pelanggan.
      </p>
      <div className="controls">
        <label className="field">Ciri pelanggan
          <select value={variable} onChange={(e) => setVariable(e.target.value as Variable)}>
            {VARIABLES.map((v) => <option key={v} value={v}>{VARIABLE_LABEL[v]}</option>)}
          </select>
        </label>
        <label className="field">Email
          <select value={arm} onChange={(e) => setArm(Number(e.target.value))}>
            <option value={1}>{ARM_LABEL["Mens E-Mail"]}</option>
            <option value={2}>{ARM_LABEL["Womens E-Mail"]}</option>
          </select>
        </label>
        <Outcomes value={outcome} onChange={(v) => setOutcome(v as Outcome)} />
      </div>
      <PlotFigure render={render} theme={theme}
        label={`Efek ${ARM_LABEL[file.arms[arm]]} per ${VARIABLE_LABEL[variable]}`} />
      <div className="callout">
        Uji beda antar kelompok (Cochran Q): p = {fmtP(result.p)} sebelum koreksi, p ={" "}
        {fmtP(published.q_p_holm)} setelah koreksi Holm atas {fmtInt(data.subgroups.length)} uji
        subgrup. {published.q_p_holm < 0.05
          ? "Perbedaan antar kelompok tetap jelas setelah koreksi."
          : "Setelah koreksi, perbedaan antar kelompok ini tidak cukup kuat untuk disimpulkan."}{" "}
        Analisis subgrup bersifat eksploratif: gunakan untuk menyusun eksperimen berikutnya, bukan
        untuk mengambil keputusan.
      </div>
      <details>
        <summary>Lihat angka dalam tabel</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kelompok</th><th className="n">Dikirimi email</th><th className="n">Tanpa email</th>
              <th className="n">Selisih</th><th className="n">Rentang 95%</th><th className="n">p</th></tr></thead>
            <tbody>
              {result.cells.map((c) => (
                <tr key={c.level}>
                  <td>{LEVEL_LABEL[c.level] ?? c.level}</td>
                  <td className="n">{fmtInt(c.n_treatment)}</td><td className="n">{fmtInt(c.n_control)}</td>
                  <td className="n">{fmtDiff(outcome, c.diff)}</td>
                  <td className="n">{fmtDiff(outcome, c.lo)} sampai {fmtDiff(outcome, c.hi)}</td>
                  <td className="n">{fmtP(c.p_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Q = {fmtNum(result.q, 2)} dengan derajat bebas {result.df}. Kelompok dengan kurang dari 100 orang per sisi tidak ditampilkan.</p>
      </details>
    </div>
  );
}
