/**
 * Pure simulation runner — no DOM/window references.
 * Safe to import from a Web Worker and from Node (Vitest).
 */

import type { SimProgram, SimResult, SimTick } from "@/lib/sim/types";

/**
 * Execute a SimProgram synchronously.
 *
 * @param program - The program to run.
 * @param onTick  - Optional callback invoked for each tick as it is produced.
 * @returns       A SimResult containing all ticks and a finishedAt timestamp.
 */
export function runProgram(
  program: SimProgram,
  onTick?: (tick: SimTick) => void,
): SimResult {
  switch (program.kind) {
    case "noop": {
      return { ticks: [], finishedAt: Date.now() };
    }

    case "echo": {
      const ticks: SimTick[] = [];
      for (let t = 0; t < program.ticks; t++) {
        const tick: SimTick = { t, values: { i: t } };
        ticks.push(tick);
        onTick?.(tick);
      }
      return { ticks, finishedAt: Date.now() };
    }
  }
}
