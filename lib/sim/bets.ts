import type { Pocket } from './wheel';

export type BetKind =
  | 'straight'
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high'
  | 'dozen1'
  | 'dozen2'
  | 'dozen3'
  | 'column1'
  | 'column2'
  | 'column3';

export type Bet = {
  kind: BetKind;
  amount: number;
  /** Required when kind === 'straight' */
  number?: number;
};

/**
 * Returns the *profit* multiplier on a winning bet.
 * (A win pays back stake × multiplier as profit, plus the original stake.)
 */
export function payoutMultiplier(kind: BetKind): number {
  switch (kind) {
    case 'straight':
      return 35;
    case 'dozen1':
    case 'dozen2':
    case 'dozen3':
    case 'column1':
    case 'column2':
    case 'column3':
      return 2;
    case 'red':
    case 'black':
    case 'even':
    case 'odd':
    case 'low':
    case 'high':
      return 1;
  }
}

/**
 * Returns the net P&L for a single bet on a pocket outcome.
 * Green (0 / 00) loses all outside bets.
 */
export function resolveBet(bet: Bet, pocket: Pocket): number {
  const { kind, amount, number } = bet;
  const n = pocket.number;
  const color = pocket.color;

  // Helper: did we win?
  let win = false;

  switch (kind) {
    case 'straight':
      win = n === number;
      break;

    case 'red':
      win = color === 'red';
      break;

    case 'black':
      win = color === 'black';
      break;

    case 'even':
      // 0 and 00 are neither even nor odd for betting purposes
      win = n !== 0 && n !== 37 && n % 2 === 0;
      break;

    case 'odd':
      win = n !== 0 && n !== 37 && n % 2 !== 0;
      break;

    case 'low':
      // 1–18
      win = n >= 1 && n <= 18;
      break;

    case 'high':
      // 19–36
      win = n >= 19 && n <= 36;
      break;

    case 'dozen1':
      win = n >= 1 && n <= 12;
      break;

    case 'dozen2':
      win = n >= 13 && n <= 24;
      break;

    case 'dozen3':
      win = n >= 25 && n <= 36;
      break;

    case 'column1':
      // Numbers 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
      win = n >= 1 && n <= 36 && n % 3 === 1;
      break;

    case 'column2':
      // Numbers 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
      win = n >= 1 && n <= 36 && n % 3 === 2;
      break;

    case 'column3':
      // Numbers 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
      win = n >= 1 && n <= 36 && n % 3 === 0;
      break;
  }

  return win ? amount * payoutMultiplier(kind) : -amount;
}
