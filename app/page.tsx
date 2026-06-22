import { simulate, martingale } from '@/lib/sim';

export default function Home() {
  // Run the simulation once on the server with a fixed seed so we can
  // visually confirm the engine is wired up on the landing page.
  const result = simulate({
    strategy: martingale({ target: 'red', baseUnit: 5 }),
    wheelType: 'european',
    startingBankroll: 1000,
    baseUnit: 5,
    maxSpins: 200,
    seed: 42,
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">
        Roulette Strategy Tester
      </h1>
      <p className="text-lg text-gray-300">
        Martingale on red · European wheel · seed 42 · $1 000 starting bankroll
      </p>
      <div className="rounded-xl border border-gray-700 bg-gray-800 px-8 py-6 text-center">
        <p className="text-sm uppercase tracking-widest text-gray-400 mb-1">
          Final Bankroll
        </p>
        <p className="text-3xl font-mono font-semibold">
          ${result.finalBankroll.toFixed(2)}
        </p>
        <p className="mt-3 text-sm text-gray-400">
          Spins played:{' '}
          <span className="font-semibold text-white">{result.spins.length}</span>
          &nbsp;·&nbsp; Ruined:{' '}
          <span className="font-semibold text-white">
            {result.ruined ? 'yes' : 'no'}
          </span>
        </p>
      </div>
    </main>
  );
}
