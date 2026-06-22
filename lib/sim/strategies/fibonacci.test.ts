import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate';
import { fibonacci } from './fibonacci';
import type { StrategyContext, SpinResult } from '../strategy';
import type { Pocket } from '../wheel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SpinResult that looks like a loss on the given target. */
function makeLoss(target: string, amount: number): SpinResult {
  return {
    pocket: { number: 0, color: 'green' } as Pocket,
    bets: [{ kind: target as never, amount }],
    netPnl: -amount,
    bankrollAfter: 1000, // value doesn't matter for index replay
  };
}

/** Build a minimal SpinResult that looks like a win on the given target. */
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
  strategy: fibonacci({ target: 'red', baseUnit: 5 }),
  wheelType: 'european' as const,
  startingBankroll: 1000,
  baseUnit: 5,
  maxSpins: 200,
  seed: 42,
};

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('fibonacci – determinism', () => {
  it('same seed produces identical results on two runs', () => {
    const r1 = simulate({ ...BASE_OPTS, strategy: fibonacci({ target: 'red', baseUnit: 5 }) });
    const r2 = simulate({ ...BASE_OPTS, strategy: fibonacci({ target: 'red', baseUnit: 5 }) });

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

describe('fibonacci – bankroll invariants', () => {
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

describe('fibonacci – stops when bankroll is exhausted', () => {
  it('spins.length < maxSpins with tiny starting bankroll', () => {
    const r = simulate({
      strategy: fibonacci({ target: 'red', baseUnit: 5 }),
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
        strategy: fibonacci({ target: 'black', baseUnit: 5 }),
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
// Fibonacci-specific: index progression via nextBets unit tests
// ---------------------------------------------------------------------------

describe('fibonacci – nextBets stake progression', () => {
  const strat = fibonacci({ target: 'red', baseUnit: 5 });

  it('starts at fib[0] × base (= 1 × 5 = 5) with no history', () => {
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(1);
    expect(bets[0].amount).toBe(5); // fib[0] = 1
  });

  it('after one loss → index 1 → fib[1]=1 → stake=5', () => {
    const history = [makeLoss('red', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5); // fib[1] = 1
  });

  it('after two losses → index 2 → fib[2]=2 → stake=10', () => {
    const history = [makeLoss('red', 5), makeLoss('red', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(10); // fib[2] = 2
  });

  it('after three losses → index 3 → fib[3]=3 → stake=15', () => {
    const history = [
      makeLoss('red', 5),
      makeLoss('red', 5),
      makeLoss('red', 10),
    ];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(15); // fib[3] = 3
  });

  it('after four losses → index 4 → fib[4]=5 → stake=25', () => {
    const history = [
      makeLoss('red', 5),
      makeLoss('red', 5),
      makeLoss('red', 10),
      makeLoss('red', 15),
    ];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(25); // fib[4] = 5
  });

  it('win after two losses steps back two → index 0 → stake=5', () => {
    // L,L → index=2; then win → index=max(0,0)=0
    const history = [
      makeLoss('red', 5),
      makeLoss('red', 5),
      makeWin('red', 10),
    ];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5); // fib[0] = 1 → 5
  });

  it('win after three losses steps back two → index 1 → stake=5', () => {
    // L,L,L → index=3; win → index=1
    const history = [
      makeLoss('red', 5),
      makeLoss('red', 5),
      makeLoss('red', 10),
      makeWin('red', 15),
    ];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5); // fib[1] = 1 → 5
  });

  it('index never goes below 0 even with many wins', () => {
    const history = [makeWin('red', 5), makeWin('red', 5), makeWin('red', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5); // fib[0] = 1 → 5, clamped
  });

  it('returns [] when stake > bankroll', () => {
    // 10 consecutive losses → index=10, fib[10]=89, stake=89×5=445
    const history = Array.from({ length: 10 }, (_, i) =>
      makeLoss('red', 5 * [1, 1, 2, 3, 5, 8, 13, 21, 34, 55][i]),
    );
    const bets = strat.nextBets(makeCtx(history, 1)); // bankroll=1, stake would be 445
    expect(bets).toHaveLength(0);
  });
});
