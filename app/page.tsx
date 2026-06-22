'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
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
import {
  simulate,
  monteCarlo,
  martingale,
  fibonacci,
  dalembert,
  flat,
  composite,
} from '@/lib/sim';
import type { SimulateResult, MonteCarloResult, WheelType, BetKind } from '@/lib/sim';
import { compileWorkspace } from '@/lib/blockly/compile';
import type { ProgressionTarget } from '@/lib/sim';

// ---------------------------------------------------------------------------
// Dynamic Blockly component (no SSR)
// ---------------------------------------------------------------------------

const BlocklyBuilder = dynamic(() => import('@/components/BlocklyBuilder'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[520px] rounded-xl border border-gray-700 bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
      Loading visual builder…
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StrategyName = 'martingale' | 'fibonacci' | 'dalembert' | 'flat';
type UIMode = 'form' | 'blockly';

export type BetSpec = {
  strategy: StrategyName;
  kind: BetKind;
  /** Required when kind === 'straight' (0–37, where 37 = 00) */
  number?: number;
  /** Per-bet base unit override; if absent, uses form-level baseUnit */
  baseUnit?: number;
};

interface FormState {
  bets: BetSpec[];
  wheelType: WheelType;
  startingBankroll: number;
  baseUnit: number;
  maxSpins: number;
  seed: number;
  runs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_KEY = 'strat-sim:form:v2';

const DEFAULT_BET: BetSpec = { strategy: 'martingale', kind: 'red' };

const DEFAULT_FORM: FormState = {
  bets: [{ ...DEFAULT_BET }],
  wheelType: 'european',
  startingBankroll: 1000,
  baseUnit: 5,
  maxSpins: 200,
  seed: 42,
  runs: 1,
};

const ALL_BET_KINDS: [BetKind, string][] = [
  ['red', 'Red'],
  ['black', 'Black'],
  ['even', 'Even'],
  ['odd', 'Odd'],
  ['low', 'Low (1–18)'],
  ['high', 'High (19–36)'],
  ['dozen1', '1st Dozen'],
  ['dozen2', '2nd Dozen'],
  ['dozen3', '3rd Dozen'],
  ['column1', '1st Column'],
  ['column2', '2nd Column'],
  ['column3', '3rd Column'],
  ['street1', '1st Street (1–3)'],
  ['street2', '2nd Street (4–6)'],
  ['street3', '3rd Street (7–9)'],
  ['street4', '4th Street (10–12)'],
  ['street5', '5th Street (13–15)'],
  ['street6', '6th Street (16–18)'],
  ['street7', '7th Street (19–21)'],
  ['street8', '8th Street (22–24)'],
  ['street9', '9th Street (25–27)'],
  ['street10', '10th Street (28–30)'],
  ['street11', '11th Street (31–33)'],
  ['street12', '12th Street (34–36)'],
  ['straight', 'Straight'],
];

const STRATEGY_LABELS: Record<StrategyName, string> = {
  martingale: 'Martingale',
  fibonacci: 'Fibonacci',
  dalembert: "D'Alembert",
  flat: 'Flat',
};

const WHEEL_LABELS: Record<WheelType, string> = {
  european: 'European',
  american: 'American',
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function isValidBetSpec(x: unknown): x is BetSpec {
  if (typeof x !== 'object' || x === null) return false;
  const b = x as Record<string, unknown>;
  if (!['martingale', 'fibonacci', 'dalembert', 'flat'].includes(b.strategy as string))
    return false;
  const validKinds: string[] = ALL_BET_KINDS.map(([k]) => k);
  if (!validKinds.includes(b.kind as string)) return false;
  if (b.kind === 'straight' && typeof b.number !== 'number') return false;
  if (b.baseUnit !== undefined && typeof b.baseUnit !== 'number') return false;
  return true;
}

function loadForm(): FormState {
  if (typeof window === 'undefined') return DEFAULT_FORM;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_FORM;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FORM;
    const p = parsed as Record<string, unknown>;
    if (
      !Array.isArray(p.bets) ||
      p.bets.length === 0 ||
      !p.bets.every(isValidBetSpec) ||
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
      bets: p.bets as BetSpec[],
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

// ---------------------------------------------------------------------------
// Strategy builder
// ---------------------------------------------------------------------------

function specToTarget(spec: BetSpec): ProgressionTarget {
  if (spec.kind === 'straight') {
    return { kind: 'straight', number: spec.number ?? 0 };
  }
  return spec.kind as ProgressionTarget;
}

function buildStrategyFromForm(form: FormState) {
  const inner = form.bets.map((spec) => {
    const target = specToTarget(spec);
    const bu = spec.baseUnit ?? form.baseUnit;
    switch (spec.strategy) {
      case 'fibonacci':
        return fibonacci({ target, baseUnit: bu });
      case 'dalembert':
        return dalembert({ target, baseUnit: bu });
      case 'flat':
        return flat({ target, baseUnit: bu });
      case 'martingale':
      default:
        return martingale({ target, baseUnit: bu });
    }
  });
  return inner.length === 1 ? inner[0] : composite(inner);
}

function runSim(form: FormState): SimulateResult {
  return simulate({
    strategy: buildStrategyFromForm(form),
    wheelType: form.wheelType,
    startingBankroll: form.startingBankroll,
    baseUnit: form.baseUnit,
    maxSpins: form.maxSpins,
    seed: form.seed,
  });
}

// ---------------------------------------------------------------------------
// Shared Tailwind classes
// ---------------------------------------------------------------------------

const inputClass =
  'rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelClass = 'block text-xs uppercase tracking-widest text-gray-400 mb-1';
const selectClass = inputClass + ' w-full';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  const [mode, setMode] = useState<UIMode>('form');
  const [form, setForm] = useState<FormState>(() => loadForm());
  const [singleResult, setSingleResult] = useState<SimulateResult | null>(
    () => runSim(DEFAULT_FORM),
  );
  const [aggregate, setAggregate] = useState<MonteCarloResult | null>(null);
  const [committed, setCommitted] = useState<FormState>(DEFAULT_FORM);

  // Blockly workspace JSON — kept in a ref to avoid triggering re-renders on
  // every workspace change; only matters when Run is clicked.
  const blocklyJsonRef = useRef<object | null>(null);

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

    let strategy;
    if (mode === 'blockly' && blocklyJsonRef.current !== null) {
      strategy = compileWorkspace(blocklyJsonRef.current as Parameters<typeof compileWorkspace>[0]);
    } else {
      strategy = buildStrategyFromForm(form);
    }

    if (runs <= 1) {
      const result = simulate({
        strategy,
        wheelType: form.wheelType,
        startingBankroll: form.startingBankroll,
        baseUnit: form.baseUnit,
        maxSpins: form.maxSpins,
        seed: form.seed,
      });
      setSingleResult(result);
      setAggregate(null);
    } else {
      const mc = monteCarlo({
        strategy,
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
  }, [form, mode]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Bet list helpers ──────────────────────────────────────────────────────

  const addBet = () =>
    setForm((prev) => ({ ...prev, bets: [...prev.bets, { ...DEFAULT_BET }] }));

  const removeBet = (index: number) =>
    setForm((prev) => ({
      ...prev,
      bets: prev.bets.length > 1 ? prev.bets.filter((_, i) => i !== index) : prev.bets,
    }));

  const updateBet = (index: number, patch: Partial<BetSpec>) =>
    setForm((prev) => ({
      ...prev,
      bets: prev.bets.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));

  // ── Chart data ────────────────────────────────────────────────────────────

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

  // ── Summary line ──────────────────────────────────────────────────────────

  const summaryLine = (() => {
    let stratDesc: string;
    if (mode === 'blockly') {
      stratDesc = 'Visual Strategy';
    } else {
      stratDesc = committed.bets
        .map((b) => {
          const sLabel = STRATEGY_LABELS[b.strategy];
          const kLabel =
            b.kind === 'straight'
              ? `#${b.number ?? 0}`
              : ALL_BET_KINDS.find(([k]) => k === b.kind)?.[1] ?? b.kind;
          return `${sLabel}(${kLabel})`;
        })
        .join(' + ');
    }
    const base = [
      stratDesc,
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

  // ── Per-spin table data (last 50 spins) ───────────────────────────────────

  const spinTableData =
    singleResult && committed.runs <= 1
      ? singleResult.spins.slice(-50).map((s, i, arr) => ({
          spinIndex: singleResult.spins.length - arr.length + i + 1,
          label: s.pocket.label ?? String(s.pocket.number),
          color: s.pocket.color,
          totalStake: s.bets.reduce((acc, b) => acc + b.amount, 0),
          netPnl: s.netPnl,
          bankrollAfter: s.bankrollAfter,
        }))
      : [];

  return (
    <main className="min-h-screen flex flex-col items-center gap-8 p-8">
      <h1 className="text-4xl font-bold tracking-tight mt-4">
        Roulette Strategy Tester
      </h1>
      <p className="text-lg text-gray-300 text-center max-w-3xl">{summaryLine}</p>

      {/* ── Mode toggle ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('form')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
            mode === 'form'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Quick form
        </button>
        <button
          onClick={() => setMode('blockly')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
            mode === 'blockly'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Visual builder
        </button>
      </div>

      {/* ── Quick form ── */}
      {mode === 'form' && (
        <section className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-800 px-6 py-5 flex flex-col gap-4">

          {/* Bet list */}
          <div className="flex flex-col gap-3">
            <p className={labelClass}>Bets</p>
            {form.bets.map((bet, idx) => (
              <div
                key={idx}
                className="flex flex-wrap gap-2 items-end rounded-lg border border-gray-600 bg-gray-900 p-3"
              >
                {/* Strategy */}
                <div className="flex-1 min-w-[120px]">
                  <label className={labelClass}>Strategy</label>
                  <select
                    className={selectClass}
                    value={bet.strategy}
                    onChange={(e) =>
                      updateBet(idx, { strategy: e.target.value as StrategyName })
                    }
                  >
                    <option value="martingale">Martingale</option>
                    <option value="fibonacci">Fibonacci</option>
                    <option value="dalembert">D&apos;Alembert</option>
                    <option value="flat">Flat</option>
                  </select>
                </div>

                {/* Bet kind */}
                <div className="flex-1 min-w-[130px]">
                  <label className={labelClass}>Bet kind</label>
                  <select
                    className={selectClass}
                    value={bet.kind}
                    onChange={(e) => {
                      const kind = e.target.value as BetKind;
                      updateBet(idx, {
                        kind,
                        number: kind === 'straight' ? (bet.number ?? 0) : undefined,
                      });
                    }}
                  >
                    {ALL_BET_KINDS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Straight number (only shown when kind=straight) */}
                {bet.kind === 'straight' && (
                  <div className="w-20">
                    <label className={labelClass}>Number</label>
                    <input
                      type="number"
                      min={0}
                      max={37}
                      className={inputClass + ' w-full'}
                      value={bet.number ?? 0}
                      onChange={(e) =>
                        updateBet(idx, { number: Math.min(37, Math.max(0, Number(e.target.value))) })
                      }
                    />
                  </div>
                )}

                {/* Per-bet base unit override */}
                <div className="w-24">
                  <label className={labelClass}>Unit ($)</label>
                  <input
                    type="number"
                    min={1}
                    placeholder={String(form.baseUnit)}
                    className={inputClass + ' w-full'}
                    value={bet.baseUnit ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : Number(e.target.value);
                      updateBet(idx, { baseUnit: val });
                    }}
                  />
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeBet(idx)}
                  disabled={form.bets.length === 1}
                  className="px-3 py-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-red-700 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Remove this bet"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={addBet}
              className="self-start rounded-lg border border-dashed border-gray-500 px-4 py-2 text-sm text-gray-400 hover:border-indigo-400 hover:text-indigo-400 transition-colors"
            >
              + Add bet
            </button>
          </div>

          {/* Global options */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 pt-2 border-t border-gray-700">
            {/* Wheel */}
            <div>
              <label className={labelClass}>Wheel</label>
              <select
                className={selectClass}
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
              <label className={labelClass}>Bankroll ($)</label>
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

            {/* Run button */}
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
      )}

      {/* ── Visual builder ── */}
      {mode === 'blockly' && (
        <section className="w-full max-w-5xl flex flex-col gap-4">
          <BlocklyBuilder onChange={(json) => { blocklyJsonRef.current = json; }} />

          {/* Global options for visual builder (same sim params) */}
          <div className="rounded-xl border border-gray-700 bg-gray-800 px-6 py-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Wheel</label>
                <select
                  className={selectClass}
                  value={form.wheelType}
                  onChange={(e) => set('wheelType', e.target.value as WheelType)}
                >
                  <option value="european">European</option>
                  <option value="american">American</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Seed</label>
                <input
                  type="number"
                  className={inputClass + ' w-full'}
                  value={form.seed}
                  onChange={(e) => set('seed', Number(e.target.value))}
                />
              </div>
              <div>
                <label className={labelClass}>Bankroll ($)</label>
                <input
                  type="number"
                  min={1}
                  className={inputClass + ' w-full'}
                  value={form.startingBankroll}
                  onChange={(e) => set('startingBankroll', Number(e.target.value))}
                />
              </div>
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
              <div className="flex items-end sm:col-span-2">
                <button
                  onClick={handleRun}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
                >
                  Run simulation
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

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

      {/* ── Per-spin results table (single-run, last 50 spins) ── */}
      {committed.runs <= 1 && singleResult !== null && spinTableData.length > 0 && (
        <section className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-800 px-4 py-5">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">
            Spin history (last {spinTableData.length} spins)
          </p>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-gray-800">
                <tr className="text-xs uppercase tracking-widest text-gray-400 border-b border-gray-700">
                  <th className="py-2 pr-3 text-left">Spin</th>
                  <th className="py-2 pr-3 text-left">Pocket</th>
                  <th className="py-2 pr-3 text-left">Color</th>
                  <th className="py-2 pr-3 text-right">Stake</th>
                  <th className="py-2 pr-3 text-right">P&amp;L</th>
                  <th className="py-2 text-right">Bankroll</th>
                </tr>
              </thead>
              <tbody>
                {spinTableData.map((row) => (
                  <tr
                    key={row.spinIndex}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="py-1.5 pr-3 text-gray-400 font-mono">{row.spinIndex}</td>
                    <td className="py-1.5 pr-3 font-mono font-semibold text-white">
                      {row.label}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <ColorDot color={row.color} />
                        <span className="text-gray-300 capitalize">{row.color}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-gray-300">
                      {row.totalStake.toFixed(2)}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right font-mono font-semibold ${
                        row.netPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {row.netPnl >= 0 ? '+' : ''}
                      {row.netPnl.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-white">
                      {row.bankrollAfter.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function ColorDot({ color }: { color: 'red' | 'black' | 'green' }) {
  const bg =
    color === 'red'
      ? 'bg-red-500'
      : color === 'black'
      ? 'bg-gray-900 border border-gray-500'
      : 'bg-green-500';
  return <span className={`inline-block w-3 h-3 rounded-full ${bg}`} />;
}
