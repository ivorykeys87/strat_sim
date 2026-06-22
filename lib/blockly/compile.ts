/**
 * compileWorkspace(json): Strategy
 *
 * Pure function — no eval/Function.  Walks Blockly's JSON serialisation and
 * produces a Strategy whose nextBets(ctx) interprets the tree at call-time.
 *
 * Blockly serialises a workspace as:
 * {
 *   "blocks": {
 *     "languageVersion": 0,
 *     "blocks": [ ...top-level block objects ]
 *   }
 * }
 *
 * Each block object looks like:
 * {
 *   "type": "strategy_root",
 *   "id": "...",
 *   "inputs": {
 *     "DO": { "block": { ...first statement block } }
 *   },
 *   "next": { "block": { ...next statement block } }   // for statement chains
 * }
 */

import type { Bet, BetKind } from '../sim/bets';
import type { Strategy, StrategyContext, SpinResult } from '../sim/strategy';

// ---------------------------------------------------------------------------
// Blockly JSON shape (minimal subset we care about)
// ---------------------------------------------------------------------------

interface BlockInput {
  block?: BlockNode;
  shadow?: BlockNode;
}

interface BlockNode {
  type: string;
  id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, BlockInput>;
  next?: { block: BlockNode };
}

interface WorkspaceJson {
  blocks?: {
    languageVersion?: number;
    blocks?: BlockNode[];
  };
}

// ---------------------------------------------------------------------------
// Default workspace: Martingale-on-red equivalent
// ---------------------------------------------------------------------------

