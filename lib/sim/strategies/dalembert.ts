import type { BetKind } from '../bets';
import type { Strategy, StrategyContext } from '../strategy';

type EvenMoneyTarget = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';

export function dalembert(opts: {
  target: EvenMoneyTarget;
  baseUnit?: number;
  unitStep?: number;
}): Strategy {
  const { target } = opts;

  return {
    name: `D'Alembert(${target})`,

    nextBets(ctx: StrategyContext) {
      const base = opts.baseUnit ?? ctx.baseUnit;
      const step = opts.unitStep ?? base;
      const { history, bankroll } = ctx;

      // Replay all history to derive current stake
      let stake = base;
      for (const spin of history) {
        const bet = spin.bets.find((b) => b.kind === (target as BetKind));
        if (bet === undefined) continue;
        if (spin.netPnl < 0) {
          // Loss: increase stake by one unit step
          stake += step;
        } else {
          // Win: decrease stake by one unit step, never below base
          stake = Math.max(base, stake - step);
        }
      }

      // Can't cover the stake — signal stop
      if (stake > bankroll) {
        return [];
      }

      return [{ kind: target as BetKind, amount: stake }];
    },
  };
}
