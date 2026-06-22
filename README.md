# Roulette Strategy Tester

A Next.js app for simulating and visualising roulette betting strategies (Martingale, Fibonacci, D'Alembert, Flat, and composites). The simulation engine is pure TypeScript — no DOM/React dependencies — so it can be unit-tested headlessly at full speed.

## Tech stack

- **Next.js 14** (App Router) · **React 18** · **Tailwind CSS 3**
- **Recharts** for visualisation
- **Blockly** for the visual strategy builder
- **Vitest** for unit testing the simulation engine

## Getting started

```bash
npm install
npm run dev      # starts the dev server at http://localhost:3000
npm test         # runs the Vitest unit-test suite
npm run build    # production build
```

## Features

- **Quick form** — configure a list of bets, each with its own strategy (Martingale, Fibonacci, D'Alembert, or Flat), bet kind (all 13 kinds: even-money, dozens, columns, straight numbers), and optional per-bet base-unit override. Multiple bets run in parallel via the composite strategy.
- **Visual builder** — drag-and-drop Blockly workspace for building custom strategies without code. The default workspace shows a Martingale-on-red equivalent.
- **Per-spin table** — scrollable table of the last 50 spins showing pocket number, color dot, stake, P&L, and bankroll after each spin.
- **Monte Carlo** — set Runs > 1 to aggregate thousands of simulations and view the final-bankroll distribution histogram plus ruin rate / percentile stats.

## Visual builder

Switch to "Visual builder" mode to use the Blockly workspace. Connect blocks from the toolbox:

- **Bets** — `Place bet` with a bet-kind dropdown (all 13 kinds) and an amount socket.
- **Amounts** — `Base unit`, `Constant`, `Last stake × factor`, `Arithmetic`.
- **Conditions** — `Last spin was color`, `Last spin number =`, `Last spin won on`, `Loss streak ≥ N`, `History length ≥ N`.
- **Control** — `if/then`, `if/then/else`, `Compare`, `And`, `Or`, `Not`.

The workspace is persisted to `localStorage` under `strat-sim:blockly:v1`. The canned default is a Martingale-on-red equivalent.

## Project layout

```
app/                    Next.js App Router pages & layout
components/
  BlocklyBuilder.tsx    Client component mounting the Blockly workspace
lib/
  blockly/
    blocks.ts           Custom Blockly block definitions
    compile.ts          Pure workspace-JSON → Strategy compiler (no eval)
    compile.test.ts     Vitest tests for the compiler
    toolbox.ts          Toolbox XML/JSON for the Blockly editor
  sim/                  Pure simulation engine
    rng.ts              Seedable PRNG (mulberry32)
    wheel.ts            European & American wheel definitions
    bets.ts             Bet types, ProgressionTarget, payout logic, resolver
    strategy.ts         Strategy interface & types
    simulate.ts         Main simulation loop
    monteCarlo.ts       Multi-run aggregation
    index.ts            Public re-exports
    strategies/
      martingale.ts     Martingale implementation
      fibonacci.ts      Fibonacci implementation
      dalembert.ts      D'Alembert implementation
      flat.ts           Flat (constant stake) implementation
      composite.ts      Multi-bet composer
      *.test.ts         Vitest unit tests for each strategy
    *.test.ts           Vitest unit tests for sim engine
```
