import { describe, it, expect } from 'vitest';
import { resolveBet, payoutMultiplier } from './bets';
import type { Pocket } from './wheel';

// Pocket helpers
const red3: Pocket = { number: 3, color: 'red' };
const black4: Pocket = { number: 4, color: 'black' };
const green0: Pocket = { number: 0, color: 'green' };
const green00: Pocket = { number: 37, color: 'green', label: '00' };
const red5: Pocket = { number: 5, color: 'red' };    // odd, low, dozen1, column2
const black10: Pocket = { number: 10, color: 'black' }; // even, low, dozen1, column1
const red32: Pocket = { number: 32, color: 'red' };  // even, high, dozen3, column2
const black35: Pocket = { number: 35, color: 'black' }; // odd, high, dozen3, column2
const black36: Pocket = { number: 36, color: 'red' };   // even, high, dozen3, column3 (36 is red)

describe('payoutMultiplier', () => {
  it('straight = 35', () => expect(payoutMultiplier('straight')).toBe(35));
  it('red = 1',       () => expect(payoutMultiplier('red')).toBe(1));
  it('black = 1',     () => expect(payoutMultiplier('black')).toBe(1));
  it('even = 1',      () => expect(payoutMultiplier('even')).toBe(1));
  it('odd = 1',       () => expect(payoutMultiplier('odd')).toBe(1));
  it('low = 1',       () => expect(payoutMultiplier('low')).toBe(1));
  it('high = 1',      () => expect(payoutMultiplier('high')).toBe(1));
  it('dozen1 = 2',    () => expect(payoutMultiplier('dozen1')).toBe(2));
  it('dozen2 = 2',    () => expect(payoutMultiplier('dozen2')).toBe(2));
  it('dozen3 = 2',    () => expect(payoutMultiplier('dozen3')).toBe(2));
  it('column1 = 2',   () => expect(payoutMultiplier('column1')).toBe(2));
  it('column2 = 2',   () => expect(payoutMultiplier('column2')).toBe(2));
  it('column3 = 2',   () => expect(payoutMultiplier('column3')).toBe(2));
});

describe('resolveBet – straight', () => {
  it('straight win returns 35 × stake', () => {
    const result = resolveBet({ kind: 'straight', amount: 10, number: 3 }, red3);
    expect(result).toBe(350);
  });

  it('straight loss returns −stake', () => {
    const result = resolveBet({ kind: 'straight', amount: 10, number: 7 }, red3);
    expect(result).toBe(-10);
  });
});

describe('resolveBet – red / black', () => {
  it('red wins on a red pocket', () => {
    expect(resolveBet({ kind: 'red', amount: 5 }, red3)).toBe(5);
  });

  it('red loses on a black pocket', () => {
    expect(resolveBet({ kind: 'red', amount: 5 }, black4)).toBe(-5);
  });

  it('red loses on green 0', () => {
    expect(resolveBet({ kind: 'red', amount: 5 }, green0)).toBe(-5);
  });

  it('red loses on green 00', () => {
    expect(resolveBet({ kind: 'red', amount: 5 }, green00)).toBe(-5);
  });

  it('black wins on a black pocket', () => {
    expect(resolveBet({ kind: 'black', amount: 5 }, black4)).toBe(5);
  });

  it('black loses on green 0', () => {
    expect(resolveBet({ kind: 'black', amount: 5 }, green0)).toBe(-5);
  });
});

describe('resolveBet – even / odd', () => {
  it('even wins on even number', () => {
    expect(resolveBet({ kind: 'even', amount: 10 }, black4)).toBe(10);
  });

  it('even loses on odd number', () => {
    expect(resolveBet({ kind: 'even', amount: 10 }, red3)).toBe(-10);
  });

  it('even loses on 0 (green)', () => {
    expect(resolveBet({ kind: 'even', amount: 10 }, green0)).toBe(-10);
  });

  it('even loses on 00 (green)', () => {
    expect(resolveBet({ kind: 'even', amount: 10 }, green00)).toBe(-10);
  });

  it('odd wins on odd number', () => {
    expect(resolveBet({ kind: 'odd', amount: 10 }, red3)).toBe(10);
  });

  it('odd loses on 0', () => {
    expect(resolveBet({ kind: 'odd', amount: 10 }, green0)).toBe(-10);
  });
});

describe('resolveBet – low / high', () => {
  it('low wins on 5', () => {
    expect(resolveBet({ kind: 'low', amount: 10 }, red5)).toBe(10);
  });

  it('low loses on 19', () => {
    const p19: Pocket = { number: 19, color: 'red' };
    expect(resolveBet({ kind: 'low', amount: 10 }, p19)).toBe(-10);
  });

  it('high wins on 32', () => {
    expect(resolveBet({ kind: 'high', amount: 10 }, red32)).toBe(10);
  });

  it('high loses on 0', () => {
    expect(resolveBet({ kind: 'high', amount: 10 }, green0)).toBe(-10);
  });
});

describe('resolveBet – dozens', () => {
  it('dozen1 wins on 5 (1–12)', () => {
    expect(resolveBet({ kind: 'dozen1', amount: 10 }, red5)).toBe(20);
  });

  it('dozen1 wins on 10', () => {
    expect(resolveBet({ kind: 'dozen1', amount: 10 }, black10)).toBe(20);
  });

  it('dozen1 loses on 13', () => {
    const p13: Pocket = { number: 13, color: 'black' };
    expect(resolveBet({ kind: 'dozen1', amount: 10 }, p13)).toBe(-10);
  });

  it('dozen2 wins on 14', () => {
    const p14: Pocket = { number: 14, color: 'red' };
    expect(resolveBet({ kind: 'dozen2', amount: 10 }, p14)).toBe(20);
  });

  it('dozen3 wins on 35', () => {
    expect(resolveBet({ kind: 'dozen3', amount: 10 }, black35)).toBe(20);
  });

  it('dozen3 loses on 0', () => {
    expect(resolveBet({ kind: 'dozen3', amount: 10 }, green0)).toBe(-10);
  });
});

describe('resolveBet – columns', () => {
  it('column1 wins on 10 (10 % 3 === 1)', () => {
    expect(resolveBet({ kind: 'column1', amount: 10 }, black10)).toBe(20);
  });

  it('column1 loses on 11 (11 % 3 === 2)', () => {
    const p11: Pocket = { number: 11, color: 'black' };
    expect(resolveBet({ kind: 'column1', amount: 10 }, p11)).toBe(-10);
  });

  it('column2 wins on 5 (5 % 3 === 2)', () => {
    expect(resolveBet({ kind: 'column2', amount: 10 }, red5)).toBe(20);
  });

  it('column2 wins on 32 (32 % 3 === 2)', () => {
    expect(resolveBet({ kind: 'column2', amount: 10 }, red32)).toBe(20);
  });

  it('column3 wins on 36 (36 % 3 === 0)', () => {
    expect(resolveBet({ kind: 'column3', amount: 10 }, black36)).toBe(20);
  });

  it('column3 loses on 0', () => {
    expect(resolveBet({ kind: 'column3', amount: 10 }, green0)).toBe(-10);
  });
});
