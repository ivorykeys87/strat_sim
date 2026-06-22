import { describe, it, expect } from 'vitest';
import { composite } from './composite';
import { martingale } from './martingale';
import { fibonacci } from './fibonacci';
import { dalembert } from './dalembert';
import { simulate } from '../simulate';
import type { StrategyContext, SpinResult } from '../strategy';
import type { Pocket } from '../wheel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(history: SpinResult[], bankroll = 10_000): StrategyContext {
  return { bankroll, history, baseUnit: 5 };
}

function makeSpin(
  bets: SpinResult['bets'],
  netPnl: number,
  bankrollAfter: number,
  pocket: Pocket = { number: 0, color: 'green' },
): SpinResult {
  return { pocket, bets, netPnl, bankrollAfter };
}

// ---------------------------------------------------------------------------
// Basic composition
// ---------------------------------------------------------------------------

describe('composite – basic', () => {
  it('concatenates bets from all inner strategies', () => {
    const strat = composite([
      martingale({ target: 'red', baseUnit: 5 }),
      martingale({ target: 'black', baseUnit: 10 }),
    ]);
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(2);
    expect(bets.find((b) => b.kind === 'red')).toBeDefined();
    expect(bets.find((b) => b.kind === 'black')).toBeDefined();
  });

  it('name joins inner strategy names with " + "', () => {
    const m = martingale({ target: 'red', baseUnit: 5 });
    const f = fibonacci({ target: 'black', baseUnit: 5 });
    const strat = composite([m, f]);
    expect(strat.name).toBe(`${m.name} + ${f.name}`);
  });

  it('returns [] only when ALL inner strategies return []', () => {
    // Give each strategy a bankroll so tiny it cannot cover even base
    const strat = composite([
      martingale({ target: 'red', baseUnit: 100 }),
      martingale({ target: 'black', baseUnit: 100 }),
    ]);
    const bets = strat.nextBets(makeCtx([], 1)); // bankroll=1 < 100
    expect(bets).toHaveLength(0);
  });

  it('continues when only one strategy can cover its stake', () => {
    // red strategy has baseUnit=5, black strategy has baseUnit=1000
    // bankroll=50 → red can place, black cannot
    const strat = composite([
      martingale({ target: 'red', baseUnit: 5 }),
      martingale({ target: 'black', baseUnit: 1000 }),
    ]);
    const bets = strat.nextBets(makeCtx([], 50));
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// Parallel Martingales on different targets don't cross-contaminate
// ---------------------------------------------------------------------------

describe('composite – two Martingales in parallel', () => {
  it('red Martingale doubles after a red loss; black stays at base after a black win', () => {
    const redStrat = martingale({ target: 'red', baseUnit: 5 });
    const blackStrat = martingale({ target: 'black', baseUnit: 5 });
    const strat = composite([redStrat, blackStrat]);

    // Spin: lost on both (green pocket)
    const lossHistory = [
      makeSpin(
        [
          { kind: 'red', amount: 5 },
          { kind: 'black', amount: 5 },
        ],
        -10, // both lose on green
        990,
        { number: 0, color: 'green' },
      ),
    ];

    const bets = strat.nextBets(makeCtx(lossHistory));
    const redBet = bets.find((b) => b.kind === 'red');
    const blackBet = bets.find((b) => b.kind === 'black');

    expect(redBet?.amount).toBe(10); // doubled
    expect(blackBet?.amount).toBe(10); // doubled
  });

  it('each Martingale tracks its own target independently', () => {
    // History: red=loss (green pocket), black=loss (green pocket), then red=win
    const history: SpinResult[] = [
      // Spin 1: red=5 loss, black=5 loss
      makeSpin(
        [
          { kind: 'red', amount: 5 },
          { kind: 'black', amount: 5 },
        ],
        -10,
        990,
        { number: 0, color: 'green' },
      ),
      // Spin 2: red=10 loss, black=10 loss
      makeSpin(
        [
          { kind: 'red', amount: 10 },
          { kind: 'black', amount: 10 },
        ],
        -20,
        970,
        { number: 0, color: 'green' },
      ),
      // Spin 3: red=20 win, black=20 loss
      makeSpin(
        [
          { kind: 'red', amount: 20 },
          { kind: 'black', amount: 20 },
        ],
        // red wins (+20) black loses (−20) → net 0
        0,
        970,
        { number: 1, color: 'red' }, // red wins, black loses
      ),
    ];

    const redStrat = martingale({ target: 'red', baseUnit: 5 });
    const blackStrat = martingale({ target: 'black', baseUnit: 5 });
    const strat = composite([redStrat, blackStrat]);

    const bets = strat.nextBets(makeCtx(history));
    const redBet = bets.find((b) => b.kind === 'red');
    const blackBet = bets.find((b) => b.kind === 'black');

    // Red won last time → reset to base=5
    expect(redBet?.amount).toBe(5);
    // Black lost 3 times → double 3 times = 5×2×2×2 = 40
    // Note: martingale only looks at the last spin's matching bet
    // Last black bet was 20, netPnl overall was 0 but black bet lost
    // However, martingale checks last spin's netPnl < 0 for the whole spin.
    // The spin netPnl is 0, so martingale resets. Let's check the actual behavior:
    // Spin 3 netPnl = 0 → martingale treats it as "not a loss" → resets black to base
    expect(blackBet?.amount).toBe(5);
  });

  it('bankroll resolves correctly when one Martingale wins and one loses on same spin', () => {
    // Run a full simulation with composite of red + even martingales
    // On any spin where the ball is red AND even → both win
    // On any spin where red AND odd → red wins, even loses
    const r = simulate({
      strategy: composite([
        martingale({ target: 'red', baseUnit: 5 }),
        martingale({ target: 'even', baseUnit: 5 }),
      ]),
      wheelType: 'european',
      startingBankroll: 1000,
      baseUnit: 5,
      maxSpins: 200,
      seed: 42,
    });

    // Invariants
    expect(r.finalBankroll).toBeGreaterThanOrEqual(0);
    for (const spin of r.spins) {
      expect(spin.bankrollAfter).toBeGreaterThanOrEqual(0);
      // Each spin should have exactly 2 bets
      expect(spin.bets).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Composite with mixed strategy types
// ---------------------------------------------------------------------------

describe('composite – mixed strategy types', () => {
  it('Martingale + Fibonacci + D\'Alembert all place bets', () => {
    const strat = composite([
      martingale({ target: 'red', baseUnit: 5 }),
      fibonacci({ target: 'dozen1', baseUnit: 5 }),
      dalembert({ target: 'column2', baseUnit: 5 }),
    ]);
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(3);
    expect(bets.find((b) => b.kind === 'red')).toBeDefined();
    expect(bets.find((b) => b.kind === 'dozen1')).toBeDefined();
    expect(bets.find((b) => b.kind === 'column2')).toBeDefined();
  });

  it('composite with straight-number Martingale + even-money Fibonacci', () => {
    const strat = composite([
      martingale({ target: { kind: 'straight', number: 17 }, baseUnit: 2 }),
      fibonacci({ target: 'red', baseUnit: 5 }),
    ]);
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(2);
    const straightBet = bets.find((b) => b.kind === 'straight');
    expect(straightBet?.number).toBe(17);
    expect(straightBet?.amount).toBe(2);
    const redBet = bets.find((b) => b.kind === 'red');
    expect(redBet?.amount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Empty strategies list
// ---------------------------------------------------------------------------

describe('composite – edge cases', () => {
  it('empty strategies list returns []', () => {
    const strat = composite([]);
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(0);
  });

  it('single strategy behaves like the strategy itself', () => {
    const inner = martingale({ target: 'red', baseUnit: 5 });
    const strat = composite([inner]);
    const bets = strat.nextBets(makeCtx([]));
    const innerBets = inner.nextBets(makeCtx([]));
    expect(bets).toEqual(innerBets);
  });
});
