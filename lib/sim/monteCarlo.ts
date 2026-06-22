import { simulate } from './simulate';
import type { SimulateOptions } from './simulate';

export interface MonteCarloResult {
  runs: number;
  ruinRate: number;      // fraction 0–1
  median: number;        // median final bankroll
  mean: number;          // mean final bankroll
  worstDrawdown: number; // max maxDrawdown across all runs
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  histogram: { binStart: number; binEnd: number; count: number }[];
}

/** splitmix32-style mixer: combines base seed and run index into an independent 32-bit seed. */
function mixSeed(base: number, i: number): number {
  let x = (base ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Type-7 / numpy-default linear interpolation percentile on a sorted array.
 * p is in [0, 100].
 */
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const h = ((n - 1) * p) / 100;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Runs `opts.runs` simulations, each with an independently mixed seed derived
 * from `(opts.seed, i)`, and returns aggregate statistics. The `spins` arrays
 * are discarded immediately to keep memory usage low.
 */
export function monteCarlo(
  opts: Omit<SimulateOptions, 'seed'> & { seed: number; runs: number },
): MonteCarloResult {
  const { runs, seed, ...simBase } = opts;
  const n = Math.max(1, runs);

  let ruinedCount = 0;
  let worstDrawdown = 0;
  const finalBankrolls: number[] = [];

  for (let i = 0; i < n; i++) {
    const r = simulate({ ...simBase, seed: mixSeed(seed, i) });
    if (r.ruined) ruinedCount++;
    if (r.maxDrawdown > worstDrawdown) worstDrawdown = r.maxDrawdown;
    finalBankrolls.push(r.finalBankroll);
  }

  // Sort once — used for median, percentiles, and histogram bounds.
  finalBankrolls.sort((a, b) => a - b);

  // Median
  const mid = Math.floor(n / 2);
  const median =
    n % 2 === 1
      ? finalBankrolls[mid]
      : (finalBankrolls[mid - 1] + finalBankrolls[mid]) / 2;

  // Mean
  const mean = finalBankrolls.reduce((acc, v) => acc + v, 0) / n;

  // Percentiles
  const p5  = percentile(finalBankrolls, 5);
  const p25 = percentile(finalBankrolls, 25);
  const p75 = percentile(finalBankrolls, 75);
  const p95 = percentile(finalBankrolls, 95);

  // Histogram — 20 equal-width bins over [min, max].
  const minVal = finalBankrolls[0];
  const maxVal = finalBankrolls[n - 1];
  let histogram: { binStart: number; binEnd: number; count: number }[];

  if (minVal === maxVal) {
    histogram = [{ binStart: minVal, binEnd: maxVal, count: n }];
  } else {
    const NUM_BINS = 20;
    const width = (maxVal - minVal) / NUM_BINS;
    histogram = Array.from({ length: NUM_BINS }, (_, k) => ({
      binStart: minVal + k * width,
      binEnd: minVal + (k + 1) * width,
      count: 0,
    }));
    for (const v of finalBankrolls) {
      // Clamp the last value into the final bin rather than spilling to bin 20.
      const idx = Math.min(Math.floor((v - minVal) / width), NUM_BINS - 1);
      histogram[idx].count++;
    }
  }

  return {
    runs: n,
    ruinRate: ruinedCount / n,
    median,
    mean,
    worstDrawdown,
    p5,
    p25,
    p75,
    p95,
    histogram,
  };
}
