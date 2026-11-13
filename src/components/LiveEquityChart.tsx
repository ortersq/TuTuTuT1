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
import { TrendingUp, Activity, ShieldAlert, ArrowUpRight, RefreshCw } from 'lucide-react';
import { LiveEquityPoint, LiveAccountSyncInfo } from '../types/trading';
import type { ActivePosition } from '../server/botEngine';

interface LiveEquityChartProps {
  equityHistory: LiveEquityPoint[];
  peakEquity?: number;
  currentEquity?: number;
  currentBalance?: number;
  hasBinanceKeys?: boolean;
  liveSyncInfo?: LiveAccountSyncInfo | null;
  activePositions?: ActivePosition[];
  onSyncLive?: () => Promise<void> | void;
}

export const LiveEquityChart: React.FC<LiveEquityChartProps> = ({
  equityHistory = [],
  peakEquity = 0,
  currentEquity = 0,
  currentBalance = 0,
  hasBinanceKeys = false,
  liveSyncInfo = null,
  activePositions = [],
  onSyncLive,
}) => {
  const [viewMode, setViewMode] = useState<'both' | 'equity' | 'pnl'>('both');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const handleManualSync = async () => {
    if (!onSyncLive || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSyncLive();
    } finally {
      setIsSyncing(false);
    }
  };

  const isLiveSynced = Boolean(hasBinanceKeys && liveSyncInfo?.syncOk);
  const authoritativeEquity = isLiveSynced ? liveSyncInfo!.marginBalance : currentEquity;
  const authoritativeWalletOrBalance = isLiveSynced
    ? liveSyncInfo!.walletBalance
    : currentBalance;
  const authoritativeAvailable = isLiveSynced
    ? liveSyncInfo!.availableBalance
    : currentBalance;

  // Compute key metrics over the history window
  const stats = useMemo(() => {
    const livePnlFallback = isLiveSynced ? liveSyncInfo!.unrealizedProfit : 0;
    if (!equityHistory || equityHistory.length === 0) {
      return {
        maxPnl: livePnlFallback,
        minPnl: livePnlFallback,
        currentPnl: livePnlFallback,
        pnlRetracement: 0,
        maxEquityInWindow: authoritativeEquity,
        minEquityInWindow: authoritativeEquity,
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
    const currentPnl = isLiveSynced
      ? liveSyncInfo!.unrealizedProfit
      : latest
      ? latest.unrealizedPnl
      : 0;
    if (currentPnl > maxPnl) maxPnl = currentPnl;
    const pnlRetracement = maxPnl > 0 && currentPnl < maxPnl ? maxPnl - currentPnl : 0;

    return {
      maxPnl: maxPnl === -Infinity ? 0 : maxPnl,
      minPnl: minPnl === Infinity ? 0 : minPnl,
      currentPnl,
      pnlRetracement,
      maxEquityInWindow: maxEq === -Infinity ? authoritativeEquity : maxEq,
      minEquityInWindow: minEq === Infinity ? authoritativeEquity : minEq,
      pointsCount: equityHistory.length,
    };
  }, [equityHistory, authoritativeEquity, isLiveSynced, liveSyncInfo]);

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
          <div className="flex items-center gap-2 flex-wrap">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">
              实时净值与浮盈脉冲曲线 (Live PnL & Equity Tracking)
            </h3>
            {hasBinanceKeys ? (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-mono border ${
                  liveSyncInfo?.syncOk
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                }`}
              >
                {liveSyncInfo?.syncOk ? '🟢 LIVE 币安实盘真实同步' : '⏳ 等待实盘账户响应'}
              </span>
            ) : (
              <span className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono">
                🔵 PAPER 模拟观测曲线
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {hasBinanceKeys
              ? '直连币安 /fapi/v2/account 实时读取真实钱包净值与未实现盈亏脉冲，绝不使用虚假模拟基数'
              : '实时可视观测市场急拉、插针波动及浮盈回吐过程，验证多阶段高灵敏锁利防守机制'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasBinanceKeys && onSyncLive && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '正在同步币安实盘...' : '立即同步币安实盘'}</span>
            </button>
          )}

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-[#0b0e14] border border-slate-800 p-1 rounded-xl text-xs">
            <button
              type="button"
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
              type="button"
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
              type="button"
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
      </div>

      {/* Real-time Indicator Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">
            {isLiveSynced ? '实盘保证金净值 (Equity)' : '当前净值 (Equity)'}
          </div>
          <div className="text-base font-bold font-mono text-amber-400 mt-1">
            ${authoritativeEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
            {isLiveSynced
              ? `钱包 $${authoritativeWalletOrBalance.toFixed(2)} | 可用 $${authoritativeAvailable.toFixed(2)}`
              : `本金: $${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
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
              {peakEquity > 0 ? (((peakEquity - authoritativeEquity) / peakEquity) * 100).toFixed(2) : 0}%
            </span>
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">
            {isLiveSynced ? '交易所未实现盈亏 (Live PnL)' : '窗口最高浮盈 (Max Spike)'}
          </div>
          <div
            className={`text-base font-bold font-mono mt-1 flex items-center gap-1 ${
              (isLiveSynced ? stats.currentPnl : stats.maxPnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            {(isLiveSynced ? stats.currentPnl : stats.maxPnl) >= 0 ? '+' : ''}$
            {(isLiveSynced ? stats.currentPnl : stats.maxPnl).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {isLiveSynced ? (
              <span>真实持仓: <strong className="text-cyan-300">{activePositions.length} 笔</strong> (窗口峰值 +${stats.maxPnl.toFixed(2)})</span>
            ) : (
              <>
                当前浮动盈亏:{' '}
                <span
                  className={`font-mono font-semibold ${
                    stats.currentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {stats.currentPnl >= 0 ? '+' : ''}${stats.currentPnl.toFixed(2)}
                </span>
              </>
            )}
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

      {/* Live Exchange Open Positions Breakdown Bar */}
      {isLiveSynced && activePositions.length > 0 && (
        <div className="p-3 bg-[#0b0e14] border border-emerald-500/30 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
            <span>📡 币安合约实盘当前真实持仓脉冲明细 (/fapi/v2/positionRisk · {activePositions.length} 笔)</span>
            <span className="font-mono text-slate-400">
              更新于 {liveSyncInfo?.syncedAt ? new Date(liveSyncInfo.syncedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '--'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] font-mono">
            {activePositions.map((pos) => (
              <div
                key={pos.id}
                className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1.5"
              >
                <div>
                  <span className="font-bold text-slate-100">{pos.symbol}</span>{' '}
                  <span className={pos.side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}>
                    {pos.side} {pos.leverage}x
                  </span>
                  <div className="text-[10px] text-slate-400">
                    量 {pos.quantity} | 均 ${pos.entryPrice.toFixed(2)} → 标 ${pos.currentPrice.toFixed(2)}
                  </div>
                </div>
                <div className={`font-bold text-right ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                  <div className="text-[10px] opacity-80">
                    ({pos.unrealizedPnlPercent >= 0 ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(1)}%)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        {hasBinanceKeys && liveSyncInfo && !liveSyncInfo.syncOk ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-rose-300 border border-dashed border-rose-500/40 rounded-xl bg-rose-950/10 px-4 text-center">
            <ShieldAlert className="w-6 h-6 text-rose-400 mb-2" />
            <div className="text-xs font-bold">未能拉取币安实盘净值与持仓（严禁使用模拟数据替代）</div>
            <div className="text-[11px] text-rose-200/80 mt-1 max-w-lg">
              {liveSyncInfo.errorMessage || '请检查 API Key 合约权限、服务器 IP 白名单及交易所连通性'}
            </div>
          </div>
        ) : !hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-[#0b0e14]/50 px-4 text-center">
            <Activity className="w-6 h-6 text-amber-500/60 animate-pulse mb-2" />
            <div className="text-xs text-slate-300 font-semibold">
              {isLiveSynced
                ? `已连接币安实盘 (当前真实净值 $${authoritativeEquity.toFixed(2)} | 浮盈 ${stats.currentPnl >= 0 ? '+' : ''}$${stats.currentPnl.toFixed(2)})，正在每 5 秒持续采样实盘脉冲...`
                : '正在持续收集 10s 实时净值与浮盈脉冲采样...'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {isLiveSynced
                ? '首个实盘采样已录入，等待下一条 5 秒实盘脉冲到达即刻绘制连续真实曲线'
                : '系统已启动，随着市场行情计算将自动绘制走势曲线'}
            </div>
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
          {(() => {
            if (equityHistory.length < 2) {
              return `采样窗口: ${equityHistory.length} 点`;
            }
            const spanMs = Math.max(
              0,
              equityHistory[equityHistory.length - 1].timestamp - equityHistory[0].timestamp
            );
            const spanMinutes = Math.round(spanMs / 60000);
            const spanText =
              spanMinutes >= 120
                ? `${(spanMinutes / 60).toFixed(1)} 小时`
                : `${Math.max(1, spanMinutes)} 分钟`;
            return `采样窗口: ${equityHistory.length} 点 (跨度 ${spanText})`;
          })()}
        </div>
      </div>
    </div>
  );
};
