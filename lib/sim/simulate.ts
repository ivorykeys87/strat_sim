import { mulberry32 } from './rng';
import { buildWheel, spin } from './wheel';
import type { WheelType } from './wheel';
import { resolveBet } from './bets';
import type { Strategy, SpinResult } from './strategy';

export interface SimulateOptions {
  strategy: Strategy;
  wheelType: WheelType;
  startingBankroll: number;
  baseUnit: number;
  maxSpins: number;
  seed: number;
}

export interface SimulateResult {
  spins: SpinResult[];
  finalBankroll: number;
  ruined: boolean;
  maxDrawdown: number;
  peakBankroll: number;
}

export function simulate(opts: SimulateOptions): SimulateResult {
  const { strategy, wheelType, startingBankroll, baseUnit, maxSpins, seed } = opts;

  const rng = mulberry32(seed);
  const wheel = buildWheel(wheelType);
  const spins: SpinResult[] = [];

  let bankroll = startingBankroll;
  let peakBankroll = startingBankroll;
  let maxDrawdown = 0;
  let ruined = false;

  for (let i = 0; i < maxSpins; i++) {
    // Ask the strategy what to bet
    const bets = strategy.nextBets({ bankroll, history: spins, baseUnit });

    // Strategy signals stop (can't cover stake or deliberate exit)
    if (bets.length === 0) {
      ruined = bankroll <= 0;
      break;
    }

    // Spin the wheel
    const pocket = spin(rng, wheel);

    // Resolve all bets and sum P&L
    let netPnl = 0;
    const blockPnlsAcc: Record<string, number> = {};
    for (const bet of bets) {
      const pnl = resolveBet(bet, pocket);
      netPnl += pnl;
      if (bet.blockId !== undefined) {
        blockPnlsAcc[bet.blockId] = (blockPnlsAcc[bet.blockId] ?? 0) + pnl;
      }
    }

    bankroll += netPnl;

    const hasBlockPnls = Object.keys(blockPnlsAcc).length > 0;
    const result: SpinResult = {
      pocket,
      bets,
      netPnl,
      bankrollAfter: bankroll,
      ...(hasBlockPnls ? { blockPnls: blockPnlsAcc } : {}),
    };
    spins.push(result);

    // Update peak and drawdown
    if (bankroll > peakBankroll) {
      peakBankroll = bankroll;
    }
    const drawdown = peakBankroll - bankroll;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    // Bankroll exhausted
    if (bankroll <= 0) {
      ruined = true;
      break;
    }
  }

  return {
    spins,
    finalBankroll: bankroll,
    ruined,
    maxDrawdown,
    peakBankroll,
  };
}
