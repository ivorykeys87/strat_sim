import { simulate } from './simulate';
import type { SimulateOptions } from './simulate';

export interface MonteCarloResult {
  runs: number;
  ruinRate: number;      // fraction 0–1
  median: number;        // median final bankroll
  mean: number;          // mean final bankroll
  worstDrawdown: number; // max maxDrawdown across all runs
}

/**
 * Runs `opts.runs` simulations with seeds `opts.seed, opts.seed+1, …`
 * and returns aggregate statistics. The `spins` arrays are discarded
 * immediately to keep memory usage low.
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
    const r = simulate({ ...simBase, seed: seed + i });
    if (r.ruined) ruinedCount++;
    if (r.maxDrawdown > worstDrawdown) worstDrawdown = r.maxDrawdown;
    finalBankrolls.push(r.finalBankroll);
  }

  // Median
  finalBankrolls.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median =
    n % 2 === 1
      ? finalBankrolls[mid]
      : (finalBankrolls[mid - 1] + finalBankrolls[mid]) / 2;

  // Mean
  const mean = finalBankrolls.reduce((acc, v) => acc + v, 0) / n;

  return {
    runs: n,
    ruinRate: ruinedCount / n,
    median,
    mean,
    worstDrawdown,
  };
}
