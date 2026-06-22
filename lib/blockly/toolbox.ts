/**
 * Blockly toolbox definition grouping all custom blocks into categories.
 * Returns a JSON toolbox object suitable for passing to `Blockly.inject`.
 */
export function buildToolbox(): object {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Bets',
        colour: '230',
        contents: [
          {
            kind: 'block',
            type: 'place_bet',
            inputs: {
              AMOUNT: {
                block: { type: 'amount_base_unit' },
              },
            },
          },
        ],
      },
      {
        kind: 'category',
        name: 'Amounts',
        colour: '65',
        contents: [
          {
            kind: 'block',
            type: 'amount_base_unit',
          },
          {
            kind: 'block',
            type: 'amount_constant',
            fields: { VALUE: 10 },
          },
          {
            kind: 'block',
            type: 'amount_last_stake_times',
            fields: { KIND: 'red', FACTOR: 2 },
          },
          {
            kind: 'block',
            type: 'amount_math',
          },
        ],
      },
      {
        kind: 'category',
        name: 'Conditions',
        colour: '120',
        contents: [
          {
            kind: 'block',
            type: 'condition_last_color',
            fields: { COLOR: 'red' },
          },
          {
            kind: 'block',
            type: 'condition_last_number',
            fields: { NUMBER: 0 },
          },
          {
            kind: 'block',
            type: 'condition_last_won_on',
            fields: { KIND: 'red' },
          },
          {
            kind: 'block',
            type: 'condition_loss_streak',
            fields: { KIND: 'red', N: 1 },
          },
          {
            kind: 'block',
            type: 'condition_history_length',
            fields: { N: 1 },
          },
        ],
      },
      {
        kind: 'category',
        name: 'Control',
        colour: '210',
        contents: [
          {
            kind: 'block',
            type: 'control_if_then',
          },
          {
            kind: 'block',
            type: 'control_if_then_else',
          },
          {
            kind: 'block',
            type: 'control_compare',
          },
          {
            kind: 'block',
            type: 'control_and',
          },
          {
            kind: 'block',
            type: 'control_or',
          },
          {
            kind: 'block',
            type: 'control_not',
          },
        ],
      },
    ],
  };
}
