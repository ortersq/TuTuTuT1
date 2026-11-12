import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Activity, ShieldAlert, ArrowUpRight, ArrowDownRight, Maximize2, Zap } from 'lucide-react';
import { LiveEquityPoint } from '../types/trading';

interface LiveEquityChartProps {
  equityHistory: LiveEquityPoint[];
  peakEquity?: number;
  currentEquity?: number;
  currentBalance?: number;
}

export const LiveEquityChart: React.FC<LiveEquityChartProps> = ({
  equityHistory = [],
  peakEquity = 10000,
  currentEquity = 10000,
  currentBalance = 10000,
}) => {
  const [viewMode, setViewMode] = useState<'both' | 'equity' | 'pnl'>('both');

  // Compute key metrics over the history window
  const stats = useMemo(() => {
    if (!equityHistory || equityHistory.length === 0) {
      return {
        maxPnl: 0,
        minPnl: 0,
        currentPnl: 0,
        pnlRetracement: 0,
        maxEquityInWindow: currentEquity,
        minEquityInWindow: currentEquity,
        pointsCount: 0,
      };
    }

    let maxPnl = -Infinity;
    let minPnl = Infinity;
    let maxEq = -Infinity;
    let minEq = Infinity;

    for (const pt of equityHistory) {
      if (pt.unrealizedPnl > maxPnl) maxPnl = pt.unrealizedPnl;
      if (pt.unrealizedPnl < minPnl) minPnl = pt.unrealizedPnl;
      if (pt.equity > maxEq) maxEq = pt.equity;
      if (pt.equity < minEq) minEq = pt.equity;
    }

    const latest = equityHistory[equityHistory.length - 1];
    const currentPnl = latest ? latest.unrealizedPnl : 0;
    const pnlRetracement = maxPnl > 0 && currentPnl < maxPnl ? maxPnl - currentPnl : 0;

    return {
      maxPnl: maxPnl === -Infinity ? 0 : maxPnl,
      minPnl: minPnl === Infinity ? 0 : minPnl,
      currentPnl,
      pnlRetracement,
      maxEquityInWindow: maxEq === -Infinity ? currentEquity : maxEq,
      minEquityInWindow: minEq === Infinity ? currentEquity : minEq,
      pointsCount: equityHistory.length,
    };
  }, [equityHistory, currentEquity]);

  // Format tick labels
  const formatTimeTick = (timeStr: string) => {
    if (!timeStr) return '';
    // Format HH:mm:ss to HH:mm
    const parts = timeStr.split(':');
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : timeStr;
  };

  const hasData = equityHistory && equityHistory.length > 1;

  // Custom Tooltip
  const renderCustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data: LiveEquityPoint = payload[0].payload;
    const isPnlPositive = data.unrealizedPnl >= 0;

    return (
      <div className="bg-[#0b0e14]/95 border border-slate-700/80 rounded-lg p-3 shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[200px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400 font-mono">
          <span>采样时间</span>
          <span className="text-slate-200 font-semibold">{data.time}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-amber-400 flex items-center gap-1 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            账户净值
          </span>
          <span className="font-mono font-bold text-slate-100">
            ${data.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">可用本金</span>
          <span className="font-mono text-slate-300">
            ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className={isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}>
            实时未结浮盈
          </span>
          <span
            className={`font-mono font-bold ${
              isPnlPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPnlPositive ? '+' : ''}${data.unrealizedPnl.toFixed(2)} USDT
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
          <span>活跃开仓中</span>
          <span className="font-mono text-cyan-400">{data.activePositionsCount} 笔订单</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* Chart Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">
              实时净值与浮盈脉冲曲线 (Live PnL & Equity Tracking)
            </h3>
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              10s 动态追踪
            </span>
          </div>
          <p className="text-xs text-slate-400">
            实时可视观测市场急拉、插针波动及浮盈回吐过程，验证多阶段高灵敏锁利防守机制
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-[#0b0e14] border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setViewMode('both')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              viewMode === 'both'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            双轴同显 (净值+浮盈)
          </button>
          <button
            onClick={() => setViewMode('equity')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              viewMode === 'equity'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            仅净值走势
          </button>
          <button
            onClick={() => setViewMode('pnl')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              viewMode === 'pnl'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            仅实时浮动盈亏
          </button>
        </div>
      </div>

      {/* Real-time Indicator Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">当前净值 (Equity)</div>
          <div className="text-base font-bold font-mono text-amber-400 mt-1">
            ${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            本金: ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">历史峰值净值 (Peak)</div>
          <div className="text-base font-bold font-mono text-cyan-400 mt-1">
            ${peakEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            距最高点回撤:{' '}
            <span className="text-rose-400 font-mono">
              {peakEquity > 0 ? (((peakEquity - currentEquity) / peakEquity) * 100).toFixed(2) : 0}%
            </span>
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">窗口最高浮盈 (Max Spike)</div>
          <div className="text-base font-bold font-mono text-emerald-400 mt-1 flex items-center gap-1">
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            +${stats.maxPnl.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            当前浮动盈亏:{' '}
            <span
              className={`font-mono font-semibold ${
                stats.currentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.currentPnl >= 0 ? '+' : ''}${stats.currentPnl.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">浮盈回撤监测 (Retracement)</div>
          <div
            className={`text-base font-bold font-mono mt-1 ${
              stats.pnlRetracement > 20 ? 'text-rose-400' : 'text-slate-300'
            }`}
          >
            {stats.pnlRetracement > 0 ? `-$${stats.pnlRetracement.toFixed(2)}` : '$0.00'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {stats.pnlRetracement > 20 ? (
              <span className="text-amber-400 font-medium">⚠️ 触发防回吐追踪线</span>
            ) : (
              <span className="text-emerald-400 font-medium">✓ 利润防守保护正常</span>
            )}
          </div>
        </div>
      </div>

      {/* Profit Spikes & Reversion Diagnostic Alert Banner */}
      {stats.maxPnl >= 25 && stats.pnlRetracement >= 15 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-300">
              📊 捕捉到盘中浮盈波动回吐事件 (Spike & Reversion Detected)
            </div>
            <div className="text-slate-300">
              当前持仓浮盈曾冲高至 <strong className="text-emerald-300">+${stats.maxPnl.toFixed(2)} USDT</strong>，随后随盘面插针回撤了 <strong className="text-rose-300">${stats.pnlRetracement.toFixed(2)} USDT</strong>。
              系统现已升级<strong>阶梯式保本止盈 (Breakeven Lock) 与 0.45% 敏捷移动追踪</strong>，一旦浮盈突破 1.0% 即刻上提止损线锁利，防止利润全部回吐转负！
            </div>
          </div>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="w-full h-72 pt-2">
        {!hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-[#0b0e14]/50">
            <Activity className="w-6 h-6 text-amber-500/60 animate-pulse mb-2" />
            <div className="text-xs text-slate-400">正在持续收集 10s 实时净值与浮盈脉冲采样...</div>
            <div className="text-[11px] text-slate-600 mt-1">系统已启动，随着市场行情计算将自动绘制走势曲线</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={equityHistory}
              margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" opacity={0.6} />

              <XAxis
                dataKey="time"
                tickFormatter={formatTimeTick}
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={35}
              />

              {/* Left Y-Axis: Account Equity */}
              {(viewMode === 'both' || viewMode === 'equity') && (
                <YAxis
                  yAxisId="equity"
                  orientation="left"
                  stroke="#f59e0b"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#d97706', fontSize: 11 }}
                  tickFormatter={(val: number) => `$${Math.round(val)}`}
                />
              )}

              {/* Right Y-Axis: Unrealized PnL */}
              {(viewMode === 'both' || viewMode === 'pnl') && (
                <YAxis
                  yAxisId="pnl"
                  orientation="right"
                  stroke="#10b981"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#10b981', fontSize: 11 }}
                  tickFormatter={(val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}`}
                />
              )}

              <Tooltip content={renderCustomTooltip} />

              {/* Peak Equity Reference Line */}
              {peakEquity > 0 && (viewMode === 'both' || viewMode === 'equity') && (
                <ReferenceLine
                  yAxisId="equity"
                  y={peakEquity}
                  stroke="#06b6d4"
                  strokeDasharray="4 4"
                  label={{
                    value: `历史峰值 $${peakEquity.toFixed(1)}`,
                    fill: '#06b6d4',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              )}

              {/* Zero PnL Reference Line */}
              {(viewMode === 'both' || viewMode === 'pnl') && (
                <ReferenceLine
                  yAxisId="pnl"
                  y={0}
                  stroke="#475569"
                  strokeDasharray="2 2"
                />
              )}

              {/* Equity Line */}
              {(viewMode === 'both' || viewMode === 'equity') && (
                <Line
                  yAxisId="equity"
                  type="monotone"
                  dataKey="equity"
                  name="账户净值 (USDT)"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}

              {/* Unrealized PnL Line */}
              {(viewMode === 'both' || viewMode === 'pnl') && (
                <Line
                  yAxisId="pnl"
                  type="monotone"
                  dataKey="unrealizedPnl"
                  name="实时浮盈 (USDT)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Footer with Legibility Guides */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" />
            <span className="text-slate-300">账户净值曲线</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" />
            <span className="text-slate-300">实时持仓浮盈</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-b border-dashed border-cyan-400 inline-block" />
            <span className="text-slate-300">历史最高净值防线</span>
          </div>
        </div>

        <div className="text-slate-500 font-mono">
          采样窗口: {equityHistory.length} 点 (最近 {Math.round((equityHistory.length * 10) / 60)} 分钟)
        </div>
      </div>
    </div>
  );
};