export const DEFAULT_BLOCKLY_WORKSPACE: WorkspaceJson = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'strategy_root',
        id: 'root',
        inputs: {
          DO: {
            block: {
              type: 'control_if_then_else',
              id: 'if1',
              inputs: {
                CONDITION: {
                  block: {
                    type: 'condition_loss_streak',
                    id: 'cond1',
                    fields: { KIND: 'red', N: 1 },
                  },
                },
                DO: {
                  block: {
                    type: 'place_bet',
                    id: 'bet_double',
                    fields: { KIND: 'red', NUMBER: 0 },
                    inputs: {
                      AMOUNT: {
                        block: {
                          type: 'amount_last_stake_times',
                          id: 'amt1',
                          fields: { KIND: 'red', FACTOR: 2 },
                        },
                      },
                    },
                  },
                },
                ELSE: {
                  block: {
                    type: 'place_bet',
                    id: 'bet_base',
                    fields: { KIND: 'red', NUMBER: 0 },
                    inputs: {
                      AMOUNT: {
                        block: {
                          type: 'amount_base_unit',
                          id: 'amt2',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Runtime helpers that operate on ctx.history
// ---------------------------------------------------------------------------

/** Returns the last spin, or undefined if history is empty. */
function lastSpin(history: SpinResult[]): SpinResult | undefined {
  return history.length > 0 ? history[history.length - 1] : undefined;
}

/**
 * Returns the last stake placed on the given BetKind (and optionally number),
 * searching backwards through history.  Falls back to baseUnit.
 */
function lastStakeFor(
  history: SpinResult[],
  kind: BetKind,
  baseUnit: number,
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const bet = history[i].bets.find((b) => b.kind === kind);
    if (bet !== undefined) return bet.amount;
  }
  return baseUnit;
}

/**
 * Returns the number of consecutive spins (counting back from the most
 * recent) where a bet of the given kind was placed AND lost.
 */
function lossStreakFor(history: SpinResult[], kind: BetKind): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const spin = history[i];
    const bet = spin.bets.find((b) => b.kind === kind);
    if (bet === undefined) break; // no bet on this kind — streak ends
    // A bet loses when resolveBet returns negative, i.e. netPnl was driven by a loss.
    // We approximate by checking if the spin's overall netPnl was < 0 for simple single-bet cases.
    // For multi-bet spins we check whether this specific bet won:
    // We don't have per-bet pnl in SpinResult, so we use the pocket to determine the win.
    // However, we don't want to re-import resolveBet here (circular in tests), so instead
    // we track: if the entire spin's netPnl < 0, count as loss for the purpose of the streak.
    // This is the same heuristic used by the Martingale strategy itself.
    if (spin.netPnl < 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Returns true if the last spin had a winning bet on the given kind. */
function lastWonOn(history: SpinResult[], kind: BetKind): boolean {
  const last = lastSpin(history);
  if (!last) return false;
  const bet = last.bets.find((b) => b.kind === kind);
  return bet !== undefined && last.netPnl > 0;
}

/**
 * Returns the total P&L for the named bet block on the last spin,
 * or undefined if no such block was tracked on that spin.
 */
function blockPnlOnLastSpin(history: SpinResult[], name: string): number | undefined {
  return lastSpin(history)?.blockPnls?.[name];
}

/**
 * Returns the number of consecutive spins (counting back from the most recent)
 * where the named bet block was present AND had a negative P&L.
 * Stops at the first spin where the block is absent OR its P&L is >= 0.
 */
function blockLossStreak(history: SpinResult[], name: string): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const pnl = history[i].blockPnls?.[name];
    if (pnl === undefined || pnl >= 0) break;
    streak++;
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------------------

interface EvalCtx {
  history: SpinResult[];
  bankroll: number;
  baseUnit: number;
  bets: Bet[];
}

function evalAmount(node: BlockNode | undefined, ctx: EvalCtx): number {
  if (!node) return ctx.baseUnit;
  switch (node.type) {
    case 'amount_base_unit':
      return ctx.baseUnit;

    case 'amount_constant': {
      const val = node.fields?.['VALUE'];
      return typeof val === 'number' ? val : Number(val ?? ctx.baseUnit);
    }

    case 'amount_last_stake_times': {
      const kind = (node.fields?.['KIND'] as BetKind | undefined) ?? 'red';
      const factor = typeof node.fields?.['FACTOR'] === 'number'
        ? (node.fields['FACTOR'] as number)
        : Number(node.fields?.['FACTOR'] ?? 2);
      return lastStakeFor(ctx.history, kind, ctx.baseUnit) * factor;
    }

    case 'amount_math': {
      const left = evalAmount(node.inputs?.['LEFT']?.block, ctx);
      const right = evalAmount(node.inputs?.['RIGHT']?.block, ctx);
      const op = node.fields?.['OP'] as string | undefined;
      switch (op) {
        case 'ADD': return left + right;
        case 'SUB': return left - right;
        case 'MUL': return left * right;
        case 'DIV': return right !== 0 ? left / right : 0;
        default: return left;
      }
    }

    default:
      return ctx.baseUnit;
  }
}

function evalCondition(node: BlockNode | undefined, ctx: EvalCtx): boolean {
  if (!node) return false;
  switch (node.type) {
    case 'condition_last_color': {
      const color = node.fields?.['COLOR'] as string | undefined;
      const last = lastSpin(ctx.history);
      return last !== undefined && last.pocket.color === color;
    }

    case 'condition_last_number': {
      const num = typeof node.fields?.['NUMBER'] === 'number'
        ? (node.fields['NUMBER'] as number)
        : Number(node.fields?.['NUMBER'] ?? 0);
      const last = lastSpin(ctx.history);
      return last !== undefined && last.pocket.number === num;
    }

    case 'condition_last_won_on': {
      const kind = (node.fields?.['KIND'] as BetKind | undefined) ?? 'red';
      return lastWonOn(ctx.history, kind);
    }

    case 'condition_loss_streak': {
      const kind = (node.fields?.['KIND'] as BetKind | undefined) ?? 'red';
      const n = typeof node.fields?.['N'] === 'number'
        ? (node.fields['N'] as number)
        : Number(node.fields?.['N'] ?? 1);
      return lossStreakFor(ctx.history, kind) >= n;
    }

    case 'condition_history_length': {
      const n = typeof node.fields?.['N'] === 'number'
        ? (node.fields['N'] as number)
        : Number(node.fields?.['N'] ?? 1);
      return ctx.history.length >= n;
    }

    case 'control_compare': {
      const left = evalAmount(node.inputs?.['LEFT']?.block, ctx);
      const right = evalAmount(node.inputs?.['RIGHT']?.block, ctx);
      const op = node.fields?.['OP'] as string | undefined;
      switch (op) {
        case 'EQ':  return left === right;
        case 'NEQ': return left !== right;
        case 'LT':  return left < right;
        case 'LTE': return left <= right;
        case 'GT':  return left > right;
        case 'GTE': return left >= right;
        default: return false;
      }
    }

    case 'control_and': {
      return (
        evalCondition(node.inputs?.['LEFT']?.block, ctx) &&
        evalCondition(node.inputs?.['RIGHT']?.block, ctx)
      );
    }

    case 'control_or': {
      return (
        evalCondition(node.inputs?.['LEFT']?.block, ctx) ||
        evalCondition(node.inputs?.['RIGHT']?.block, ctx)
      );
    }

    case 'control_not': {
      return !evalCondition(node.inputs?.['CONDITION']?.block, ctx);
    }

    default:
      return false;
  }
}

/**
 * Walks a statement chain (place_bet / if blocks linked via .next).
 * Pushes resulting bets onto ctx.bets.
 */
function execStatements(node: BlockNode | undefined, ctx: EvalCtx): void {
  let current: BlockNode | undefined = node;
  while (current) {
    execStatement(current, ctx);
    current = current.next?.block;
  }
}

function execStatement(node: BlockNode, ctx: EvalCtx): void {
  switch (node.type) {
    case 'place_bet': {
      const kind = (node.fields?.['KIND'] as BetKind | undefined) ?? 'red';
      const amount = evalAmount(node.inputs?.['AMOUNT']?.block, ctx);
      const bet: Bet = { kind, amount };
      if (kind === 'straight') {
        const num = typeof node.fields?.['NUMBER'] === 'number'
          ? (node.fields['NUMBER'] as number)
          : Number(node.fields?.['NUMBER'] ?? 0);
        bet.number = num;
      }
      ctx.bets.push(bet);
      break;
    }

    case 'control_if_then': {
      const cond = evalCondition(node.inputs?.['CONDITION']?.block, ctx);
      if (cond) {
        execStatements(node.inputs?.['DO']?.block, ctx);
      }
      break;
    }

    case 'control_if_then_else': {
      const cond = evalCondition(node.inputs?.['CONDITION']?.block, ctx);
      if (cond) {
        execStatements(node.inputs?.['DO']?.block, ctx);
      } else {
        execStatements(node.inputs?.['ELSE']?.block, ctx);
      }
      break;
    }

    default:
      // Unknown statement node — skip
      break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compiles a Blockly workspace JSON into a Strategy.
 *
 * @param json - The workspace state as returned by `Blockly.serialization.workspaces.save(workspace)`.
 *               May also be a pre-constructed WorkspaceJson object (used in tests).
 */
export function compileWorkspace(json: WorkspaceJson): Strategy {
  // Find the strategy_root block
  const topBlocks = json.blocks?.blocks ?? [];
  const root = topBlocks.find((b) => b.type === 'strategy_root');

  const name = 'Visual Strategy';

  return {
    name,

    nextBets(ctx: StrategyContext): Bet[] {
      // Empty workspace — no root block found
      if (!root) return [];

      const evalCtx: EvalCtx = {
        history: ctx.history,
        bankroll: ctx.bankroll,
        baseUnit: ctx.baseUnit,
        bets: [],
      };

      execStatements(root.inputs?.['DO']?.block, evalCtx);

      // Filter out bets that exceed the bankroll
      const affordable = evalCtx.bets.filter((b) => b.amount <= ctx.bankroll);

      // If we generated bets but none are affordable, signal stop
      if (evalCtx.bets.length > 0 && affordable.length === 0) {
        return [];
      }

      return affordable;
    },
  };
}
