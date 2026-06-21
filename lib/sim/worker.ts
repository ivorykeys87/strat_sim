/**
 * Web Worker entry point for the simulation runner.
 * This file IS the worker — do not instantiate `new Worker(...)` here.
 * Use lib/sim/client.ts to spawn this worker from the browser.
 */

import { runProgram } from "@/lib/sim/run";
import type { SimRequest, SimResponse, SimTick } from "@/lib/sim/types";

self.onmessage = (event: MessageEvent<SimRequest>) => {
  const { id, program } = event.data;

  try {
    const result = runProgram(program, (tick: SimTick) => {
      const progress: SimResponse = { type: "progress", id, tick };
      self.postMessage(progress);
    });

    const done: SimResponse = { type: "done", id, result };
    self.postMessage(done);
  } catch (err) {
    const error: SimResponse = { type: "error", id, message: String(err) };
    self.postMessage(error);
  }
};
