import type { ProgressionTarget } from '../bets';
import { progressionBet } from '../bets';
import type { Strategy, StrategyContext } from '../strategy';

/**
 * Flat bet — places the same stake every spin, no progression.
 */
export function flat(opts: {
  target: ProgressionTarget;
  baseUnit?: number;
}): Strategy {
  const { target } = opts;

  const name =
    typeof target === 'string'
      ? `Flat(${target})`
      : `Flat(straight:${target.number})`;

  return {
    name,

    nextBets(ctx: StrategyContext) {
      const stake = opts.baseUnit ?? ctx.baseUnit;

      if (stake > ctx.bankroll) {
        return [];
      }

      return [progressionBet(target, stake)];
    },
  };
}
