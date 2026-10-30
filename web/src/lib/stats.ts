// Browser twin of src/retention_lab/stats.py. Same formulas, same order of operations,
// so tests/parity.test.ts can require agreement with the Python output.

const SQRT_PI = Math.sqrt(Math.PI);

/** erfc(x) for x >= 0: power series below 2, Lentz continued fraction above. */
function erfcPos(x: number): number {
  if (x < 2) {
    let term = x;
    let sum = x;
    for (let n = 1; n < 200; n++) {
      term *= (-x * x) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return 1 - (2 / SQRT_PI) * sum;
  }
  // erfc(x) = exp(-x^2)/sqrt(pi) / (x + (1/2)/(x + 1/(x + (3/2)/(x + ...))))
  const tiny = 1e-300;
  let f = x;
  let c = x;
  let d = 0;
  for (let n = 1; n < 500; n++) {
    const a = n / 2;
    d = x + a * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = x + a / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / SQRT_PI / f;
}

/** Standard normal survival function P(Z > z). */
export function normSf(z: number): number {
  const v = erfcPos(Math.abs(z) / Math.SQRT2) / 2;
  return z >= 0 ? v : 1 - v;
}

export function normCdf(z: number): number {
  return normSf(-z);
}

/** Inverse standard normal CDF: Acklam start, then Halley steps on the exact CDF. */
export function normPpf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269,
    -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let x: number;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  for (let i = 0; i < 3; i++) {
    const e = normCdf(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

export function zCrit(conf = 0.95): number {
  return normPpf(1 - (1 - conf) / 2);
}

export function wilsonCi(k: number, n: number, conf = 0.95): [number, number] {
  if (n <= 0) return [NaN, NaN];
  const z = zCrit(conf);
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface Effect {
  control: number;
  treatment: number;
  diff: number;
  lo: number;
  hi: number;
  p_value: number;
  lift: number;
  lift_lo: number;
  lift_hi: number;
  se: number;
}

export function diffProportions(k1: number, n1: number, k0: number, n0: number, conf = 0.95): Effect {
  const p1 = k1 / n1;
  const p0 = k0 / n0;
  const [l1, u1] = wilsonCi(k1, n1, conf);
  const [l0, u0] = wilsonCi(k0, n0, conf);
  const d = p1 - p0;
  const lo = d - Math.sqrt((p1 - l1) ** 2 + (u0 - p0) ** 2);
  const hi = d + Math.sqrt((u1 - p1) ** 2 + (p0 - l0) ** 2);
  const pooled = (k1 + k0) / (n1 + n0);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n0));
  const pValue = sePooled > 0 ? 2 * normSf(Math.abs(d) / sePooled) : 1;
  let lift = NaN;
  let liftLo = NaN;
  let liftHi = NaN;
  if (k1 > 0 && k0 > 0) {
    const z = zCrit(conf);
    const logRr = Math.log(p1 / p0);
    const seLog = Math.sqrt(1 / k1 - 1 / n1 + 1 / k0 - 1 / n0);
    lift = p1 / p0 - 1;
    liftLo = Math.exp(logRr - z * seLog) - 1;
    liftHi = Math.exp(logRr + z * seLog) - 1;
  }
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p0 * (1 - p0)) / n0);
  return { control: p0, treatment: p1, diff: d, lo, hi, p_value: pValue, lift, lift_lo: liftLo,
    lift_hi: liftHi, se };
}

export function diffMeans(mean1: number, var1: number, n1: number, mean0: number, var0: number,
  n0: number, conf = 0.95): Effect {
  const z = zCrit(conf);
  const d = mean1 - mean0;
  const se = Math.sqrt(var1 / n1 + var0 / n0);
  const pValue = se > 0 ? 2 * normSf(Math.abs(d) / se) : 1;
  let lift = NaN;
  let liftLo = NaN;
  let liftHi = NaN;
  if (mean1 > 0 && mean0 > 0) {
    const seLog = Math.sqrt(var1 / (n1 * mean1 ** 2) + var0 / (n0 * mean0 ** 2));
    const logR = Math.log(mean1 / mean0);
    lift = mean1 / mean0 - 1;
    liftLo = Math.exp(logR - z * seLog) - 1;
    liftHi = Math.exp(logR + z * seLog) - 1;
  }
  return { control: mean0, treatment: mean1, diff: d, lo: d - z * se, hi: d + z * se,
    p_value: pValue, lift, lift_lo: liftLo, lift_hi: liftHi, se };
}

export function holm(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((_, i) => i).sort((a, b) => pValues[a] - pValues[b]);
  const adjusted = new Array<number>(m).fill(0);
  let running = 0;
  order.forEach((i, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * pValues[i]));
    adjusted[i] = running;
  });
  return adjusted;
}

// ------------------------------------------------------------------ power

export function powerTwoProportions(p0: number, delta: number, nPerArm: number, alpha = 0.05): number {
  const p1 = p0 + delta;
  if (!(p1 > 0 && p1 < 1) || nPerArm <= 0) return NaN;
  const za = zCrit(1 - alpha);
  const pbar = (p0 + p1) / 2;
  const se0 = Math.sqrt((2 * pbar * (1 - pbar)) / nPerArm);
  const se1 = Math.sqrt((p0 * (1 - p0) + p1 * (1 - p1)) / nPerArm);
  return normCdf((Math.abs(delta) - za * se0) / se1);
}

export function nTwoProportions(p0: number, delta: number, alpha = 0.05, power = 0.8): number {
  const p1 = p0 + delta;
  const za = zCrit(1 - alpha);
  const zb = normPpf(power);
  const pbar = (p0 + p1) / 2;
  const num = za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p0 * (1 - p0) + p1 * (1 - p1));
  return Math.ceil((num / delta) ** 2);
}

/** Smallest detectable absolute increase; bisection (power rises with delta). */
export function mdeTwoProportions(p0: number, nPerArm: number, alpha = 0.05, power = 0.8): number {
  let lo = 1e-9;
  let hi = 1 - p0 - 1e-9;
  if (powerTwoProportions(p0, hi, nPerArm, alpha) < power) return NaN;
  for (let i = 0; i < 200 && hi - lo > 1e-13; i++) {
    const mid = (lo + hi) / 2;
    if (powerTwoProportions(p0, mid, nPerArm, alpha) < power) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function mdeMeans(sd: number, nPerArm: number, alpha = 0.05, power = 0.8): number {
  return (zCrit(1 - alpha) + normPpf(power)) * sd * Math.sqrt(2 / nPerArm);
}

// ------------------------------------------------------------------ heterogeneity

/** Regularised upper incomplete gamma Q(a, x) (Numerical Recipes gammq). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    d = Math.abs(d) < tiny ? tiny : d;
    c = b + an / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

function logGamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9), accurate to ~1e-15 for x > 0.
  const g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let s = g[0];
  for (let i = 1; i < 9; i++) s += g[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s);
}

export function chi2Sf(x: number, df: number): number {
  return gammaQ(df / 2, x / 2);
}

export function cochranQ(diffs: number[], ses: number[]): { q: number; df: number; p: number } {
  const w = ses.map((s) => 1 / (s * s));
  const sw = w.reduce((a, b) => a + b, 0);
  const pooled = diffs.reduce((acc, d, i) => acc + w[i] * d, 0) / sw;
  const q = diffs.reduce((acc, d, i) => acc + w[i] * (d - pooled) ** 2, 0);
  const df = diffs.length - 1;
  return { q, df, p: chi2Sf(q, df) };
}
