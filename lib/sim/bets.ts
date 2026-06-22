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
  | 'column3'
  | 'street1'
  | 'street2'
  | 'street3'
  | 'street4'
  | 'street5'
  | 'street6'
  | 'street7'
  | 'street8'
  | 'street9'
  | 'street10'
  | 'street11'
  | 'street12';

export type Bet = {
  kind: BetKind;
  amount: number;
  /** Required when kind === 'straight' */
  number?: number;
};

/**
 * A target for a progression strategy.  Non-straight targets are just the
 * BetKind string; straight targets carry the pocket number so that multiple
 * straight-bet progressions can coexist without cross-contaminating each other.
 */
export type ProgressionTarget =
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
  | 'column3'
  | 'street1'
  | 'street2'
  | 'street3'
  | 'street4'
  | 'street5'
  | 'street6'
  | 'street7'
  | 'street8'
  | 'street9'
  | 'street10'
  | 'street11'
  | 'street12'
  | { kind: 'straight'; number: number };

/** Normalised kind string extracted from a ProgressionTarget. */
export function progressionKind(target: ProgressionTarget): BetKind {
  return typeof target === 'string' ? target : target.kind;
}

/** Build the Bet object for a progression target at a given amount. */
export function progressionBet(target: ProgressionTarget, amount: number): Bet {
  if (typeof target === 'string') {
    return { kind: target, amount };
  }
  return { kind: 'straight', amount, number: target.number };
}

/**
 * Returns true when a historical Bet matches the given ProgressionTarget.
 * Used to avoid cross-contaminating multiple parallel progressions.
 */
export function betMatchesTarget(bet: Bet, target: ProgressionTarget): boolean {
  if (typeof target === 'string') {
    return bet.kind === target;
  }
  return bet.kind === 'straight' && bet.number === target.number;
}

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
    case 'street1':
    case 'street2':
    case 'street3':
    case 'street4':
    case 'street5':
    case 'street6':
    case 'street7':
    case 'street8':
    case 'street9':
    case 'street10':
    case 'street11':
    case 'street12':
      return 11;
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
