import type { Strategy, StrategyContext } from '../strategy';

/**
 * Combines multiple strategies into one: each inner strategy places its own
 * bets every spin, in parallel.
 *
 * - If an inner strategy returns `[]` (cannot cover stake), that strategy is
 *   skipped for this spin but others continue.
 * - Only returns `[]` (signalling full stop) when ALL inner strategies return `[]`.
 */
export function composite(strategies: Strategy[]): Strategy {
  const name = strategies.map((s) => s.name).join(' + ');

  return {
    name,

    nextBets(ctx: StrategyContext) {
      const allBets = strategies.flatMap((s) => s.nextBets(ctx));
      return allBets;
    },
  };
}
