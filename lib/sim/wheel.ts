import { randomInt } from './rng';

export type WheelType = 'european' | 'american';

export type Pocket = {
  number: number;
  color: 'red' | 'black' | 'green';
  label?: string;
};

// Canonical red numbers on a standard roulette wheel
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function pocketColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function buildWheel(type: WheelType): Pocket[] {
  const pockets: Pocket[] = [];

  // 0–36 for both wheel types
  for (let n = 0; n <= 36; n++) {
    pockets.push({ number: n, color: pocketColor(n) });
  }

  if (type === 'american') {
    // 00 represented as number 37, labeled '00'
    pockets.push({ number: 37, color: 'green', label: '00' });
  }

  return pockets;
}

export function spin(rng: () => number, wheel: Pocket[]): Pocket {
  const idx = randomInt(rng, wheel.length);
  return wheel[idx];
}
