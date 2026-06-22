'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { simulate, monteCarlo, martingale, fibonacci, dalembert } from '@/lib/sim';
import type { SimulateResult, MonteCarloResult, WheelType } from '@/lib/sim';

type StrategyName = 'martingale' | 'fibonacci' | 'dalembert';
type EvenMoneyTarget = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';

interface FormState {
  strategy: StrategyName;
  target: EvenMoneyTarget;
  wheelType: WheelType;
  startingBankroll: number;
  baseUnit: number;
  maxSpins: number;
  seed: number;
  runs: number;
}

const DEFAULT_FORM: FormState = {
  strategy: 'martingale',
  target: 'red',
  wheelType: 'european',
  startingBankroll: 1000,
  baseUnit: 5,
  maxSpins: 200,
  seed: 42,
  runs: 1,
};

const LS_KEY = 'strat-sim:form';

/** Load FormState from localStorage, falling back to DEFAULT_FORM if missing/invalid. */
function loadForm(): FormState {
  if (typeof window === 'undefined') return DEFAULT_FORM;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_FORM;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FORM;
    const p = parsed as Record<string, unknown>;
    // Validate every key has the correct type.
    if (
      typeof p.strategy !== 'string' ||
      typeof p.target !== 'string' ||
      typeof p.wheelType !== 'string' ||
      typeof p.startingBankroll !== 'number' ||
      typeof p.baseUnit !== 'number' ||
      typeof p.maxSpins !== 'number' ||
      typeof p.seed !== 'number' ||
      typeof p.runs !== 'number'
    ) {
      return DEFAULT_FORM;
    }
    return {
      strategy: p.strategy as StrategyName,
      target: p.target as EvenMoneyTarget,
      wheelType: p.wheelType as WheelType,
      startingBankroll: p.startingBankroll,
      baseUnit: p.baseUnit,
      maxSpins: p.maxSpins,
      seed: p.seed,
      runs: p.runs,
    };
  } catch {
    return DEFAULT_FORM;
  }
}

function buildStrategy(form: FormState) {
  switch (form.strategy) {
    case 'fibonacci':
      return fibonacci({ target: form.target, baseUnit: form.baseUnit });
    case 'dalembert':
      return dalembert({ target: form.target, baseUnit: form.baseUnit });
    case 'martingale':
    default:
      return martingale({ target: form.target, baseUnit: form.baseUnit });
  }
}

function runSim(form: FormState): SimulateResult {
  return simulate({
    strategy: buildStrategy(form),
    wheelType: form.wheelType,
    startingBankroll: form.startingBankroll,
    baseUnit: form.baseUnit,
    maxSpins: form.maxSpins,
    seed: form.seed,
  });
}

const STRATEGY_LABELS: Record<StrategyName, string> = {
  martingale: 'Martingale',
  fibonacci: 'Fibonacci',
  dalembert: "D'Alembert",
};

const WHEEL_LABELS: Record<WheelType, string> = {
  european: 'European',
  american: 'American',
};

// Shared Tailwind classes
const inputClass =
  'rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1';

