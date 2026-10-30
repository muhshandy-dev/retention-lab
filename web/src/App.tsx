import { useEffect, useMemo, useState } from "react";
import { type HillstromFile, toTable } from "./lib/experiment.ts";
import { ARM_LABEL, fmtDiff, fmtInt, fmtNum } from "./lib/format.ts";
import { Experiment, Fairness } from "./sections/Experiment.tsx";
import { Method } from "./sections/Method.tsx";
import { Power } from "./sections/Power.tsx";
import { Retention } from "./sections/Retention.tsx";
import { Subgroups } from "./sections/Subgroups.tsx";
import type { ExperimentResult, Manifest, RetentionResult } from "./types.ts";

interface Loaded {
  manifest: Manifest;
  experiment: ExperimentResult;
  hillstrom: HillstromFile;
  retention: RetentionResult;
}

async function load(): Promise<Loaded> {
  const get = async (name: string) => {
    const res = await fetch(`data/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return res.json();
  };
  const [manifest, experiment, hillstrom, retention] = await Promise.all(
    ["manifest.json", "experiment.json", "hillstrom.json", "retention.json"].map(get));
  return { manifest, experiment, hillstrom, retention };
}

function useTheme(): [string, () => void] {
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const stored = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  const [theme, setTheme] = useState(stored ?? (media?.matches ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!media) return;
    const on = (e: MediaQueryListEvent) => {
      try { if (localStorage.getItem("theme")) return; } catch { /* storage blocked */ }
      setTheme(e.matches ? "dark" : "light");
    };
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, [media]);
  const toggle = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", next); } catch { /* storage blocked */ }
    return next;
  });
  return [theme, toggle];
}

function Logo() {
  // Three cohort rows fading out: the shape of a retention heatmap.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="2" y="3" width="6" height="6" rx="1.5" fill="var(--plum-strong)" />
      <rect x="10" y="3" width="6" height="6" rx="1.5" fill="var(--plum)" />
      <rect x="18" y="3" width="6" height="6" rx="1.5" fill="var(--plum)" opacity="0.45" />
      <rect x="2" y="11" width="6" height="6" rx="1.5" fill="var(--plum-strong)" />
      <rect x="10" y="11" width="6" height="6" rx="1.5" fill="var(--plum)" opacity="0.45" />
      <rect x="2" y="19" width="6" height="6" rx="1.5" fill="var(--plum-strong)" />
    </svg>
  );
}

export function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();
  useEffect(() => { load().then(setData, (e: Error) => setError(e.message)); }, []);
  const table = useMemo(() => (data ? toTable(data.hillstrom) : null), [data]);

  const retailReal = data?.manifest.sources.online_retail_ii?.status === "real";
  const mens = data?.experiment.effects.filter((e) => e.arm === "Mens E-Mail");

  return (
    <>
      <a className="sr-only" href="#isi">Langsung ke isi</a>
      <header className="topbar">
        <div className="wrap">
          <a className="brand" href="#"><Logo />Retention Lab</a>
          <nav className="nav" aria-label="Bagian">
            <a href="#eksperimen">Eksperimen</a>
            <a href="#keadilan">Keadilan acak</a>
            <a href="#subgrup">Subgrup</a>
            <a href="#power">Power</a>
            <a href="#retensi">Retensi kohort</a>
            <a href="#metode">Metode</a>
          </nav>
          <button className="theme-btn" type="button" onClick={toggleTheme}
            aria-label={theme === "dark" ? "Pakai tema terang" : "Pakai tema gelap"}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>
      <main id="isi">
        <header className="hero">
          <div className="wrap">
            <h1>Retention Lab</h1>
            <p className="lead">
              Siapa yang kembali belanja, dan apakah sebuah email benar-benar mengubah perilaku
              pelanggan? Semua angka di sini disertai rentang ketidakpastian, dan hanya eksperimen
              acak yang dibaca sebagai sebab-akibat.
            </p>
            <div className="chips">
              <span className="chip"><i className="dot ok" />Eksperimen email Hillstrom: data asli, 64.000 pelanggan</span>
              <span className="chip"><i className={`dot ${retailReal ? "ok" : "wait"}`} />
                Transaksi Online Retail II: {retailReal ? "data asli" : "belum dijalankan"}</span>
            </div>
          </div>
        </header>

        {error && <div className="wrap"><div className="empty">Data gagal dimuat: {error}</div></div>}
        {!data && !error && <div className="wrap"><p className="hint">Memuat data…</p></div>}

        {data && table && mens && (
          <>
            <section aria-labelledby="h-ringkas">
              <div className="wrap">
                <h2 id="h-ringkas">Ringkasan</h2>
                <p className="intro">Efek email produk pria dibanding tanpa email (pp = poin persen).</p>
                <div className="tiles">
                  {mens.map((e) => (
                    <div className="tile" key={e.outcome}>
                      <div className="label">{ARM_LABEL[e.arm]}: {e.outcome === "visit" ? "kunjungan" : e.outcome === "conversion" ? "pembelian" : "belanja per orang"}</div>
                      <div className="value">{fmtDiff(e.outcome, e.diff)}</div>
                      <div className="sub">rentang 95% {fmtDiff(e.outcome, e.lo)} sampai {fmtDiff(e.outcome, e.hi)}</div>
                    </div>
                  ))}
                  <div className="tile">
                    <div className="label">Pengacakan</div>
                    <div className="value">{data.experiment.design.srm_ok && data.experiment.design.balance_ok ? "Lolos" : "Perlu dicek"}</div>
                    <div className="sub">pembagian p = {fmtNum(data.experiment.design.srm_p_value, 2)}, selisih ciri terbesar {fmtNum(data.experiment.design.max_abs_smd, 3)}</div>
                  </div>
                </div>
              </div>
            </section>

            <section id="eksperimen" aria-labelledby="h-eks">
              <div className="wrap">
                <h2 id="h-eks">Eksperimen email</h2>
                <p className="intro">
                  Tahun 2008, {fmtInt(64000)} pelanggan sebuah toko ritel dibagi acak menjadi tiga
                  kelompok: dikirimi email produk pria, dikirimi email produk wanita, atau tidak dikirimi
                  apa pun. Hasil dicatat selama dua minggu setelah email dikirim. Karena pembagiannya acak,
                  selisih antar kelompok bisa dibaca sebagai efek email.
                </p>
                <Experiment data={data.experiment} theme={theme} />
              </div>
            </section>

            <section id="keadilan" aria-labelledby="h-adil">
              <div className="wrap">
                <h2 id="h-adil">Apakah pengacakannya bisa dipercaya?</h2>
                <p className="intro">Efek hanya bisa dibaca sebagai sebab-akibat bila syarat berikut terpenuhi.</p>
                <Fairness data={data.experiment} theme={theme} />
              </div>
            </section>

            <section id="subgrup" aria-labelledby="h-sub">
              <div className="wrap">
                <h2 id="h-sub">Jelajah subgrup</h2>
                <Subgroups data={data.experiment} file={data.hillstrom} table={table} theme={theme} />
              </div>
            </section>

            <section id="power" aria-labelledby="h-pow">
              <div className="wrap">
                <h2 id="h-pow">Power: seberapa kecil efek yang bisa terlihat?</h2>
                <p className="intro">
                  Eksperimen yang terlalu kecil bisa gagal melihat efek yang sebenarnya ada. Power adalah
                  peluang eksperimen mendeteksi efek dengan ukuran tertentu.
                </p>
                <Power data={data.experiment} />
              </div>
            </section>

            <section id="retensi" aria-labelledby="h-ret">
              <div className="wrap">
                <h2 id="h-ret">Retensi kohort</h2>
                <p className="intro">
                  Berapa banyak pelanggan baru yang belanja lagi pada bulan-bulan berikutnya? Data ini
                  observasional: tidak ada pengacakan, jadi tidak ada klaim sebab-akibat di bagian ini.
                </p>
                <Retention data={data.retention} theme={theme} />
              </div>
            </section>

            <section id="metode" aria-labelledby="h-met">
              <div className="wrap">
                <h2 id="h-met">Metode dan batasan</h2>
                <Method manifest={data.manifest} />
              </div>
            </section>
          </>
        )}
      </main>
      <footer>
        <div className="wrap">
          Retention Lab. Data: Hillstrom MineThatData E-Mail Analytics Challenge (2008) dan Online
          Retail II (UCI Machine Learning Repository, CC BY 4.0). Situs statis tanpa server; semua
          interaksi dihitung di browser Anda.
        </div>
      </footer>
    </>
  );
}
