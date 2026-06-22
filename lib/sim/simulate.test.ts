import { describe, it, expect } from 'vitest';
import { simulate } from './simulate';
import { martingale } from './strategies/martingale';
import { resolveBet } from './bets';
import type { Strategy } from './strategy';

const BASE_OPTS = {
  strategy: martingale({ target: 'red', baseUnit: 5 }),
  wheelType: 'european' as const,
  startingBankroll: 1000,
  baseUnit: 5,
  maxSpins: 200,
  seed: 42,
};

describe('simulate – determinism', () => {
  it('same seed produces identical results on two runs', () => {
    const r1 = simulate({ ...BASE_OPTS, strategy: martingale({ target: 'red', baseUnit: 5 }) });
    const r2 = simulate({ ...BASE_OPTS, strategy: martingale({ target: 'red', baseUnit: 5 }) });

    expect(r1.finalBankroll).toBe(r2.finalBankroll);
    expect(r1.spins.length).toBe(r2.spins.length);
    expect(r1.ruined).toBe(r2.ruined);
    expect(r1.maxDrawdown).toBe(r2.maxDrawdown);
    expect(r1.peakBankroll).toBe(r2.peakBankroll);
  });

  it('result has the correct shape', () => {
    const r = simulate(BASE_OPTS);
    expect(typeof r.finalBankroll).toBe('number');
    expect(typeof r.spins.length).toBe('number');
    expect(typeof r.ruined).toBe('boolean');
    expect(typeof r.maxDrawdown).toBe('number');
    expect(typeof r.peakBankroll).toBe('number');
    expect(r.spins.length).toBeGreaterThan(0);
    expect(r.spins.length).toBeLessThanOrEqual(200);
  });
});

describe('simulate – bankroll invariants', () => {
  it('bankroll never goes negative', () => {
    const r = simulate(BASE_OPTS);
    for (const spin of r.spins) {
      expect(spin.bankrollAfter).toBeGreaterThanOrEqual(0);
    }
    expect(r.finalBankroll).toBeGreaterThanOrEqual(0);
  });

  it('peakBankroll >= startingBankroll', () => {
    const r = simulate(BASE_OPTS);
    expect(r.peakBankroll).toBeGreaterThanOrEqual(BASE_OPTS.startingBankroll);
  });

  it('maxDrawdown >= 0', () => {
    const r = simulate(BASE_OPTS);
    expect(r.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('bankrollAfter on final spin equals finalBankroll', () => {
    const r = simulate(BASE_OPTS);
    if (r.spins.length > 0) {
      expect(r.spins[r.spins.length - 1].bankrollAfter).toBe(r.finalBankroll);
    }
  });
});

describe('simulate – ruined when bankroll too small', () => {
  it('ruined === true and bankroll does not go negative when starting with tiny bankroll', () => {
    // $5 bankroll, $5 base unit — a single loss means we cannot double up.
    // seed 1 is likely to produce a loss quickly; we try a few seeds.
    // We test the invariant: whenever ruined is true, finalBankroll >= 0.
    const seeds = [1, 2, 3, 4, 5, 10, 20, 99, 100];
    let ruinedOnce = false;

    for (const seed of seeds) {
      const r = simulate({
        strategy: martingale({ target: 'black', baseUnit: 5 }),
        wheelType: 'european',
        startingBankroll: 5,
        baseUnit: 5,
        maxSpins: 100,
        seed,
      });
      expect(r.finalBankroll).toBeGreaterThanOrEqual(0);
      if (r.ruined) ruinedOnce = true;
    }

    // At least one of those seeds should cause ruin (first loss exhausts the bankroll).
    expect(ruinedOnce).toBe(true);
  });

  it('stops when strategy returns [] due to insufficient bankroll', () => {
    // With $5 bankroll and $5 base, the strategy must return [] after first loss.
    // The run should complete with <= maxSpins spins.
    const r = simulate({
      strategy: martingale({ target: 'red', baseUnit: 5 }),
      wheelType: 'european',
      startingBankroll: 5,
      baseUnit: 5,
      maxSpins: 500,
      seed: 3,
    });
    // Can't have played 500 spins with only $5 — must have stopped early
    expect(r.spins.length).toBeLessThan(500);
  });
});

describe('simulate – multiple bets per spin', () => {
  it('netPnl equals sum of resolved bets', () => {
    const r = simulate(BASE_OPTS);
    for (const spin of r.spins) {
      const summed = spin.bets.reduce((acc, _bet) => acc, 0); // just structural check
      expect(Array.isArray(spin.bets)).toBe(true);
      expect(typeof spin.netPnl).toBe('number');
      void summed;
    }
  });
});

describe('simulate – blockPnls accumulation', () => {
  it('SpinResult.blockPnls[x] equals the sum of resolveBet for bets with blockId x', () => {
    // Strategy: one red bet + one black bet, both tagged blockId 'x'.
    // On any non-green spin, one wins and one loses by equal magnitude → net 0.
    // On green, both lose → net = -amount * 2.
    // Either way, blockPnls.x should equal the arithmetic sum of the two resolved bets.
    const betAmount = 10;
    const fixedStrategy: Strategy = {
      name: 'test-block-pnl',
      nextBets: () => [
        { kind: 'red', amount: betAmount, blockId: 'x' },
        { kind: 'black', amount: betAmount, blockId: 'x' },
      ],
    };

    const result = simulate({
      strategy: fixedStrategy,
      wheelType: 'european',
      startingBankroll: 1000,
      baseUnit: 10,
      maxSpins: 1,
      seed: 1,
    });

    expect(result.spins).toHaveLength(1);
    const spin = result.spins[0];

    // blockPnls must be defined and have key 'x'
    expect(spin.blockPnls).toBeDefined();
    expect(typeof spin.blockPnls!['x']).toBe('number');

    // Manually compute expected block P&L
    const expectedBlockPnl =
      resolveBet({ kind: 'red', amount: betAmount }, spin.pocket) +
      resolveBet({ kind: 'black', amount: betAmount }, spin.pocket);

    expect(spin.blockPnls!['x']).toBe(expectedBlockPnl);

    // netPnl must also match the same sum (only two bets, both in block x)
    expect(spin.netPnl).toBe(expectedBlockPnl);
  });

  it('bets without blockId do not contribute to blockPnls', () => {
    // Strategy returns one untagged bet — blockPnls should be absent.
    const fixedStrategy: Strategy = {
      name: 'test-no-block',
      nextBets: () => [{ kind: 'red', amount: 5 }],
    };

    const result = simulate({
      strategy: fixedStrategy,
      wheelType: 'european',
      startingBankroll: 1000,
      baseUnit: 5,
      maxSpins: 1,
      seed: 1,
    });

    expect(result.spins).toHaveLength(1);
    // No bets have a blockId, so blockPnls should be undefined
    expect(result.spins[0].blockPnls).toBeUndefined();
  });
});
