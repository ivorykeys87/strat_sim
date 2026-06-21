/**
 * Core types for the simulation runner.
 * No runtime code — types only.
 */

/** Placeholder program shape; the Blockly compiler will extend this later. */
export type SimProgram = { kind: "noop" } | { kind: "echo"; ticks: number };

/** A single simulation tick produced during a run. */
export type SimTick = { t: number; values: Record<string, number> };

/** The full result returned when a simulation completes. */
export type SimResult = { ticks: SimTick[]; finishedAt: number };

// ---------------------------------------------------------------------------
// Worker message types
// ---------------------------------------------------------------------------

export type SimRequest = { id: string; program: SimProgram };

export type SimProgressMsg = { type: "progress"; id: string; tick: SimTick };
export type SimDoneMsg    = { type: "done";     id: string; result: SimResult };
export type SimErrorMsg   = { type: "error";    id: string; message: string };

export type SimResponse = SimProgressMsg | SimDoneMsg | SimErrorMsg;
