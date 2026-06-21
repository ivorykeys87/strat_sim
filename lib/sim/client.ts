/**
 * Browser-only simulation client.
 *
 * This module spawns the sim worker and exposes a typed `run()` API.
 * It must only be imported from browser (client) code — it references
 * `Worker`, `crypto.randomUUID`, and `import.meta.url`, none of which
 * are available in Node / server-side rendering contexts.
 */

import type {
  SimProgram,
  SimRequest,
  SimResponse,
  SimResult,
  SimTick,
} from "@/lib/sim/types";

export interface SimClient {
  /** Run a program, streaming ticks via onTick. Resolves with the full SimResult. */
  run(program: SimProgram, onTick?: (tick: SimTick) => void): Promise<SimResult>;
  /** Terminate the underlying worker immediately. */
  terminate(): void;
}

/**
 * Create a SimClient backed by a Web Worker.
 * Call once per component/session and reuse the instance across multiple `run()` calls.
 */
export function createSimClient(): SimClient {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  // Map of in-flight run ids to their resolve/reject/onTick handlers.
  type Handlers = {
    resolve: (result: SimResult) => void;
    reject: (err: Error) => void;
    onTick?: (tick: SimTick) => void;
  };
  const pending = new Map<string, Handlers>();

  worker.onmessage = (event: MessageEvent<SimResponse>) => {
    const msg = event.data;
    const handlers = pending.get(msg.id);
    if (!handlers) return;

    if (msg.type === "progress") {
      handlers.onTick?.(msg.tick);
    } else if (msg.type === "done") {
      pending.delete(msg.id);
      handlers.resolve(msg.result);
    } else if (msg.type === "error") {
      pending.delete(msg.id);
      handlers.reject(new Error(msg.message));
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    // Reject all pending runs on an unhandled worker error.
    const err = new Error(event.message ?? "Unknown worker error");
    for (const [id, handlers] of pending) {
      pending.delete(id);
      handlers.reject(err);
    }
  };

  return {
    run(program: SimProgram, onTick?: (tick: SimTick) => void): Promise<SimResult> {
      return new Promise<SimResult>((resolve, reject) => {
        const id = crypto.randomUUID();
        pending.set(id, { resolve, reject, onTick });
        const request: SimRequest = { id, program };
        worker.postMessage(request);
      });
    },

    terminate() {
      worker.terminate();
    },
  };
}
