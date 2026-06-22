# Roulette Strategy Tester

A Next.js app for simulating and visualising roulette betting strategies (Martingale and more to come). The simulation engine is pure TypeScript — no DOM/React dependencies — so it can be unit-tested headlessly at full speed.

## Tech stack

- **Next.js 14** (App Router) · **React 18** · **Tailwind CSS 3**
- **Recharts** for visualisation (coming soon)
- **Blockly** for visual strategy builder (coming soon)
- **Vitest** for unit testing the simulation engine

## Getting started

```bash
npm install
npm run dev      # starts the dev server at http://localhost:3000
npm test         # runs the Vitest unit-test suite
npm run build    # production build
```

## Project layout

```
app/              Next.js App Router pages & layout
lib/sim/          Pure simulation engine
  rng.ts          Seedable PRNG (mulberry32)
  wheel.ts        European & American wheel definitions
  bets.ts         Bet types, payout logic, resolver
  strategy.ts     Strategy interface & types
  strategies/
    martingale.ts Martingale implementation
  simulate.ts     Main simulation loop
  index.ts        Public re-exports
  *.test.ts       Vitest unit tests
```
