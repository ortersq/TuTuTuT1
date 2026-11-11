import React from 'react';
import { StrategyKey } from '../types/trading';
import { STRATEGY_CATALOG } from '../utils/strategies';

interface ToolbarProps {
  symbol: string;
  setSymbol: (s: string) => void;
  interval: string;
  setInterval: (i: string) => void;
  candleCount: number;
  setCandleCount: (c: number) => void;
  selectedStrategy: StrategyKey;
  setSelectedStrategy: (s: StrategyKey) => void;
  leverage: number;
  setLeverage: (l: number) => void;
  initialCapital: number;
  setInitialCapital: (c: number) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'DOGEUSDT'];
const INTERVALS = ['15m', '1h', '4h', '1d'];
const CANDLE_OPTIONS = [300, 500, 1000];
const LEVERAGE_OPTIONS = [1, 3, 5, 10, 20];

export const Toolbar: React.FC<ToolbarProps> = ({
  symbol,
  setSymbol,
  interval,
  setInterval,
  candleCount,
  setCandleCount,
  selectedStrategy,
  setSelectedStrategy,
  leverage,
  setLeverage,
  initialCapital,
  setInitialCapital,
  onRefresh,
  isLoading,
}) => {
  return (
    <div className="bg-[#0b0e17] border-b border-slate-800/80 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
      {/* Left section: Symbol & Timeframe */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Symbol Selector */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <span className="text-slate-400 font-medium px-2 py-0.5">币对:</span>
          {POPULAR_SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSymbol(s);
              }}
              className={`px-2.5 py-1 rounded-md font-mono font-medium transition-colors cursor-pointer ${
                symbol === s
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {s.replace('USDT', '')}
            </button>
          ))}
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="自定义"
            className="w-20 px-2 py-1 bg-slate-800/80 border border-slate-700 rounded text-slate-200 font-mono text-center focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Timeframe */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <span className="text-slate-400 font-medium px-2 py-0.5">周期:</span>
          {INTERVALS.map((intv) => (
            <button
              key={intv}
              onClick={() => setInterval(intv)}
              className={`px-2.5 py-1 rounded-md font-mono transition-colors cursor-pointer ${
                interval === intv
                  ? 'bg-slate-700 text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {intv}
            </button>
          ))}
        </div>

        {/* Candle Count */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <span className="text-slate-400 font-medium px-2 py-0.5">K线条数:</span>
          {CANDLE_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCandleCount(c)}
              className={`px-2 py-1 rounded-md font-mono transition-colors cursor-pointer ${
                candleCount === c
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c}根
            </button>
          ))}
        </div>
      </div>

      {/* Right section: Strategy selector & Leverage */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Active Strategy Selector */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="strategy-select" className="text-slate-400 font-medium">当前策略:</label>
          <select
            id="strategy-select"
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value as StrategyKey)}
            className="bg-slate-900 border border-amber-500/40 text-amber-300 font-medium px-3 py-1.5 rounded-lg focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            {STRATEGY_CATALOG.map((s) => (
              <option key={s.key} value={s.key} className="bg-slate-900 text-slate-200">
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Leverage */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
          <span className="text-slate-400 font-medium px-2 py-0.5">杠杆:</span>
          {LEVERAGE_OPTIONS.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className={`px-2 py-1 rounded-md font-mono transition-colors cursor-pointer ${
                leverage === lev
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lev}x
            </button>
          ))}
        </div>

        {/* Capital */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1">
          <span className="text-slate-400">本金:</span>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Math.max(100, Number(e.target.value)))}
            className="w-20 bg-transparent text-slate-200 font-mono text-right focus:outline-none"
          />
          <span className="text-slate-500 font-mono">U</span>
        </div>
      </div>
    </div>
  );
};
