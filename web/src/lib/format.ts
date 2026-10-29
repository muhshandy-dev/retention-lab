const id = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("id-ID", opts);

const int = id({ maximumFractionDigits: 0 });
export const fmtInt = (n: number) => int.format(n);

export const fmtPct = (p: number, digits = 1) =>
  `${id({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(p * 100)}%`;

/** Percentage-point difference, always signed. "pp" (poin persen) is explained on the page. */
export const fmtPp = (d: number, digits = 2) =>
  `${d >= 0 ? "+" : "−"}${id({ minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(Math.abs(d * 100))} pp`;

export const fmtUsd = (x: number, digits = 2) =>
  `US$${id({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x)}`;

export const fmtSignedUsd = (x: number, digits = 2) => `${x >= 0 ? "+" : "−"}${fmtUsd(Math.abs(x), digits)}`;

export const fmtNum = (x: number, digits = 2) =>
  id({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);

/** p-values: plain decimals down to 0,001, then "< 0,001". */
export const fmtP = (p: number) => (p < 0.001 ? "< 0,001" : fmtNum(p, 3));

export const ARM_LABEL: Record<string, string> = {
  "No E-Mail": "Tanpa email",
  "Mens E-Mail": "Email produk pria",
  "Womens E-Mail": "Email produk wanita",
};

export const OUTCOME_LABEL: Record<string, string> = {
  visit: "Berkunjung ke situs",
  conversion: "Membeli",
  spend: "Belanja per orang",
};

export const VARIABLE_LABEL: Record<string, string> = {
  newbie: "Pelanggan baru atau lama",
  channel: "Saluran belanja sebelumnya",
  zip_code: "Wilayah tempat tinggal",
  history_segment: "Total belanja tahun lalu",
};

export const LEVEL_LABEL: Record<string, string> = {
  "0": "Pelanggan lama",
  "1": "Pelanggan baru",
  Phone: "Telepon",
  Web: "Web",
  Multichannel: "Telepon dan web",
  Urban: "Perkotaan",
  Surburban: "Pinggiran kota",
  Rural: "Pedesaan",
  "1) $0 - $100": "US$0 sampai 100",
  "2) $100 - $200": "US$100 sampai 200",
  "3) $200 - $350": "US$200 sampai 350",
  "4) $350 - $500": "US$350 sampai 500",
  "5) $500 - $750": "US$500 sampai 750",
  "6) $750 - $1,000": "US$750 sampai 1.000",
  "7) $1,000 +": "Di atas US$1.000",
};

export const COVARIATE_LABEL: Record<string, string> = {
  recency: "Bulan sejak belanja terakhir",
  history: "Nilai belanja tahun lalu",
  mens: "Pernah beli produk pria",
  womens: "Pernah beli produk wanita",
  newbie: "Pelanggan baru",
  "zip_code=Urban": "Tinggal di perkotaan",
  "zip_code=Surburban": "Tinggal di pinggiran kota",
  "zip_code=Rural": "Tinggal di pedesaan",
  "channel=Phone": "Belanja lewat telepon",
  "channel=Web": "Belanja lewat web",
  "channel=Multichannel": "Belanja lewat telepon dan web",
};

/** Format an effect difference for an outcome. */
export const fmtDiff = (outcome: string, d: number) =>
  outcome === "spend" ? fmtSignedUsd(d) : fmtPp(d);

export const fmtLevel = (outcome: string, v: number) =>
  outcome === "spend" ? fmtUsd(v) : fmtPct(v, 2);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

export const fmtGbp = (x: number, digits = 2) =>
  `£${id({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x)}`;

const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember"];
/** "2011-12-09" -> "9 Desember 2011" */
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
};
