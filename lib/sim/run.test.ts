import { describe, expect, it, vi } from "vitest";
import { runProgram } from "@/lib/sim/run";
import type { SimTick } from "@/lib/sim/types";

describe("runProgram", () => {
  it('noop returns empty ticks array', () => {
    const result = runProgram({ kind: "noop" });
    expect(result.ticks).toEqual([]);
  });

  it('echo returns the correct number of ticks', () => {
    const result = runProgram({ kind: "echo", ticks: 3 });
    expect(result.ticks).toHaveLength(3);
  });

  it('echo tick values contain i equal to t for each tick', () => {
    const result = runProgram({ kind: "echo", ticks: 3 });
    expect(result.ticks[0]).toEqual({ t: 0, values: { i: 0 } });
    expect(result.ticks[1]).toEqual({ t: 1, values: { i: 1 } });
    expect(result.ticks[2]).toEqual({ t: 2, values: { i: 2 } });
  });

  it('echo calls onTick once per tick in order', () => {
    const onTick = vi.fn<[SimTick], void>();
    runProgram({ kind: "echo", ticks: 3 }, onTick);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick.mock.calls[0][0]).toEqual({ t: 0, values: { i: 0 } });
    expect(onTick.mock.calls[1][0]).toEqual({ t: 1, values: { i: 1 } });
    expect(onTick.mock.calls[2][0]).toEqual({ t: 2, values: { i: 2 } });
  });

  it('echo with 0 ticks returns empty ticks array', () => {
    const onTick = vi.fn<[SimTick], void>();
    const result = runProgram({ kind: "echo", ticks: 0 }, onTick);
    expect(result.ticks).toEqual([]);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('result finishedAt is a number', () => {
    const result = runProgram({ kind: "noop" });
    expect(typeof result.finishedAt).toBe("number");
  });
});
