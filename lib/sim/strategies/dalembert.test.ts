import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate';
import { dalembert } from './dalembert';
import type { StrategyContext, SpinResult } from '../strategy';
import type { Pocket } from '../wheel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoss(target: string, amount: number): SpinResult {
  return {
    pocket: { number: 0, color: 'green' } as Pocket,
    bets: [{ kind: target as never, amount }],
    netPnl: -amount,
    bankrollAfter: 1000,
  };
}

function makeWin(target: string, amount: number): SpinResult {
  return {
    pocket: { number: 1, color: 'red' } as Pocket,
    bets: [{ kind: target as never, amount }],
    netPnl: amount,
    bankrollAfter: 1000,
  };
}

function makeCtx(history: SpinResult[], bankroll = 10_000): StrategyContext {
  return { bankroll, history, baseUnit: 5 };
}

// ---------------------------------------------------------------------------
// Shared simulate options
// ---------------------------------------------------------------------------

const BASE_OPTS = {
  strategy: dalembert({ target: 'red', baseUnit: 5 }),
  wheelType: 'european' as const,
  startingBankroll: 1000,
  baseUnit: 5,
  maxSpins: 200,
  seed: 42,
};

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('dalembert – determinism', () => {
  it('same seed produces identical results on two runs', () => {
    const r1 = simulate({ ...BASE_OPTS, strategy: dalembert({ target: 'red', baseUnit: 5 }) });
    const r2 = simulate({ ...BASE_OPTS, strategy: dalembert({ target: 'red', baseUnit: 5 }) });

    expect(r1.finalBankroll).toBe(r2.finalBankroll);
    expect(r1.spins.length).toBe(r2.spins.length);
    expect(r1.ruined).toBe(r2.ruined);
    expect(r1.maxDrawdown).toBe(r2.maxDrawdown);
    expect(r1.peakBankroll).toBe(r2.peakBankroll);
  });
});

// ---------------------------------------------------------------------------
// Bankroll invariants
// ---------------------------------------------------------------------------

describe('dalembert – bankroll invariants', () => {
  it('bankrollAfter never goes negative across all spins', () => {
    const r = simulate(BASE_OPTS);
    for (const spin of r.spins) {
      expect(spin.bankrollAfter).toBeGreaterThanOrEqual(0);
    }
    expect(r.finalBankroll).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Early stop when bankroll is too small
// ---------------------------------------------------------------------------

describe('dalembert – stops when bankroll is exhausted', () => {
  it('spins.length < maxSpins with tiny starting bankroll', () => {
    const r = simulate({
      strategy: dalembert({ target: 'red', baseUnit: 5 }),
      wheelType: 'european',
      startingBankroll: 5,
      baseUnit: 5,
      maxSpins: 500,
      seed: 3,
    });
    expect(r.spins.length).toBeLessThan(500);
  });

  it('finalBankroll >= 0 when ruined', () => {
    const seeds = [1, 2, 3, 4, 5, 10, 20, 99, 100];
    let ruinedOnce = false;
    for (const seed of seeds) {
      const r = simulate({
        strategy: dalembert({ target: 'black', baseUnit: 5 }),
        wheelType: 'european',
        startingBankroll: 5,
        baseUnit: 5,
        maxSpins: 100,
        seed,
      });
      expect(r.finalBankroll).toBeGreaterThanOrEqual(0);
      if (r.ruined) ruinedOnce = true;
    }
    expect(ruinedOnce).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D'Alembert-specific: stake progression via nextBets unit tests
// ---------------------------------------------------------------------------

describe('dalembert – nextBets stake progression', () => {
  const strat = dalembert({ target: 'red', baseUnit: 5 });

  it('starts at base (5) with no history', () => {
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(1);
    expect(bets[0].amount).toBe(5);
  });

  it('after 1 loss → stake = base + 1×unitStep = 10', () => {
    const history = [makeLoss('red', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(10);
  });

  it('after 2 losses → stake = base + 2×unitStep = 15', () => {
    const history = [makeLoss('red', 5), makeLoss('red', 10)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(15);
  });

  it('after N losses → stake = base + N×unitStep', () => {
    const losses: SpinResult[] = [];
    let currentStake = 5;
    for (let n = 1; n <= 5; n++) {
      losses.push(makeLoss('red', currentStake));
      currentStake += 5;
      const bets = strat.nextBets(makeCtx([...losses]));
      expect(bets[0].amount).toBe(5 + n * 5);
    }
  });

  it('after a win, stake decreases by unitStep', () => {
    // L, L → stake=15; then Win → stake=10
    const history = [makeLoss('red', 5), makeLoss('red', 10), makeWin('red', 15)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(10);
  });

  it('stake never goes below base, even after many wins', () => {
    const history = [
      makeWin('red', 5),
      makeWin('red', 5),
      makeWin('red', 5),
      makeWin('red', 5),
    ];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5); // clamped at base
  });

  it('stake never goes below base after win from base level', () => {
    // Starting at base, a win should keep us at base
    const history = [makeWin('red', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5);
  });

  it('custom unitStep works correctly', () => {
    const customStrat = dalembert({ target: 'red', baseUnit: 10, unitStep: 2 });
    const history = [makeLoss('red', 10), makeLoss('red', 12)];
    const bets = customStrat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(14); // 10 + 2 + 2
  });

  it('custom unitStep: win reduces by unitStep, not base', () => {
    const customStrat = dalembert({ target: 'red', baseUnit: 10, unitStep: 2 });
    // L → 12, L → 14, W → 12
    const history = [
      makeLoss('red', 10),
      makeLoss('red', 12),
      makeWin('red', 14),
    ];
    const bets = customStrat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(12);
  });

  it('returns [] when stake > bankroll', () => {
    // 10 losses from base=5, step=5 → stake = 5 + 10×5 = 55
    const history = Array.from({ length: 10 }, (_, i) =>
      makeLoss('red', 5 + i * 5),
    );
    const bets = strat.nextBets(makeCtx(history, 1)); // bankroll=1, stake=55
    expect(bets).toHaveLength(0);
  });
});
