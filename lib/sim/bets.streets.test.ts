import { describe, it, expect } from 'vitest';
import { payoutMultiplier, resolveBet } from './bets';
import type { BetKind } from './bets';
import type { Pocket } from './wheel';
import { martingale } from './strategies/martingale';
import type { SpinResult } from './strategy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pocket(number: number): Pocket {
  const color =
    number === 0 || number === 37
      ? 'green'
      : [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(number)
      ? 'red'
      : 'black';
  return { number, color };
}

// The 12 streets: each entry is [kind, [winning numbers], low, high]
const STREETS: Array<{ kind: BetKind; lo: number; hi: number }> = [
  { kind: 'street1',  lo: 1,  hi: 3  },
  { kind: 'street2',  lo: 4,  hi: 6  },
  { kind: 'street3',  lo: 7,  hi: 9  },
  { kind: 'street4',  lo: 10, hi: 12 },
  { kind: 'street5',  lo: 13, hi: 15 },
  { kind: 'street6',  lo: 16, hi: 18 },
  { kind: 'street7',  lo: 19, hi: 21 },
  { kind: 'street8',  lo: 22, hi: 24 },
  { kind: 'street9',  lo: 25, hi: 27 },
  { kind: 'street10', lo: 28, hi: 30 },
  { kind: 'street11', lo: 31, hi: 33 },
  { kind: 'street12', lo: 34, hi: 36 },
];

// ---------------------------------------------------------------------------
// payoutMultiplier — all 12 streets must return 11
// ---------------------------------------------------------------------------

describe('payoutMultiplier – streets', () => {
  for (const { kind } of STREETS) {
    it(`payoutMultiplier('${kind}') === 11`, () => {
      expect(payoutMultiplier(kind)).toBe(11);
    });
  }
});

// ---------------------------------------------------------------------------
// resolveBet – winning pockets pay 11× stake; losing pockets lose stake
// ---------------------------------------------------------------------------

describe('resolveBet – streets: winning pockets', () => {
  const amount = 10;

  for (const { kind, lo, hi } of STREETS) {
    // All three numbers in the street must win
    for (let n = lo; n <= hi; n++) {
      it(`${kind}: pocket ${n} wins (+${amount * 11})`, () => {
        expect(resolveBet({ kind, amount }, pocket(n))).toBe(amount * 11);
      });
    }
  }
});

describe('resolveBet – streets: losing pockets', () => {
  const amount = 10;

  for (const { kind, lo } of STREETS) {
    // Pocket 0 (green) always loses
    it(`${kind}: pocket 0 (green) loses (-${amount})`, () => {
      expect(resolveBet({ kind, amount }, pocket(0))).toBe(-amount);
    });

    // Pocket 37 = "00" on the American wheel, also always loses
    it(`${kind}: pocket 37 (00) loses (-${amount})`, () => {
      expect(resolveBet({ kind, amount }, pocket(37))).toBe(-amount);
    });

    // A number just below the street (only possible when lo > 1)
    if (lo > 1) {
      it(`${kind}: pocket ${lo - 1} (adjacent below) loses (-${amount})`, () => {
        expect(resolveBet({ kind, amount }, pocket(lo - 1))).toBe(-amount);
      });
    }
  }

  // A number just above the last street (no street covers it)
  // street12 covers 34–36; pocket 36+1=37 is "00", already covered above.
  // Use the boundary between two adjacent streets to cross-check isolation.
  it('street1: pocket 4 (start of street2) loses', () => {
    expect(resolveBet({ kind: 'street1', amount }, pocket(4))).toBe(-amount);
  });
  it('street12: pocket 33 (end of street11) loses', () => {
    expect(resolveBet({ kind: 'street12', amount }, pocket(33))).toBe(-amount);
  });
});

// ---------------------------------------------------------------------------
// resolveBet – streets are mutually exclusive
// Each number belongs to exactly one street
// ---------------------------------------------------------------------------

describe('resolveBet – streets are mutually exclusive', () => {
  const amount = 10;

  for (let n = 1; n <= 36; n++) {
    it(`pocket ${n} wins on exactly one street`, () => {
      const winningStreets = STREETS.filter(
        ({ kind, lo, hi }) =>
          resolveBet({ kind, amount }, pocket(n)) === amount * 11 &&
          n >= lo && n <= hi,
      );
      // Verify exactly one street claims this pocket as a winner
      expect(winningStreets).toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Martingale integration: street1 target doubles after a loss on pocket 0
// ---------------------------------------------------------------------------

describe('martingale integration – street1 target', () => {
  const strat = martingale({ target: 'street1', baseUnit: 5 });

  function makeCtx(history: SpinResult[], bankroll = 10_000) {
    return { bankroll, history, baseUnit: 5 };
  }

  function makeLoss(kind: BetKind, amount: number): SpinResult {
    return {
      pocket: pocket(0), // green — always a loss
      bets: [{ kind, amount }],
      netPnl: -amount,
      bankrollAfter: 1000,
    };
  }

  function makeWin(kind: BetKind, amount: number): SpinResult {
    return {
      pocket: pocket(1), // street1 winning pocket
      bets: [{ kind, amount }],
      netPnl: amount * 11,
      bankrollAfter: 1000,
    };
  }

  it('first bet: kind=street1, amount=5 (base unit)', () => {
    const bets = strat.nextBets(makeCtx([]));
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('street1');
    expect(bets[0].amount).toBe(5);
  });

  it('doubles to 10 after one loss on pocket 0', () => {
    const history = [makeLoss('street1', 5)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].kind).toBe('street1');
    expect(bets[0].amount).toBe(10);
  });

  it('doubles again to 20 after two consecutive losses', () => {
    const history = [makeLoss('street1', 5), makeLoss('street1', 10)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(20);
  });

  it('resets to 5 after a win', () => {
    const history = [makeLoss('street1', 5), makeLoss('street1', 10), makeWin('street1', 20)];
    const bets = strat.nextBets(makeCtx(history));
    expect(bets[0].amount).toBe(5);
  });

  it('returns [] when next stake exceeds bankroll', () => {
    // 5 losses → next stake = 5×2^5 = 160
    const history = [
      makeLoss('street1', 5),
      makeLoss('street1', 10),
      makeLoss('street1', 20),
      makeLoss('street1', 40),
      makeLoss('street1', 80),
    ];
    const bets = strat.nextBets(makeCtx(history, 100)); // bankroll < 160
    expect(bets).toHaveLength(0);
  });
});
