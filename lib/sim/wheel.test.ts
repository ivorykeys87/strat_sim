import { describe, it, expect } from 'vitest';
import { buildWheel } from './wheel';

describe('buildWheel – european', () => {
  const wheel = buildWheel('european');

  it('has exactly 37 pockets', () => {
    expect(wheel).toHaveLength(37);
  });

  it('has exactly one green pocket (0)', () => {
    const greens = wheel.filter((p) => p.color === 'green');
    expect(greens).toHaveLength(1);
    expect(greens[0].number).toBe(0);
  });

  it('known red numbers are red', () => {
    for (const n of [1, 3, 5, 7, 9, 12]) {
      const pocket = wheel.find((p) => p.number === n);
      expect(pocket).toBeDefined();
      expect(pocket!.color).toBe('red');
    }
  });

  it('known black numbers are black', () => {
    for (const n of [2, 4, 6, 8, 10, 11]) {
      const pocket = wheel.find((p) => p.number === n);
      expect(pocket).toBeDefined();
      expect(pocket!.color).toBe('black');
    }
  });

  it('has 18 red and 18 black pockets', () => {
    expect(wheel.filter((p) => p.color === 'red')).toHaveLength(18);
    expect(wheel.filter((p) => p.color === 'black')).toHaveLength(18);
  });
});

describe('buildWheel – american', () => {
  const wheel = buildWheel('american');

  it('has exactly 38 pockets', () => {
    expect(wheel).toHaveLength(38);
  });

  it('has exactly two green pockets (0 and 00)', () => {
    const greens = wheel.filter((p) => p.color === 'green');
    expect(greens).toHaveLength(2);
    const numbers = greens.map((p) => p.number).sort((a, b) => a - b);
    expect(numbers).toEqual([0, 37]);
  });

  it('00 pocket has label "00"', () => {
    const doubleZero = wheel.find((p) => p.number === 37);
    expect(doubleZero).toBeDefined();
    expect(doubleZero!.label).toBe('00');
    expect(doubleZero!.color).toBe('green');
  });

  it('still has 18 red and 18 black pockets', () => {
    expect(wheel.filter((p) => p.color === 'red')).toHaveLength(18);
    expect(wheel.filter((p) => p.color === 'black')).toHaveLength(18);
  });
});
