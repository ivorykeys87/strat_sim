import type { ProgressionTarget } from '../bets';
import { progressionBet, betMatchesTarget } from '../bets';
import type { Strategy, StrategyContext } from '../strategy';

// Precomputed Fibonacci sequence — index 0 and 1 are both 1 so index maps
// directly to the sequence: fib[0]=1, fib[1]=1, fib[2]=2, fib[3]=3, ...
const FIB: number[] = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];

function fibAt(index: number): number {
  // Extend on demand beyond the precomputed table
  if (index < FIB.length) return FIB[index];
  let a = FIB[FIB.length - 2];
  let b = FIB[FIB.length - 1];
  for (let i = FIB.length; i <= index; i++) {
    const next = a + b;
    a = b;
    b = next;
  }
  return b;
}

export function fibonacci(opts: {
  target: ProgressionTarget;
  baseUnit?: number;
}): Strategy {
  const { target } = opts;

  const name =
    typeof target === 'string'
      ? `Fibonacci(${target})`
      : `Fibonacci(straight:${target.number})`;

  return {
    name,

    nextBets(ctx: StrategyContext) {
      const base = opts.baseUnit ?? ctx.baseUnit;
      const { history, bankroll } = ctx;

      // Replay all history to derive current Fibonacci index
      let index = 0;
      for (const spin of history) {
        const bet = spin.bets.find((b) => betMatchesTarget(b, target));
        if (bet === undefined) continue;
        if (spin.netPnl < 0) {
          // Loss: advance one step
          index += 1;
        } else {
          // Win: step back two (clamp at 0)
          index = Math.max(0, index - 2);
        }
      }

      const stake = base * fibAt(index);

      // Can't cover the stake — signal stop
      if (stake > bankroll) {
        return [];
      }

      return [progressionBet(target, stake)];
    },
  };
}
