import type { BetKind } from '../bets';
import type { Strategy, StrategyContext } from '../strategy';

type EvenMoneyTarget = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';

export function martingale(opts: {
  target: EvenMoneyTarget;
  baseUnit?: number;
}): Strategy {
  const { target } = opts;

  return {
    name: `Martingale(${target})`,

    nextBets(ctx: StrategyContext) {
      const base = opts.baseUnit ?? ctx.baseUnit;
      const { history, bankroll } = ctx;

      let stake = base;

      if (history.length > 0) {
        const last = history[history.length - 1];
        // Find the bet on our target in the last spin
        const lastBet = last.bets.find((b) => b.kind === (target as BetKind));
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

      return [{ kind: target as BetKind, amount: stake }];
    },
  };
}
