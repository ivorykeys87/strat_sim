import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate';
import { martingale } from './martingale';
import type { StrategyContext, SpinResult } from '../strategy';
import type { Pocket } from '../wheel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoss(kind: string, amount: number, number?: number): SpinResult {
  return {
    pocket: { number: 0, color: 'green' } as Pocket,
    bets: [{ kind: kind as never, amount, ...(number !== undefined ? { number } : {}) }],
    netPnl: -amount,
    bankrollAfter: 1000,
  };
}

function makeWin(kind: string, amount: number, number?: number): SpinResult {
  return {
    pocket: { number: 1, color: 'red' } as Pocket,
    bets: [{ kind: kind as never, amount, ...(number !== undefined ? { number } : {}) }],
    netPnl: amount,
    bankrollAfter: 1000,
  };
}

function makeCtx(history: SpinResult[], bankroll = 10_000): StrategyContext {
  return { bankroll, history, baseUnit: 5 };
}

// ---------------------------------------------------------------------------
// Shared simulate options (even-money red target)
// ---------------------------------------------------------------------------

const BASE_OPTS = {
  strategy: martingale({ target: 'red', baseUnit: 5 }),
  wheelType: 'european' as const,
  startingBankroll: 1000,
  baseUnit: 5,
  maxSpins: 200,
  seed: 42,
};

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('martingale – determinism', () => {
  it('same seed produces identical results on two runs', () => {
    const r1 = simulate({ ...BASE_OPTS, strategy: martingale({ target: 'red', baseUnit: 5 }) });
    const r2 = simulate({ ...BASE_OPTS, strategy: martingale({ target: 'red', baseUnit: 5 }) });

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

describe('martingale – bankroll invariants', () => {
  it('bankrollAfter never goes negative', () => {
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
});

// ---------------------------------------------------------------------------
// Early stop
// ---------------------------------------------------------------------------

describe('martingale – stops when bankroll is exhausted', () => {
  it('spins.length < maxSpins with tiny starting bankroll', () => {
    const r = simulate({
      strategy: martingale({ target: 'red', baseUnit: 5 }),
      wheelType: 'european',
      startingBankroll: 5,
      baseUnit: 5,
      maxSpins: 500,
      seed: 3,
    });
    expect(r.spins.length).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Even-money target (red): stake progression
// ---------------------------------------------------------------------------

describe('martingale – even-money (red) stake progression', () => {
  const strat = martingale({ target: 'red', baseUnit: 5 });

  it('starts at base (5) with no history', () => {
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('red');
    expect(bets[0].amount).toBe(5);
  });

  it('doubles after a loss', () => {
    const history = [makeLoss('red', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(10);
  });

  it('doubles twice after two losses', () => {
    const history = [makeLoss('red', 5), makeLoss('red', 10)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(20);
  });

  it('resets to base after a win', () => {
    const history = [makeLoss('red', 5), makeLoss('red', 10), makeWin('red', 20)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5);
  });

  it('returns [] when stake > bankroll', () => {
    // 5 consecutive losses → next stake = 5×2^5 = 160
    const history = [
      makeLoss('red', 5),
      makeLoss('red', 10),
      makeLoss('red', 20),
      makeLoss('red', 40),
      makeLoss('red', 80),
    ];
    const bets = strat.nextBets(makeCtx(history, 100)); // bankroll < 160
    expect(bets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dozen target: stake progression and payout
// ---------------------------------------------------------------------------

describe('martingale – dozen1 target', () => {
  const strat = martingale({ target: 'dozen1', baseUnit: 5 });

  it('first bet is kind=dozen1, amount=5', () => {
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('dozen1');
    expect(bets[0].amount).toBe(5);
  });

  it('doubles after a loss', () => {
    const history = [makeLoss('dozen1', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(10);
  });

  it('resets after a win', () => {
    const history = [makeLoss('dozen1', 5), makeWin('dozen1', 10)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5);
  });

  it('dozen1 progression is independent of a concurrent red bet', () => {
    // History contains bets for BOTH red and dozen1 on each spin
    const mixedLoss: SpinResult = {
      pocket: { number: 0, color: 'green' } as Pocket,
      bets: [
        { kind: 'red', amount: 5 },
        { kind: 'dozen1', amount: 5 },
      ],
      netPnl: -10,
      bankrollAfter: 990,
    };
    const bets = strat.nextBets(makeCtx([mixedLoss]));
    // Martingale on dozen1: after 1 loss → 10
    expect(bets[0].kind).toBe('dozen1');
    expect(bets[0].amount).toBe(10);
  });

  it('payout on dozen win is 2×stake (simulate check)', () => {
    // Find a spin where dozen1 wins and verify netPnl = 2 × stake
    const r = simulate({
      strategy: martingale({ target: 'dozen1', baseUnit: 5 }),
      wheelType: 'european',
      startingBankroll: 1000,
      baseUnit: 5,
      maxSpins: 200,
      seed: 42,
    });
    const wins = r.spins.filter(
      (s) => s.bets.length === 1 && s.netPnl > 0,
    );
    expect(wins.length).toBeGreaterThan(0);
    for (const w of wins) {
      // payout multiplier for dozen = 2
      expect(w.netPnl).toBe(w.bets[0].amount * 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Straight target: stake progression, number field, payout
// ---------------------------------------------------------------------------

describe('martingale – straight target (number 17)', () => {
  const strat = martingale({ target: { kind: 'straight', number: 17 }, baseUnit: 5 });

  it('first bet is kind=straight, number=17, amount=5', () => {
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('straight');
    expect(bets[0].number).toBe(17);
    expect(bets[0].amount).toBe(5);
  });

  it('doubles after a loss on straight:17', () => {
    const history = [makeLoss('straight', 5, 17)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(10);
    expect(bets[0].number).toBe(17);
  });

  it('resets after a win on straight:17', () => {
    const history = [makeLoss('straight', 5, 17), makeWin('straight', 10, 17)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5);
  });

  it('straight:17 does NOT interfere with straight:5 progression', () => {
    // Strategy targets straight:17; history contains bets for straight:5 only
    const lossOn5: SpinResult = {
      pocket: { number: 0, color: 'green' } as Pocket,
      bets: [{ kind: 'straight', amount: 5, number: 5 }],
      netPnl: -5,
      bankrollAfter: 995,
    };
    const bets = strat.nextBets(makeCtx([lossOn5]));
    // No matching bet in history → reset to base
    expect(bets[0].amount).toBe(5);
    expect(bets[0].number).toBe(17);
  });

  it('payout on straight win is 35×stake', () => {
    const r = simulate({
      strategy: martingale({ target: { kind: 'straight', number: 7 }, baseUnit: 1 }),
      wheelType: 'european',
      startingBankroll: 5000,
      baseUnit: 1,
      maxSpins: 500,
      seed: 99,
    });
    const wins = r.spins.filter((s) => s.netPnl > 0);
    for (const w of wins) {
      expect(w.netPnl).toBe(w.bets[0].amount * 35);
    }
  });
});
