import { describe, it, expect } from 'vitest';
import { monteCarlo } from './monteCarlo';
import { martingale } from './strategies/martingale';

/** Shared base options for all tests — fast enough for CI. */
function baseOpts(runs: number, seed = 42) {
  return {
    strategy: martingale({ target: 'red', baseUnit: 5 }),
    wheelType: 'european' as const,
    startingBankroll: 1000,
    baseUnit: 5,
    maxSpins: 100,
    seed,
    runs,
  };
}

describe('monteCarlo', () => {
  it('is deterministic: same (seed, runs) ⇒ identical result', () => {
    const a = monteCarlo(baseOpts(50));
    const b = monteCarlo(baseOpts(50));
    expect(a).toEqual(b);
  });

  it('percentile ordering holds: p5 ≤ p25 ≤ median ≤ p75 ≤ p95', () => {
    const r = monteCarlo(baseOpts(100));
    expect(r.p5).toBeLessThanOrEqual(r.p25);
    expect(r.p25).toBeLessThanOrEqual(r.median);
    expect(r.median).toBeLessThanOrEqual(r.p75);
    expect(r.p75).toBeLessThanOrEqual(r.p95);
  });

  it('histogram bin counts sum to runs', () => {
    const runs = 80;
    const r = monteCarlo(baseOpts(runs));
    const total = r.histogram.reduce((acc, b) => acc + b.count, 0);
    expect(total).toBe(runs);
  });

  it('adjacent base seeds produce different results (runs are not shared)', () => {
    // For 5 different (seed, seed+1) pairs, check medians differ in at least
    // one pair — if seeds were sequential without mixing they'd often share runs.
    const seeds = [1, 10, 100, 1000, 9999];
    let anyDiffer = false;
    for (const s of seeds) {
      const a = monteCarlo(baseOpts(10, s));
      const b = monteCarlo(baseOpts(10, s + 1));
      if (a.median !== b.median) {
        anyDiffer = true;
        break;
      }
    }
    expect(anyDiffer).toBe(true);
  });
});