export default function Home() {
  const [form, setForm] = useState<FormState>(() => loadForm());
  const [singleResult, setSingleResult] = useState<SimulateResult | null>(
    () => runSim(DEFAULT_FORM),
  );
  const [aggregate, setAggregate] = useState<MonteCarloResult | null>(null);
  const [committed, setCommitted] = useState<FormState>(DEFAULT_FORM);

  // Persist form to localStorage whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(form));
    } catch {
      // Ignore quota / private-browsing errors.
    }
  }, [form]);

  const handleRun = useCallback(() => {
    const runs = Math.max(1, form.runs);
    if (runs <= 1) {
      setSingleResult(runSim(form));
      setAggregate(null);
    } else {
      const mc = monteCarlo({
        strategy: buildStrategy(form),
        wheelType: form.wheelType,
        startingBankroll: form.startingBankroll,
        baseUnit: form.baseUnit,
        maxSpins: form.maxSpins,
        seed: form.seed,
        runs,
      });
      setAggregate(mc);
      setSingleResult(null);
    }
    setCommitted({ ...form, runs });
  }, [form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const chartData =
    singleResult
      ? singleResult.spins.map((s, i) => ({ spin: i + 1, bankroll: s.bankrollAfter }))
      : [];

  const histogramData = aggregate
    ? aggregate.histogram.map((b) => ({
        bin: `${b.binStart.toFixed(0)}–${b.binEnd.toFixed(0)}`,
        count: b.count,
      }))
    : [];

  const summaryLine = (() => {
    const base = [
      STRATEGY_LABELS[committed.strategy],
      'on',
      committed.target,
      '·',
      WHEEL_LABELS[committed.wheelType],
      'wheel · seed',
      committed.seed,
      '·',
      `${committed.startingBankroll.toLocaleString()} starting bankroll`,
    ].join(' ');
    if (committed.runs > 1) {
      return `${base} · ${committed.runs} runs (base seed ${committed.seed})`;
    }
    return base;
  })();

  return (
    <main className="min-h-screen flex flex-col items-center gap-8 p-8">
      <h1 className="text-4xl font-bold tracking-tight mt-4">
        Roulette Strategy Tester
      </h1>
      <p className="text-lg text-gray-300">{summaryLine}</p>

      {/* ── Controls ── */}
      <section className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-800 px-6 py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Strategy */}
          <div>
            <label className={labelClass}>Strategy</label>
            <select
              className={inputClass + ' w-full'}
              value={form.strategy}
              onChange={(e) => set('strategy', e.target.value as StrategyName)}
            >
              <option value="martingale">Martingale</option>
              <option value="fibonacci">Fibonacci</option>
              <option value="dalembert">D&apos;Alembert</option>
            </select>
          </div>

          {/* Target */}
          <div>
            <label className={labelClass}>Target</label>
            <select
              className={inputClass + ' w-full'}
              value={form.target}
              onChange={(e) => set('target', e.target.value as EvenMoneyTarget)}
            >
              {(['red', 'black', 'even', 'odd', 'low', 'high'] as const).map(
                (t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ),
              )}
            </select>
          </div>

          {/* Wheel */}
          <div>
            <label className={labelClass}>Wheel</label>
            <select
              className={inputClass + ' w-full'}
              value={form.wheelType}
              onChange={(e) => set('wheelType', e.target.value as WheelType)}
            >
              <option value="european">European</option>
              <option value="american">American</option>
            </select>
          </div>

          {/* Seed */}
          <div>
            <label className={labelClass}>Seed</label>
            <input
              type="number"
              className={inputClass + ' w-full'}
              value={form.seed}
              onChange={(e) => set('seed', Number(e.target.value))}
            />
          </div>

          {/* Starting bankroll */}
          <div>
            <label className={labelClass}>Starting Bankroll ($)</label>
            <input
              type="number"
              min={1}
              className={inputClass + ' w-full'}
              value={form.startingBankroll}
              onChange={(e) => set('startingBankroll', Number(e.target.value))}
            />
          </div>

          {/* Base unit */}
          <div>
            <label className={labelClass}>Base Unit ($)</label>
            <input
              type="number"
              min={1}
              className={inputClass + ' w-full'}
              value={form.baseUnit}
              onChange={(e) => set('baseUnit', Number(e.target.value))}
            />
          </div>

          {/* Max spins */}
          <div>
            <label className={labelClass}>Max Spins</label>
            <input
              type="number"
              min={1}
              className={inputClass + ' w-full'}
              value={form.maxSpins}
              onChange={(e) => set('maxSpins', Number(e.target.value))}
            />
          </div>

          {/* Runs */}
          <div>
            <label className={labelClass}>Runs</label>
            <input
              type="number"
              min={1}
              className={inputClass + ' w-full'}
              value={form.runs}
              onChange={(e) => set('runs', Math.max(1, Number(e.target.value)))}
            />
          </div>

          {/* Run button — spans remaining space, vertically aligned with inputs */}
          <div className="flex items-end sm:col-span-2">
            <button
              onClick={handleRun}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
            >
              Run simulation
            </button>
          </div>
        </div>
      </section>

      {/* ── Summary stats ── */}
      {committed.runs <= 1 && singleResult !== null ? (
        <section className="w-full max-w-3xl grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Final Bankroll" value={`${singleResult.finalBankroll.toFixed(2)}`} />
          <StatCard label="Peak Bankroll" value={`${singleResult.peakBankroll.toFixed(2)}`} />
          <StatCard label="Max Drawdown" value={`${singleResult.maxDrawdown.toFixed(2)}`} />
          <StatCard label="Spins Played" value={String(singleResult.spins.length)} />
          <StatCard label="Ruined" value={singleResult.ruined ? 'Yes' : 'No'} highlight={singleResult.ruined} />
        </section>
      ) : aggregate !== null ? (
        <section className="w-full max-w-3xl grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Runs" value={String(aggregate.runs)} />
          <StatCard
            label="Ruin Rate"
            value={`${(aggregate.ruinRate * 100).toFixed(1)}%`}
            highlight={aggregate.ruinRate > 0.5}
          />
          <StatCard label="Median Final Bankroll" value={`${aggregate.median.toFixed(2)}`} />
          <StatCard label="Mean Final Bankroll" value={`${aggregate.mean.toFixed(2)}`} />
          <StatCard label="Worst Drawdown" value={`${aggregate.worstDrawdown.toFixed(2)}`} />
          <StatCard label="5th %ile" value={`${aggregate.p5.toFixed(2)}`} />
          <StatCard label="25th %ile" value={`${aggregate.p25.toFixed(2)}`} />
          <StatCard label="75th %ile" value={`${aggregate.p75.toFixed(2)}`} />
          <StatCard label="95th %ile" value={`${aggregate.p95.toFixed(2)}`} />
        </section>
      ) : null}

      {/* ── Bankroll chart (single-run only) ── */}
      {committed.runs <= 1 && singleResult !== null && (
        <section className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-800 px-4 py-5">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">
            Bankroll over time
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="spin"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                label={{ value: 'Spin', position: 'insideBottomRight', offset: -4, fill: '#6b7280', fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
                itemStyle={{ color: '#a5b4fc' }}
                formatter={(v: number) => [`${v.toFixed(2)}`, 'Bankroll']}
                labelFormatter={(label: number) => `Spin ${label}`}
              />
              <Line
                type="monotone"
                dataKey="bankroll"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* ── Final bankroll distribution histogram (multi-run only) ── */}
      {aggregate !== null && (
        <section className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-800 px-4 py-5">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">
            Final bankroll distribution
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={histogramData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="bin"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
                itemStyle={{ color: '#a5b4fc' }}
                formatter={(v: number) => [v, 'Count']}
                labelFormatter={(label: string) => `Range: ${label}`}
              />
              <Bar
                dataKey="count"
                fill="#6366f1"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-4 text-center">
      <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p
        className={`text-xl font-mono font-semibold ${highlight ? 'text-red-400' : 'text-white'}`}
      >
        {value}
      </p>
    </div>
  );
}
