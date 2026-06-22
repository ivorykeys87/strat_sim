import type { ProgressionTarget } from '../bets';
import { progressionBet, betMatchesTarget } from '../bets';
import type { Strategy, StrategyContext } from '../strategy';

export function martingale(opts: {
  target: ProgressionTarget;
  baseUnit?: number;
}): Strategy {
  const { target } = opts;

  const name =
    typeof target === 'string'
      ? `Martingale(${target})`
      : `Martingale(straight:${target.number})`;

  return {
    name,

    nextBets(ctx: StrategyContext) {
      const base = opts.baseUnit ?? ctx.baseUnit;
      const { history, bankroll } = ctx;

      let stake = base;

      if (history.length > 0) {
        const last = history[history.length - 1];
        // Find the bet on our specific target in the last spin
        const lastBet = last.bets.find((b) => betMatchesTarget(b, target));
        if (lastBet !== undefined && last.netPnl < 0) {
          // Lost last spin — double the previous stake
          stake = lastBet.amount * 2;
        }
        // If we won (or no matching bet found), reset to base
      }

      // Can't cover the stake — signal stop
      if (stake > bankroll) {
        return [];
      }

      return [progressionBet(target, stake)];
    },
  };
}
