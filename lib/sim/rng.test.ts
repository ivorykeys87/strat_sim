import { describe, it, expect } from 'vitest';
import { mulberry32, randomInt } from './rng';

describe('mulberry32', () => {
  it('same seed produces identical first 5 outputs', () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);
    const out1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
    const out2 = [rng2(), rng2(), rng2(), rng2(), rng2()];
    expect(out1).toEqual(out2);
  });

  it('different seeds produce different outputs', () => {
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(2);
    const out1 = [rng1(), rng1(), rng1()];
    const out2 = [rng2(), rng2(), rng2()];
    expect(out1).not.toEqual(out2);
  });

  it('outputs are in [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('always returns integers in [0, maxExclusive)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = randomInt(rng, 37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(37);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
