import type { ProgressionTarget } from '../bets';
import { progressionBet, betMatchesTarget } from '../bets';
import type { Strategy, StrategyContext } from '../strategy';

export function dalembert(opts: {
  target: ProgressionTarget;
  baseUnit?: number;
  unitStep?: number;
}): Strategy {
  const { target } = opts;

  const name =
    typeof target === 'string'
      ? `D'Alembert(${target})`
      : `D'Alembert(straight:${target.number})`;

  return {
    name,

    nextBets(ctx: StrategyContext) {
      const base = opts.baseUnit ?? ctx.baseUnit;
      const step = opts.unitStep ?? base;
      const { history, bankroll } = ctx;

      // Replay all history to derive current stake
      let stake = base;
      for (const spin of history) {
        const bet = spin.bets.find((b) => betMatchesTarget(b, target));
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

      return [progressionBet(target, stake)];
    },
  };
}
