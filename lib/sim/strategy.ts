import type { Bet } from './bets';
import type { Pocket } from './wheel';

export interface SpinResult {
  pocket: Pocket;
  bets: Bet[];
  netPnl: number;
  bankrollAfter: number;
}

export interface StrategyContext {
  bankroll: number;
  history: SpinResult[];
  baseUnit: number;
}

export interface Strategy {
  name: string;
  nextBets(ctx: StrategyContext): Bet[];
}
