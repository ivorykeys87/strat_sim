/**
 * Custom Blockly block definitions for the strategy builder.
 *
 * This file exports a `defineBlocks` function that registers all custom
 * blocks with a Blockly instance.  It intentionally takes `blockly` as a
 * parameter so it can be called from the client component after a dynamic
 * import (avoiding SSR issues).
 */

/** All 25 BetKind values paired with human-readable labels. */
export const BET_KIND_OPTIONS: [string, string][] = [
  ['Red', 'red'],
  ['Black', 'black'],
  ['Even', 'even'],
  ['Odd', 'odd'],
  ['Low (1–18)', 'low'],
  ['High (19–36)', 'high'],
  ['1st Dozen', 'dozen1'],
  ['2nd Dozen', 'dozen2'],
  ['3rd Dozen', 'dozen3'],
  ['1st Column', 'column1'],
  ['2nd Column', 'column2'],
  ['3rd Column', 'column3'],
  ['1st Street (1–3)', 'street1'],
  ['2nd Street (4–6)', 'street2'],
  ['3rd Street (7–9)', 'street3'],
  ['4th Street (10–12)', 'street4'],
  ['5th Street (13–15)', 'street5'],
  ['6th Street (16–18)', 'street6'],
  ['7th Street (19–21)', 'street7'],
  ['8th Street (22–24)', 'street8'],
  ['9th Street (25–27)', 'street9'],
  ['10th Street (28–30)', 'street10'],
  ['11th Street (31–33)', 'street11'],
  ['12th Street (34–36)', 'street12'],
  ['Straight', 'straight'],
];

export const COLOR_OPTIONS: [string, string][] = [
  ['Red', 'red'],
  ['Black', 'black'],
  ['Green', 'green'],
];

export const COMPARE_OPTIONS: [string, string][] = [
  ['=', 'EQ'],
  ['≠', 'NEQ'],
  ['<', 'LT'],
  ['≤', 'LTE'],
  ['>', 'GT'],
  ['≥', 'GTE'],
];

export const MATH_OP_OPTIONS: [string, string][] = [
  ['+', 'ADD'],
  ['-', 'SUB'],
  ['×', 'MUL'],
  ['÷', 'DIV'],
];

// ---------------------------------------------------------------------------
// Block type declarations (for compile.ts typing)
// ---------------------------------------------------------------------------

export type BlockType =
  | 'strategy_root'
  | 'place_bet'
  | 'bet_block'
  | 'amount_base_unit'
  | 'amount_constant'
  | 'amount_last_stake_times'
  | 'amount_math'
  | 'condition_last_color'
  | 'condition_last_number'
  | 'condition_last_won_on'
  | 'condition_loss_streak'
  | 'condition_history_length'
  | 'condition_block_won'
  | 'condition_block_lost'
  | 'condition_block_loss_streak'
  | 'control_if_then'
  | 'control_if_then_else'
  | 'control_compare'
  | 'control_and'
  | 'control_or'
  | 'control_not';

