import { describe, it, expect } from 'vitest';
import { compileWorkspace, DEFAULT_BLOCKLY_WORKSPACE } from './compile';
import { martingale } from '../sim/strategies/martingale';
import { simulate } from '../sim/simulate';
import type { SpinResult } from '../sim/strategy';
import type { Pocket } from '../sim/wheel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLoss(kind: string, amount: number): SpinResult {
  return {
    pocket: { number: 0, color: 'green' } as Pocket,
    bets: [{ kind: kind as never, amount }],
    netPnl: -amount,
    bankrollAfter: 1000,
  };
}

// ---------------------------------------------------------------------------
// Empty workspace
// ---------------------------------------------------------------------------

describe('compileWorkspace – empty workspace', () => {
  it('returns [] when workspace has no blocks', () => {
    const strat = compileWorkspace({});
    const bets = strat.nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets).toHaveLength(0);
  });

  it('returns [] when workspace has blocks array but no strategy_root', () => {
    const strat = compileWorkspace({ blocks: { blocks: [] } });
    const bets = strat.nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Default workspace: Martingale-on-red equivalent
// ---------------------------------------------------------------------------

describe('compileWorkspace – DEFAULT_BLOCKLY_WORKSPACE (Martingale-on-red equivalent)', () => {
  const compiled = compileWorkspace(DEFAULT_BLOCKLY_WORKSPACE);
  const mgale = martingale({ target: 'red', baseUnit: 5 });

  it('first bet (no history) matches martingale first bet', () => {
    const ctx = { bankroll: 1000, history: [], baseUnit: 5 };
    const compiledBets = compiled.nextBets(ctx);
    const mgaleBets = mgale.nextBets(ctx);
    expect(compiledBets).toHaveLength(1);
    expect(compiledBets[0].kind).toBe('red');
    expect(compiledBets[0].amount).toBe(mgaleBets[0].amount); // 5
  });

  it('after one red loss, stake doubles to match martingale', () => {
    const history = [makeLoss('red', 5)];
    const ctx = { bankroll: 1000, history, baseUnit: 5 };
    const compiledBets = compiled.nextBets(ctx);
    const mgaleBets = mgale.nextBets(ctx);
    expect(compiledBets[0].amount).toBe(mgaleBets[0].amount); // 10
  });

  it('after two red losses, stake doubles twice to match martingale', () => {
    const history = [makeLoss('red', 5), makeLoss('red', 10)];
    const ctx = { bankroll: 1000, history, baseUnit: 5 };
    const compiledBets = compiled.nextBets(ctx);
    const mgaleBets = mgale.nextBets(ctx);
    expect(compiledBets[0].amount).toBe(mgaleBets[0].amount); // 20
  });

  it('produces identical bet sequence to martingale over fixed seed', () => {
    // Run both strategies side-by-side over the same seed and compare per-spin bets.
    const SEED = 42;
    const BANKROLL = 1000;
    const BASE = 5;
    const MAX_SPINS = 50;

    const r1 = simulate({
      strategy: compiled,
      wheelType: 'european',
      startingBankroll: BANKROLL,
      baseUnit: BASE,
      maxSpins: MAX_SPINS,
      seed: SEED,
    });

    const r2 = simulate({
      strategy: mgale,
      wheelType: 'european',
      startingBankroll: BANKROLL,
      baseUnit: BASE,
      maxSpins: MAX_SPINS,
      seed: SEED,
    });

    // Same number of spins played
    expect(r1.spins.length).toBe(r2.spins.length);

    // Each spin's bet amount should match
    for (let i = 0; i < r1.spins.length; i++) {
      const b1 = r1.spins[i].bets.find((b) => b.kind === 'red');
      const b2 = r2.spins[i].bets.find((b) => b.kind === 'red');
      expect(b1).toBeDefined();
      expect(b2).toBeDefined();
      expect(b1?.amount).toBe(b2?.amount);
    }

    // Same final bankroll (deterministic)
    expect(r1.finalBankroll).toBe(r2.finalBankroll);
  });
});

// ---------------------------------------------------------------------------
// Minimal hand-built trees
// ---------------------------------------------------------------------------

describe('compileWorkspace – place_bet block', () => {
  it('places a flat red bet of base unit each spin', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'place_bet',
                  fields: { KIND: 'red', NUMBER: 0 },
                  inputs: {
                    AMOUNT: { block: { type: 'amount_base_unit' } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const strat = compileWorkspace(ws);
    const bets = strat.nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('red');
    expect(bets[0].amount).toBe(5);
  });

  it('places a straight bet with correct number field', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'place_bet',
                  fields: { KIND: 'straight', NUMBER: 17 },
                  inputs: {
                    AMOUNT: { block: { type: 'amount_constant', fields: { VALUE: 10 } } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const strat = compileWorkspace(ws);
    const bets = strat.nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets).toHaveLength(1);
    expect(bets[0].kind).toBe('straight');
    expect(bets[0].number).toBe(17);
    expect(bets[0].amount).toBe(10);
  });
});

describe('compileWorkspace – conditions', () => {
  it('condition_history_length: no bet on first spin', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'control_if_then',
                  inputs: {
                    CONDITION: {
                      block: {
                        type: 'condition_history_length',
                        fields: { N: 2 },
                      },
                    },
                    DO: {
                      block: {
                        type: 'place_bet',
                        fields: { KIND: 'red', NUMBER: 0 },
                        inputs: {
                          AMOUNT: { block: { type: 'amount_base_unit' } },
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
    const strat = compileWorkspace(ws);
    // No history — condition false → no bets
    const bets = strat.nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets).toHaveLength(0);
  });

  it('condition_last_color: bets when last pocket was red', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'control_if_then',
                  inputs: {
                    CONDITION: {
                      block: {
                        type: 'condition_last_color',
                        fields: { COLOR: 'red' },
                      },
                    },
                    DO: {
                      block: {
                        type: 'place_bet',
                        fields: { KIND: 'red', NUMBER: 0 },
                        inputs: {
                          AMOUNT: { block: { type: 'amount_base_unit' } },
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
    const strat = compileWorkspace(ws);

    const redHistory: SpinResult[] = [
      {
        pocket: { number: 1, color: 'red' },
        bets: [{ kind: 'red', amount: 5 }],
        netPnl: 5,
        bankrollAfter: 1005,
      },
    ];

    const greenHistory: SpinResult[] = [
      {
        pocket: { number: 0, color: 'green' },
        bets: [{ kind: 'red', amount: 5 }],
        netPnl: -5,
        bankrollAfter: 995,
      },
    ];

    expect(strat.nextBets({ bankroll: 1000, history: redHistory, baseUnit: 5 })).toHaveLength(1);
    expect(strat.nextBets({ bankroll: 1000, history: greenHistory, baseUnit: 5 })).toHaveLength(0);
  });
});

describe('compileWorkspace – amount blocks', () => {
  it('amount_constant returns the configured value', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'place_bet',
                  fields: { KIND: 'black', NUMBER: 0 },
                  inputs: {
                    AMOUNT: { block: { type: 'amount_constant', fields: { VALUE: 25 } } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const bets = compileWorkspace(ws).nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets[0].amount).toBe(25);
  });

  it('amount_last_stake_times × 2 returns 2 × base when no history', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'place_bet',
                  fields: { KIND: 'red', NUMBER: 0 },
                  inputs: {
                    AMOUNT: {
                      block: {
                        type: 'amount_last_stake_times',
                        fields: { KIND: 'red', FACTOR: 2 },
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
    // No history → lastStakeFor falls back to baseUnit=5 → 5×2=10
    const bets = compileWorkspace(ws).nextBets({ bankroll: 1000, history: [], baseUnit: 5 });
    expect(bets[0].amount).toBe(10);
  });

  it('amount_last_stake_times × 2 after a loss returns 2 × last stake', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'place_bet',
                  fields: { KIND: 'red', NUMBER: 0 },
                  inputs: {
                    AMOUNT: {
                      block: {
                        type: 'amount_last_stake_times',
                        fields: { KIND: 'red', FACTOR: 2 },
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
    const history = [makeLoss('red', 5)];
    const bets = compileWorkspace(ws).nextBets({ bankroll: 1000, history, baseUnit: 5 });
    expect(bets[0].amount).toBe(10);
  });
});

describe('compileWorkspace – bankroll guard', () => {
  it('returns [] when bet amount exceeds bankroll', () => {
    const ws = {
      blocks: {
        blocks: [
          {
            type: 'strategy_root',
            inputs: {
              DO: {
                block: {
                  type: 'place_bet',
                  fields: { KIND: 'red', NUMBER: 0 },
                  inputs: {
                    AMOUNT: { block: { type: 'amount_constant', fields: { VALUE: 500 } } },
                  },
                },
              },
            },
          },
        ],
      },
    };
    const bets = compileWorkspace(ws).nextBets({ bankroll: 10, history: [], baseUnit: 5 });
    expect(bets).toHaveLength(0);
  });
});
