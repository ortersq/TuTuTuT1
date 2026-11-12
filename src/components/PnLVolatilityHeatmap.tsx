import React, { useState, useMemo } from 'react';
import { BotTradeRecord } from '../server/botEngine';
import {
  HeatmapCellData,
  HeatmapOptions,
  VolatilityLevel,
  HeatmapSampleTrade,
  aggregateHeatmapData,
  calculateHeatmapSummary,
  VOLATILITY_LEVELS,
  VOLATILITY_META,
  SESSIONS_META,
} from '../utils/heatmapAggregator';
import {
  Flame,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Clock,
  Compass,
  Zap,
  Crosshair,
  ArrowRight,
  Info,
  Sliders,
  DollarSign,
  Activity,
} from 'lucide-react';

interface PnLVolatilityHeatmapProps {
  closedTrades: BotTradeRecord[];
  monitoredSymbols?: string[];
}

export const PnLVolatilityHeatmap: React.FC<PnLVolatilityHeatmapProps> = ({
  closedTrades = [],
  monitoredSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [selectedInterval, setSelectedInterval] = useState<string>('ALL');
  const [timezoneOffset, setTimezoneOffset] = useState<number>(0); // 0 = UTC, 8 = UTC+8
  const [heatmapMode, setHeatmapMode] = useState<'reversion' | 'pnl' | 'winrate'>('reversion');
  const [selectedCell, setSelectedCell] = useState<HeatmapCellData | null>(null);

  // Compute heatmap grid & summary
  const options: HeatmapOptions = useMemo(
    () => ({
      symbol: selectedSymbol,
      interval: selectedInterval,
      timezoneOffsetHours: timezoneOffset,
    }),
    [selectedSymbol, selectedInterval, timezoneOffset]
  );

  const matrix = useMemo(() => aggregateHeatmapData(closedTrades, options), [closedTrades, options]);
  const summary = useMemo(() => calculateHeatmapSummary(matrix), [matrix]);

  // Default select the worst reversion cell on initial mount if not selected
  const activeCell = useMemo(() => {
    if (selectedCell) return selectedCell;
    // Find cell with highest severity score
    let worstCell: HeatmapCellData | null = null;
    let maxSev = -1;
    for (const row of matrix) {
      for (const cell of row) {
        if (cell.reversionSeverityScore > maxSev) {
          maxSev = cell.reversionSeverityScore;
          worstCell = cell;
        }
      }
    }
    return worstCell || matrix[0][14];
  }, [selectedCell, matrix]);

  // Color generator for heatmap cells
  const getCellBgColor = (cell: HeatmapCellData) => {
    if (heatmapMode === 'reversion') {
      const score = cell.reversionSeverityScore;
      if (score >= 80) return 'bg-rose-600/90 text-white font-bold border-rose-400 shadow-rose-900/40';
      if (score >= 65) return 'bg-rose-500/70 text-rose-100 font-semibold border-rose-500/60';
      if (score >= 45) return 'bg-amber-500/60 text-amber-100 border-amber-500/50';
      if (score >= 25) return 'bg-slate-800 text-slate-300 border-slate-700';
      return 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40';
    }

    if (heatmapMode === 'pnl') {
      if (cell.avgNetPnl >= 15) return 'bg-emerald-600/90 text-white font-bold border-emerald-400';
      if (cell.avgNetPnl > 0) return 'bg-emerald-500/50 text-emerald-100 border-emerald-500/50';
      if (cell.avgNetPnl === 0) return 'bg-slate-800 text-slate-400 border-slate-700';
      if (cell.avgNetPnl > -15) return 'bg-rose-500/50 text-rose-100 border-rose-500/50';
      return 'bg-rose-700/90 text-white font-bold border-rose-400';
    }

    // Win Rate mode
    if (cell.winRate >= 65) return 'bg-emerald-600/90 text-white font-bold border-emerald-400';
    if (cell.winRate >= 50) return 'bg-cyan-600/60 text-cyan-100 border-cyan-500/50';
    if (cell.winRate >= 40) return 'bg-amber-600/50 text-amber-100 border-amber-500/50';
    return 'bg-rose-600/70 text-white border-rose-500/60';
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Executive Problem Framing */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Flame className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>波动率与利润回吐多维热力图 (PnL Volatility & Reversion Matrix)</span>
                </h2>
                <div className="text-xs text-slate-400">
                  深度复盘「盈利达 +$30~+$80 却最终回吐倒亏 -$30」的时段特征与波动诱因，匹配最优止损防御形态
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Mode & Timezone Switcher */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Heatmap Dimension Mode */}
            <div className="flex items-center bg-[#0b0e14] border border-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setHeatmapMode('reversion')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  heatmapMode === 'reversion'
                    ? 'bg-rose-500 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🔥 回吐重灾区
              </button>
              <button
                onClick={() => setHeatmapMode('pnl')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  heatmapMode === 'pnl'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                💰 净盈亏分布
              </button>
              <button
                onClick={() => setHeatmapMode('winrate')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  heatmapMode === 'winrate'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎯 调单胜率
              </button>
            </div>

            {/* Timezone Switcher */}
            <div className="flex items-center bg-[#0b0e14] border border-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setTimezoneOffset(0)}
                className={`px-2.5 py-1 rounded-lg ${
                  timezoneOffset === 0
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                UTC
              </button>
              <button
                onClick={() => setTimezoneOffset(8)}
                className={`px-2.5 py-1 rounded-lg ${
                  timezoneOffset === 8
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                北京时间 (UTC+8)
              </button>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">筛选币种:</span>
            <div className="flex items-center gap-1.5">
              {['ALL', ...monitoredSymbols].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition-all ${
                    selectedSymbol === sym
                      ? 'bg-slate-700 text-amber-400 border-amber-500/50 font-bold'
                      : 'bg-[#0b0e14] text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {sym === 'ALL' ? '全部币种' : sym.replace('USDT', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">K线周期:</span>
            <div className="flex items-center gap-1.5">
              {['ALL', '5m', '15m', '30m'].map((itv) => (
                <button
                  key={itv}
                  onClick={() => setSelectedInterval(itv)}
                  className={`px-2.5 py-1 rounded-lg border font-mono transition-all ${
                    selectedInterval === itv
                      ? 'bg-slate-700 text-cyan-400 border-cyan-500/50 font-bold'
                      : 'bg-[#0b0e14] text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {itv === 'ALL' ? '全部周期' : itv}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Analytical Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-rose-400" />
            <span>回吐最频发时段</span>
          </div>
          <div className="text-base font-bold text-rose-400 font-mono mt-1">
            {summary.highestReversionHour.toString().padStart(2, '0')}:00{' '}
            <span className="text-xs text-slate-300 font-sans font-normal">
              ({summary.highestReversionSession})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">美盘开盘剧烈插针，极易吞没已有浮盈</div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>最脆弱波动层级</span>
          </div>
          <div className="text-base font-bold text-amber-400 mt-1">
            {VOLATILITY_META[summary.mostVulnerableVolatilityLevel].label.split(' ')[0]}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {VOLATILITY_META[summary.mostVulnerableVolatilityLevel].range}，单根大阴阳线洗盘
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>盘中平均回吐比例</span>
          </div>
          <div className="text-base font-bold text-slate-100 font-mono mt-1">
            {summary.avgReversionRatePercent}%
          </div>
          <div className="text-[11px] text-rose-400/90 mt-1">
            累计浮盈回吐总额: -${summary.totalReversionUsdt.toLocaleString()}
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>阶梯保本可挽回利润</span>
          </div>
          <div className="text-base font-bold text-emerald-400 font-mono mt-1">
            +${summary.estimatedSalvagedPnlWithBreakevenLock.toLocaleString()} USDT
          </div>
          <div className="text-[11px] text-slate-400 mt-1">启用浮盈 +$25 保本锁定与 0.45% 移动止盈</div>
        </div>
      </div>

      {/* 3. The 24x4 Heatmap Matrix Grid */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Heatmap Legend & Session Bands */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">
              市场时区交易时段 (Trading Sessions - {timezoneOffset === 0 ? 'UTC' : 'UTC+8'}):
            </span>
            <div className="flex items-center gap-3 text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> 亚洲盘 (00-08)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> 伦敦盘 (08-13)
              </span>
              <span className="flex items-center gap-1 font-semibold text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> 纽约主战区 (13-18 高危)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-500" /> 美盘结算 (18-24)
              </span>
            </div>
          </div>

          {/* Color Scale Legend */}
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-slate-400">
              {heatmapMode === 'reversion'
                ? '回吐严重度:'
                : heatmapMode === 'pnl'
                ? '盈亏金额:'
                : '胜率:'}
            </span>
            <div className="flex items-center gap-1">
              {heatmapMode === 'reversion' ? (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-900/40">
                    良性锁定
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/60 text-amber-100">中度回撤</span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-600/90 text-white font-bold">
                    重灾回吐
                  </span>
                </>
              ) : heatmapMode === 'pnl' ? (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-rose-700 text-white">大亏</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">平衡</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white">大盈</span>
                </>
              ) : (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">&lt;40%</span>
                  <span className="px-1.5 py-0.5 rounded bg-cyan-600 text-white">50%~60%</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white">&gt;65%</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Grid Scrollable Wrapper */}
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[980px] space-y-1.5">
            {/* Hour Header Bar */}
            <div className="grid grid-cols-[160px_repeat(24,1fr)] gap-1 text-[11px] font-mono text-center text-slate-400">
              <div className="text-left font-semibold text-slate-300 pl-2">波动区间 \ 时点</div>
              {Array.from({ length: 24 }).map((_, h) => {
                const isPeakReversionZone = h >= 13 && h <= 17;
                return (
                  <div
                    key={h}
                    className={`py-1 rounded font-semibold ${
                      isPeakReversionZone
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-800/40'
                    }`}
                  >
                    {h.toString().padStart(2, '0')}
                  </div>
                );
              })}
            </div>

            {/* Matrix Rows */}
            {matrix.map((row, rowIndex) => {
              const vol = VOLATILITY_LEVELS[rowIndex];
              const meta = VOLATILITY_META[vol];

              return (
                <div key={vol} className="grid grid-cols-[160px_repeat(24,1fr)] gap-1">
                  {/* Row Header Label */}
                  <div className="bg-[#0b0e14] border border-slate-800/90 rounded-lg p-2 flex flex-col justify-center">
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span>{meta.label.split(' ')[0]}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{meta.range}</div>
                  </div>

                  {/* 24 Heat Cells */}
                  {row.map((cell) => {
                    const isSelected =
                      activeCell?.hour === cell.hour &&
                      activeCell?.volatilityLevel === cell.volatilityLevel;
                    const cellStyle = getCellBgColor(cell);

                    return (
                      <button
                        key={cell.hour}
                        onClick={() => setSelectedCell(cell)}
                        className={`h-14 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer relative group ${cellStyle} ${
                          isSelected
                            ? 'ring-2 ring-amber-400 scale-[1.03] z-10 shadow-lg'
                            : 'hover:scale-[1.02] hover:z-5'
                        }`}
                        title={`时点 ${cell.hour}:00 | 波动: ${meta.label}\n平均净盈亏: $${cell.avgNetPnl} USDT\n平均冲高浮盈: +$${cell.avgPeakPnl} USDT\n平均回吐: -$${cell.avgReversion} USDT\n调单次数: ${cell.tradesCount} 笔`}
                      >
                        {heatmapMode === 'reversion' && (
                          <>
                            <span className="text-[11px] font-mono font-bold leading-none">
                              -${Math.round(cell.avgReversion)}
                            </span>
                            <span className="text-[9px] opacity-80 font-mono mt-0.5">
                              峰+${Math.round(cell.avgPeakPnl)}
                            </span>
                            <span className="text-[8px] opacity-70 font-mono leading-none">
                              {cell.tradesCount}单
                            </span>
                          </>
                        )}

                        {heatmapMode === 'pnl' && (
                          <>
                            <span className="text-[11px] font-mono font-bold leading-none">
                              {cell.avgNetPnl >= 0 ? '+' : ''}${Math.round(cell.avgNetPnl)}
                            </span>
                            <span className="text-[9px] opacity-80 font-mono mt-0.5">
                              胜率{cell.winRate.toFixed(0)}%
                            </span>
                            <span className="text-[8px] opacity-70 font-mono leading-none">
                              {cell.tradesCount}单
                            </span>
                          </>
                        )}

                        {heatmapMode === 'winrate' && (
                          <>
                            <span className="text-[11px] font-mono font-bold leading-none">
                              {cell.winRate.toFixed(0)}%
                            </span>
                            <span className="text-[9px] opacity-80 font-mono mt-0.5">
                              {cell.winningTrades}胜/{cell.losingTrades}负
                            </span>
                            <span className="text-[8px] opacity-70 font-mono leading-none">
                              {cell.tradesCount}单
                            </span>
                          </>
                        )}

                        {/* Top corner indicator if high reversion severity */}
                        {cell.reversionSeverityScore >= 75 && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>点击热力图中任意方格，即可在下方查看该时段的具体诱因、调单样本及最优止损形态配置</span>
          </span>
          <span className="font-mono text-slate-500">
            总统计样本: {summary.totalAnalyzedTrades} 笔调单 | 全天 24h × 4 层级全域覆盖
          </span>
        </div>
      </div>

      {/* 4. Selected Cell Deep Dive & Optimal Stop-Loss Prescription */}
      {activeCell && (
        <div className="bg-[#111726] border border-amber-500/50 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold font-mono">
                {activeCell.hour.toString().padStart(2, '0')}:00
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>
                    时段深剖: {activeCell.hour.toString().padStart(2, '0')}:00 ~ {(activeCell.hour + 1).toString().padStart(2, '0')}:00 (
                    {VOLATILITY_META[activeCell.volatilityLevel as VolatilityLevel]?.label || activeCell.volatilityLevel})
                  </span>
                  {activeCell.reversionSeverityScore >= 75 && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40">
                      ⚠️ 利润回吐重灾区
                    </span>
                  )}
                </h3>
                <div className="text-xs text-slate-400">
                  {VOLATILITY_META[activeCell.volatilityLevel as VolatilityLevel]?.desc || ''}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="bg-[#0b0e14] px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
                <span className="text-slate-400">调单样本: </span>
                <span className="text-slate-100 font-bold">{activeCell.tradesCount} 笔</span>
              </div>
              <div className="bg-[#0b0e14] px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
                <span className="text-slate-400">胜率: </span>
                <span className="text-amber-400 font-bold">{activeCell.winRate}%</span>
              </div>
            </div>
          </div>

          {/* Metric Comparison in Selected Cell */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3">
              <div className="text-slate-400 font-medium">盘中平均冲高浮盈 (Peak PnL)</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                +${activeCell.avgPeakPnl.toFixed(2)} USDT
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                行情顺势启动时，持仓曾轻松盈利到该数值
              </div>
            </div>

            <div className="bg-[#0b0e14] border border-rose-500/30 rounded-xl p-3 bg-rose-500/5">
              <div className="text-rose-300 font-medium">冲高后平均回吐金额 (Profit Given Back)</div>
              <div className="text-lg font-bold font-mono text-rose-400 mt-1">
                -${activeCell.avgReversion.toFixed(2)} USDT
              </div>
              <div className="text-[11px] text-rose-400/80 mt-0.5">
                回吐比率高达{' '}
                {activeCell.avgPeakPnl > 0
                  ? ((activeCell.avgReversion / activeCell.avgPeakPnl) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>

            <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3">
              <div className="text-slate-400 font-medium">最终结算净盈亏 (Final Net PnL)</div>
              <div
                className={`text-lg font-bold font-mono mt-1 ${
                  activeCell.avgNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activeCell.avgNetPnl >= 0 ? '+' : ''}${activeCell.avgNetPnl.toFixed(2)} USDT
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                若缺乏防守，原有暴利单将在插针中倒亏平仓
              </div>
            </div>
          </div>

          {/* Optimal Stop-Loss Prescription Recommendation */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
              <span>针对此波动区间的最优止损/止盈形态策略 (Optimal Stop-Loss Prescription):</span>
            </div>
            <div className="text-sm font-bold text-slate-100 pl-7">
              {activeCell.optimalStopLossPattern}
            </div>
            <div className="text-xs text-slate-300 pl-7 leading-relaxed">
              {activeCell.optimalStopLossDetails}
            </div>
          </div>

          {/* Sample Trades in Selected Cell */}
          <div className="space-y-2 pt-1">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>该区间调单样本明细 ({activeCell.sampleTrades.length} 笔)</span>
              <span className="text-[11px] text-slate-500 font-normal">
                展示实盘/模拟观测在此环境下的订单轨迹
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#0b0e14] text-slate-400 border-b border-slate-800 font-mono">
                  <tr>
                    <th className="py-2 px-3">币种/周期</th>
                    <th className="py-2 px-3">方向</th>
                    <th className="py-2 px-3">形态名称</th>
                    <th className="py-2 px-3 text-right">开仓价</th>
                    <th className="py-2 px-3 text-right">平仓价</th>
                    <th className="py-2 px-3 text-right">盘中最高浮盈</th>
                    <th className="py-2 px-3 text-right">回吐金额</th>
                    <th className="py-2 px-3 text-right">最终净盈亏</th>
                    <th className="py-2 px-3 text-center">平仓诱因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {activeCell.sampleTrades.map((trade: HeatmapSampleTrade) => (
                    <tr key={trade.id} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-bold text-slate-300">
                        {trade.symbol} ({trade.interval})
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                            trade.side === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-200">{trade.patternName}</td>
                      <td className="py-2 px-3 text-right text-slate-400">${trade.entryPrice}</td>
                      <td className="py-2 px-3 text-right text-slate-200">${trade.exitPrice}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                        +${trade.peakPnl.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-rose-400 font-bold">
                        {trade.reversionUsdt > 0 ? `-$${trade.reversionUsdt.toFixed(2)}` : '$0.00'}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          trade.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(2)} USDT
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {trade.exitReason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Four Optimal Stop-Loss Pattern Archetypes Matrix (System Strategy Knowledge Base) */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">
              全域止损与锁利形态配置指南 (Optimal Stop-Loss Archetypes)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            已完全植入底层交易引擎并全自动执行
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Card 1 */}
          <div className="bg-[#0b0e14] border border-rose-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4" /> 1. 阶梯保本锁定 + 0.45% 紧敏移动追踪
              </span>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-mono">
                适用: 极高波动 / 美盘插针
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              <strong>解决痛点</strong>：杜绝「浮盈 +$30~+$80 倒亏 -$30」。当浮盈突破 <strong>+$25</strong> 时，止损自动提升至本金之上；浮盈突破 <strong>+$50</strong> 时锁定 65% 净利润；回撤超 0.45% 果断离场。
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-[#0b0e14] border border-amber-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4" /> 2. ATR 动态缓冲止损 + 2.2x~2.5x 盈亏比
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                适用: 较高波动 / 欧盘单边
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              <strong>解决痛点</strong>：避免在真实主升浪启动前的轻微洗盘中被过早洗出。基于当前 14 根 K 线的 ATR 乘以 1.8x 作为缓冲区，同时在达到 2.2x 目标价位时全额结构止盈。
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-[#0b0e14] border border-cyan-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> 3. 50 EMA 趋势防守线 + 形态推演失效退出
              </span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-mono">
                适用: 标准波动 / 趋势通道
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              <strong>解决痛点</strong>：不单纯依赖固定点数或时间。Al Brooks H2 多头若跌破 50EMA 即视为逻辑证伪；只要 50EMA 多头发散未破，允许顺势冲刺更高目标。
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-[#0b0e14] border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> 4. 动能衰竭限时平仓 (Momentum Decay Exit)
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono">
                适用: 低波动 / 亚盘横盘
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              <strong>解决痛点</strong>：解决久盘不涨或长期死扛占用资金。5m/15m/30m 周期下持仓超 2.0h/6.0h/12.0h 且浮盈不足 0.5% 时，主动平仓释放保证金，但若顺势大盈利则自动豁免！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