// ---------------------------------------------------------------------------
// defineBlocks — call once after importing Blockly on the client
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineBlocks(Blockly: any): void {
  // ── strategy_root ──────────────────────────────────────────────────────────
  Blockly.Blocks['strategy_root'] = {
    init(this: any) {
      this.appendStatementInput('DO').setCheck(null).appendField('On each spin do');
      this.setColour(160);
      this.setTooltip('Entry point — connect bet blocks below.');
      this.setDeletable(false);
    },
  };

  // ── place_bet ──────────────────────────────────────────────────────────────
  Blockly.Blocks['place_bet'] = {
    init(this: any) {
      this.appendValueInput('AMOUNT')
        .setCheck('Amount')
        .appendField('Place bet on')
        .appendField(
          new Blockly.FieldDropdown(BET_KIND_OPTIONS, function (this: any, value: string) {
            const block = this.getSourceBlock();
            if (block) block.updateShape_(value);
            return undefined;
          }),
          'KIND',
        );
      this.appendDummyInput('NUMBER_ROW')
        .appendField('number')
        .appendField(new Blockly.FieldNumber(0, 0, 37, 1), 'NUMBER');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(230);
      this.setTooltip('Place a bet of the given amount on the chosen bet type.');
      this.updateShape_('red'); // hide number row initially
    },
    updateShape_(this: any, kind: string) {
      const numberRow = this.getInput('NUMBER_ROW');
      if (numberRow) {
        numberRow.setVisible(kind === 'straight');
      }
    },
    mutationToDom(this: any) {
      const container = document.createElement('mutation');
      container.setAttribute('kind', this.getFieldValue('KIND'));
      return container;
    },
    domToMutation(this: any, xmlElement: Element) {
      const kind = xmlElement.getAttribute('kind') ?? 'red';
      this.updateShape_(kind);
    },
  };

  // ── amount_base_unit ───────────────────────────────────────────────────────
  Blockly.Blocks['amount_base_unit'] = {
    init(this: any) {
      this.appendDummyInput().appendField('base unit');
      this.setOutput(true, 'Amount');
      this.setColour(65);
      this.setTooltip('The base unit configured for this simulation.');
    },
  };

  // ── amount_constant ────────────────────────────────────────────────────────
  Blockly.Blocks['amount_constant'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldNumber(10, 0, Infinity, 1), 'VALUE');
      this.setOutput(true, 'Amount');
      this.setColour(65);
      this.setTooltip('A fixed constant amount.');
    },
  };

  // ── amount_last_stake_times ────────────────────────────────────────────────
  Blockly.Blocks['amount_last_stake_times'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField('last stake on')
        .appendField(new Blockly.FieldDropdown(BET_KIND_OPTIONS), 'KIND')
        .appendField('×')
        .appendField(new Blockly.FieldNumber(2, 0.01, Infinity, 0.01), 'FACTOR');
      this.setOutput(true, 'Amount');
      this.setColour(65);
      this.setTooltip('The last stake placed on the chosen bet type, multiplied by a factor.');
    },
  };

  // ── amount_math ────────────────────────────────────────────────────────────
  Blockly.Blocks['amount_math'] = {
    init(this: any) {
      this.appendValueInput('LEFT').setCheck('Amount');
      this.appendValueInput('RIGHT')
        .setCheck('Amount')
        .appendField(new Blockly.FieldDropdown(MATH_OP_OPTIONS), 'OP');
      this.setInputsInline(true);
      this.setOutput(true, 'Amount');
      this.setColour(65);
      this.setTooltip('Arithmetic between two amounts.');
    },
  };

  // ── condition_last_color ───────────────────────────────────────────────────
  Blockly.Blocks['condition_last_color'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField('last spin was')
        .appendField(new Blockly.FieldDropdown(COLOR_OPTIONS), 'COLOR');
      this.setOutput(true, 'Boolean');
      this.setColour(120);
      this.setTooltip('True if the last spin result was the chosen color.');
    },
  };

  // ── condition_last_number ──────────────────────────────────────────────────
  Blockly.Blocks['condition_last_number'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField('last spin number =')
        .appendField(new Blockly.FieldNumber(0, 0, 37, 1), 'NUMBER');
      this.setOutput(true, 'Boolean');
      this.setColour(120);
      this.setTooltip('True if the last spin pocket number equals the given value (37 = 00).');
    },
  };

  // ── condition_last_won_on ──────────────────────────────────────────────────
  Blockly.Blocks['condition_last_won_on'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField('last spin won on')
        .appendField(new Blockly.FieldDropdown(BET_KIND_OPTIONS), 'KIND');
      this.setOutput(true, 'Boolean');
      this.setColour(120);
      this.setTooltip('True if the last spin had a winning bet on the chosen bet type.');
    },
  };

  // ── condition_loss_streak ──────────────────────────────────────────────────
  Blockly.Blocks['condition_loss_streak'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField('loss streak on')
        .appendField(new Blockly.FieldDropdown(BET_KIND_OPTIONS), 'KIND')
        .appendField('≥')
        .appendField(new Blockly.FieldNumber(1, 1, Infinity, 1), 'N');
      this.setOutput(true, 'Boolean');
      this.setColour(120);
      this.setTooltip('True if there have been N or more consecutive losses on the chosen bet type.');
    },
  };

  // ── condition_history_length ───────────────────────────────────────────────
  Blockly.Blocks['condition_history_length'] = {
    init(this: any) {
      this.appendDummyInput()
        .appendField('history length ≥')
        .appendField(new Blockly.FieldNumber(1, 1, Infinity, 1), 'N');
      this.setOutput(true, 'Boolean');
      this.setColour(120);
      this.setTooltip('True if at least N spins have been played.');
    },
  };

  // ── control_if_then ────────────────────────────────────────────────────────
  Blockly.Blocks['control_if_then'] = {
    init(this: any) {
      this.appendValueInput('CONDITION').setCheck('Boolean').appendField('if');
      this.appendStatementInput('DO').setCheck(null).appendField('then');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(210);
      this.setTooltip('Execute bets only if the condition is true.');
    },
  };

  // ── control_if_then_else ───────────────────────────────────────────────────
  Blockly.Blocks['control_if_then_else'] = {
    init(this: any) {
      this.appendValueInput('CONDITION').setCheck('Boolean').appendField('if');
      this.appendStatementInput('DO').setCheck(null).appendField('then');
      this.appendStatementInput('ELSE').setCheck(null).appendField('else');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(210);
      this.setTooltip('Execute different bets depending on the condition.');
    },
  };

  // ── control_compare ────────────────────────────────────────────────────────
  Blockly.Blocks['control_compare'] = {
    init(this: any) {
      this.appendValueInput('LEFT').setCheck('Amount');
      this.appendValueInput('RIGHT')
        .setCheck('Amount')
        .appendField(new Blockly.FieldDropdown(COMPARE_OPTIONS), 'OP');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setColour(210);
      this.setTooltip('Compare two amounts.');
    },
  };

  // ── control_and ────────────────────────────────────────────────────────────
  Blockly.Blocks['control_and'] = {
    init(this: any) {
      this.appendValueInput('LEFT').setCheck('Boolean');
      this.appendValueInput('RIGHT').setCheck('Boolean').appendField('and');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setColour(210);
      this.setTooltip('True if both conditions are true.');
    },
  };

  // ── control_or ─────────────────────────────────────────────────────────────
  Blockly.Blocks['control_or'] = {
    init(this: any) {
      this.appendValueInput('LEFT').setCheck('Boolean');
      this.appendValueInput('RIGHT').setCheck('Boolean').appendField('or');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setColour(210);
      this.setTooltip('True if at least one condition is true.');
    },
  };

  // ── control_not ────────────────────────────────────────────────────────────
  Blockly.Blocks['control_not'] = {
    init(this: any) {
      this.appendValueInput('CONDITION').setCheck('Boolean').appendField('not');
      this.setOutput(true, 'Boolean');
      this.setColour(210);
      this.setTooltip('Negates a condition.');
    },
  };
}
