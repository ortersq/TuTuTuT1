import React, { useState } from 'react';
import { BotStatus, SymbolScanResult, ActivePosition } from '../server/botEngine';
import {
  Activity,
  ShieldCheck,
  Zap,
  LineChart,
  AlertTriangle,
  Compass,
  HeartPulse,
  Award,
  Ban,
  ShieldAlert,
} from 'lucide-react';
import { CandleChart } from './CandleChart';
import { LiveEquityChart } from './LiveEquityChart';
import { ServerSystemDashboard } from './ServerSystemDashboard';
import { LivePerformanceMonitor } from './LivePerformanceMonitor';
import { PortfolioBasketPanel } from './PortfolioBasketPanel';
import { fetchBinanceKlines } from '../utils/binanceApi';
import { Kline } from '../types/trading';
import { RealtimeWsDiagnostics } from '../hooks/useRealtimeWebSocket';

interface MultiSymbolScannerProps {
  status: BotStatus | null;
  wsDiagnostics?: RealtimeWsDiagnostics;
  onReconnectWs?: () => void;
  onRefreshStatus: () => void;
  onSyncLive?: () => Promise<void> | void;
  onClosePosition: (symbol: string) => void;
  onCloseAllPositions?: () => Promise<void> | void;
}

export const MultiSymbolScanner: React.FC<MultiSymbolScannerProps> = ({
  status,
  wsDiagnostics,
  onReconnectWs,
  onSyncLive,
  onClosePosition,
  onCloseAllPositions,
}) => {
  const [selectedInspect, setSelectedInspect] = useState<{ symbol: string; interval: string } | null>(null);
  const [inspectKlines, setInspectKlines] = useState<Kline[]>([]);
  const [isFetchingChart, setIsFetchingChart] = useState<boolean>(false);

  const symbols = status?.monitoredSymbols || ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'NVDAUSDT', 'CLUSDT'];
  const timeframes = status?.monitoredTimeframes || ['5m', '15m', '30m'];
  const hasKeys = Boolean(status?.hasBinanceKeys);
  const liveSync = status?.liveSyncInfo;
  const displayEquity = status ? status.equity : 0;
  const displayBalance = status ? status.balance : 0;

  const handleInspectChart = async (symbol: string, interval: string) => {
    setSelectedInspect({ symbol, interval });
    setIsFetchingChart(true);
    try {
      const res = await fetchBinanceKlines({ symbol, interval, limit: 300 });
      setInspectKlines(res.klines);
    } catch {
      // ignore
    } finally {
      setIsFetchingChart(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Status & Account Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>引擎存活与心跳</span>
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1 flex items-center gap-1.5">
              {status?.isRunning ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  🟢 10s 实时高频计算中 (心跳正常)
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">
                  ⏸ 已暂停监控
                </span>
              )}
            </div>
            {wsDiagnostics && (
              <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-2">
                <span>
                  WS实时流:{' '}
                  <strong
                    className={
                      wsDiagnostics.binanceWsPhase === 'CONNECTED' &&
                      wsDiagnostics.serverWsPhase === 'CONNECTED'
                        ? 'text-emerald-400'
                        : wsDiagnostics.serverWsPhase === 'CONNECTED' ||
                          wsDiagnostics.binanceWsPhase === 'CONNECTED'
                        ? 'text-sky-400'
                        : 'text-amber-400'
                    }
                  >
                    {wsDiagnostics.binanceWsPhase === 'CONNECTED'
                      ? '币安直连推送中'
                      : wsDiagnostics.serverWsPhase === 'CONNECTED'
                      ? '服务端WS推送中'
                      : '重连同步中...'}
                  </strong>
                </span>
                {onReconnectWs && (
                  <button
                    type="button"
                    onClick={onReconnectWs}
                    className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    重连
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">监控模式</div>
          <div className="text-sm font-bold mt-1">
            {status?.hasBinanceKeys ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> 币安合约 API 实盘开单
              </span>
            ) : (
              <span className="text-sky-400 flex items-center gap-1">
                <Zap className="w-4 h-4" /> 模拟调单与收益观测模式
              </span>
            )}
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>{hasKeys ? '实盘账户净值 (USDT)' : '模拟账户净值 (USDT)'}</span>
            {hasKeys && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  liveSync?.syncOk
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {liveSync?.syncOk ? '实盘已同步' : '等待同步'}
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-slate-100 font-mono mt-1">
            {hasKeys && !liveSync?.syncOk && displayEquity === 0
              ? '⏳ 正在拉取交易所净值...'
              : `$${displayEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center justify-between gap-2">
            {hasKeys && liveSync?.syncOk ? (
              <>
                <span>钱包: ${liveSync.walletBalance.toFixed(2)} | 可用: ${liveSync.availableBalance.toFixed(2)}</span>
                <span className={liveSync.unrealizedProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  浮盈 {liveSync.unrealizedProfit >= 0 ? '+' : ''}${liveSync.unrealizedProfit.toFixed(2)}
                </span>
              </>
            ) : (
              <span>可用保证金: ${displayBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            )}
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">当前活跃持仓数</div>
          <div className="text-sm font-bold text-emerald-400 mt-1">
            {status?.activePositions.length || 0} 个单子运行中
          </div>
        </div>
      </div>

      {/* Live Total-Equity Allocation & Risk Control Strip */}
      {status?.riskMetrics && (
        <div className="bg-[#111726] border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">🔒 锁定合约:</span>
              <span className="text-amber-300 font-bold">
                {symbols.map((s) => s.replace('USDT', '')).join(' / ')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">资金占用:</span>
              <span
                className={`font-bold ${
                  status.riskMetrics.marginUtilizationPercent >= 70
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {status.riskMetrics.marginUtilizationPercent.toFixed(1)}%
              </span>
              <span className="text-slate-500">
                (安全缓冲 {status.riskMetrics.freeMarginBufferPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">单笔风险上限:</span>
              <span className="text-cyan-300 font-bold">
                {status.riskMetrics.riskPerTradePercent.toFixed(1)}% (${status.riskMetrics.maxSingleTradeRiskUsdt.toFixed(2)})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">杠杆上限:</span>
              <span className="text-slate-200 font-bold">{status.leverage}x (只降不升)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-[#0b0e14] border border-slate-800 text-slate-300">
              {status.riskMetrics.isHedgeMode ? '双向持仓 (Hedge)' : '单向持仓 (One-Way)'}
            </span>
            <span
              className={`px-2 py-0.5 rounded border font-semibold ${
                status.riskMetrics.isDrawdownLocked
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {status.riskMetrics.isDrawdownLocked
                ? `🛑 回撤熔断锁仓 (${status.riskMetrics.drawdownPercent.toFixed(1)}%/${status.riskMetrics.maxAllowedDrawdownPercent}%)`
                : `✓ 回撤 ${status.riskMetrics.drawdownPercent.toFixed(1)}% / 熔断线 ${status.riskMetrics.maxAllowedDrawdownPercent}%`}
            </span>
          </div>
        </div>
      )}

      {/* Live Binance Sync Error Banner if Keys Set but Exchange Rejected/Unreachable */}
      {hasKeys && liveSync && !liveSync.syncOk && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>实盘账户同步提示</strong>：{liveSync.errorMessage || '未能获取币安合约账户信息，已暂停使用模拟数据以防失真。请确认服务器 IP 白名单、合约交易权限或交易所连接状态。'}
            </span>
          </div>
        </div>
      )}

      {/* Mode Banner explanation if paper mode */}
      {!hasKeys && (
        <div className="p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-xs text-sky-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              <strong>当前为模拟观测模式</strong>：无 API Key 时系统会自动模拟在 5m/15m/30m 出现信号时开单与平仓，并在右侧日志中记录真实的浮动盈亏，供您测试观察表现。
            </span>
          </div>
          <span className="text-[11px] text-sky-300 font-mono">可在设置中填入 API Key 开启实盘</span>
        </div>
      )}

      {/* Real-Time Live Quant Performance Monitor (Sharpe Ratio & Max Drawdown) */}
      <LivePerformanceMonitor status={status} />

      {/* 7-Day Quantitative Strategy Auto Screener (Grade A-F, auto eliminate < C) */}
      {status?.strategyScreener && status.strategyScreener.length > 0 && (
        <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  策略自动筛选器 (7-Day Strategy Auto Screener · A–F 量化评级)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  依据过去 7 天实盘/模拟成交的胜率、盈亏比 (Profit Factor) 与最大回撤自动量化评级，低于 C 级 (D/F) 的低效策略将自动淘汰禁开！
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-amber-300">
              淘汰线: &lt; C 级 (样本 ≥ 3笔生效)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {status.strategyScreener.map((item) => {
              const isEliminated = item.status === 'ELIMINATED_BELOW_C';
              const gradeColors: Record<string, string> = {
                A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                B: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
                C: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                D: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
                F: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
              };
              return (
                <div
                  key={item.strategyKey}
                  className={`rounded-xl p-3.5 border space-y-2 transition-all ${
                    isEliminated
                      ? 'bg-rose-950/20 border-rose-500/40 opacity-85'
                      : 'bg-[#0b0e14] border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-slate-100 leading-snug">
                      {item.strategyName}
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded text-xs font-extrabold font-mono border ${
                        gradeColors[item.grade] || gradeColors.C
                      }`}
                    >
                      {item.grade} 级
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-slate-300">
                    <div>7D胜率: <strong>{item.winRatePercent}%</strong></div>
                    <div>盈亏比: <strong>{item.profitFactor}</strong></div>
                    <div>回撤: <strong>{item.maxDrawdownPercent}%</strong></div>
                    <div>评分: <strong>{item.score}/100</strong></div>
                  </div>

                  <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">7日样本: {item.tradesCount7d}笔</span>
                    {isEliminated ? (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <Ban className="w-3 h-3" /> 已自动淘汰
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-semibold">
                        {item.grade === 'A' ? '🟢 精选优先' : '✓ 激活运行'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Server Hardware & Internal Scheduling Dashboard */}
      <ServerSystemDashboard status={status} />

      {/* Live PnL & Equity Line Chart (Recharts) */}
      <LiveEquityChart
        equityHistory={status?.equityHistory || []}
        peakEquity={status?.peakEquity ?? 0}
        currentEquity={displayEquity}
        currentBalance={displayBalance}
        hasBinanceKeys={hasKeys}
        liveSyncInfo={liveSync}
        activePositions={status?.activePositions || []}
        onSyncLive={onSyncLive}
      />

      {/* Portfolio Basket Net Take-Profit & One-Click Close All */}
      <PortfolioBasketPanel
        basket={status?.portfolioBasket}
        activePositionsCount={status?.activePositions.length ?? 0}
        onCloseAllPositions={onCloseAllPositions}
      />

      {/* Main Multi-Symbol Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {symbols.map((symbol) => {
          const scanForSymbol = status?.scanResults.filter((s) => s.symbol === symbol) || [];
          const activePosForSymbol = status?.activePositions.find((p) => p.symbol === symbol);
          const ticker = status?.marketTickers?.[symbol];
          const sampleScan = scanForSymbol.find((s) => s.interval === '15m') || scanForSymbol[0];
          const samplePrice =
            ticker?.price || sampleScan?.currentPrice || activePosForSymbol?.currentPrice || 0;
          const sample24h = ticker?.change24hPercent ?? sampleScan?.change24hPercent ?? 0;
          const isUnavailable = status?.symbolExchangeRules?.[symbol]?.available === false;
          const hasCompletedInitialScan = (status?.lastMarketPreviewTime ?? 0) > 0;
          const trendContext = sampleScan?.trendContext || 'RANGE_BOUND';
          const trendDesc =
            sampleScan?.trendDescription ||
            (isUnavailable
              ? '⚪ 交易所暂未开放该合约行情'
              : hasCompletedInitialScan && samplePrice === 0
              ? '🟡 暂未获取到该合约行情 (受限或未开放)'
              : '🟡 箱体震荡整理');

          return (
            <div
              key={symbol}
              className={`bg-[#111726] border rounded-2xl p-5 space-y-4 transition-all ${
                activePosForSymbol
                  ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                  : 'border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Header for Symbol */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-amber-400 text-sm">
                    {symbol.replace('USDT', '')}
                  </div>
                  <div>
                    <div className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>{symbol}</span>
                      {isUnavailable && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono">
                          币安USDT合约暂未上市
                        </span>
                      )}
                    </div>
                    {/* Live Market Trend Regime Badge */}
                    <div className="text-xs font-semibold mt-0.5 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-amber-400" />
                      <span
                        className={
                          trendContext === 'BULL_TREND'
                            ? 'text-emerald-400'
                            : trendContext === 'BEAR_TREND'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }
                      >
                        {trendDesc}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-bold font-mono text-slate-100">
                    {samplePrice > 0
                      ? `$${samplePrice.toLocaleString('en-US', {
                          minimumFractionDigits: samplePrice < 10 ? 2 : 1,
                          maximumFractionDigits: samplePrice < 10 ? 4 : 2,
                        })}`
                      : isUnavailable
                      ? '暂无报价'
                      : hasCompletedInitialScan
                      ? '暂未获取到报价'
                      : '⏳ 获取报价中...'}
                  </div>
                  <div
                    className={`text-xs font-semibold font-mono ${
                      sample24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {sample24h >= 0 ? '+' : ''}
                    {sample24h.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Active Position Banner if present */}
              {activePosForSymbol && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      当前持仓: [{activePosForSymbol.interval}] {activePosForSymbol.side} (
                      {activePosForSymbol.patternName})
                    </span>
                    <button
                      onClick={() => onClosePosition(symbol)}
                      className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded font-medium transition-colors cursor-pointer"
                    >
                      平仓
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-300">
                    <div>开仓价: ${activePosForSymbol.entryPrice.toFixed(2)}</div>
                    <div>当前价: ${activePosForSymbol.currentPrice.toFixed(2)}</div>
                    <div>
                      浮动盈亏:{' '}
                      <strong
                        className={
                          activePosForSymbol.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {activePosForSymbol.unrealizedPnl >= 0 ? '+' : ''}
                        ${activePosForSymbol.unrealizedPnl.toFixed(2)} (
                        {activePosForSymbol.unrealizedPnlPercent >= 0 ? '+' : ''}
                        {activePosForSymbol.unrealizedPnlPercent.toFixed(1)}%)
                      </strong>
                    </div>
                    {activePosForSymbol.isTrailingActive && activePosForSymbol.trailingStopPrice && (
                      <div className="text-emerald-300 font-semibold col-span-2 flex items-center justify-between border-t border-slate-800/80 pt-1 text-[11px]">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                          🚀 移动追踪已激活
                        </span>
                        <span>动态止盈线: ${activePosForSymbol.trailingStopPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5m, 15m, 30m Timeframe Signal Monitor Status */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-400">
                  5m / 15m / 30m 周期实时信号与形态检测:
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {timeframes.map((tf) => {
                    const scanResult = scanForSymbol.find((s) => s.interval === tf);
                    const sig = scanResult?.signal ?? 0;
                    const patName = scanResult?.patternName;

                    return (
                      <div
                        key={tf}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all ${
                          sig === 1
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                            : sig === -1
                            ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                            : 'bg-[#0b0e14] border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">{tf} 周期</span>
                          <button
                            onClick={() => handleInspectChart(symbol, tf)}
                            className="text-[10px] text-slate-400 hover:text-amber-400 flex items-center gap-0.5 transition-colors cursor-pointer"
                          >
                            <LineChart className="w-3 h-3" />
                            <span>K线</span>
                          </button>
                        </div>

                        <div>
                          {sig === 1 ? (
                            <div className="font-bold text-emerald-400 flex items-center gap-1">
                              🟢 买入: {patName || '形态突破'}
                            </div>
                          ) : sig === -1 ? (
                            <div className="font-bold text-rose-400 flex items-center gap-1">
                              🔴 卖出: {patName || '形态破位'}
                            </div>
                          ) : (
                            <div className="text-slate-400 text-[11px]">⚪ 无触发信号</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Interactive K-Line Chart Modal / Drawer when user clicks K-line */}
      {selectedInspect && (
        <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>
                {selectedInspect.symbol} - {selectedInspect.interval} 周期 真实 K 线与形态标注
              </span>
            </h3>
            <button
              onClick={() => setSelectedInspect(null)}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              关闭图表
            </button>
          </div>

          {isFetchingChart ? (
            <div className="h-64 flex items-center justify-center text-xs text-slate-400">
              加载 K 线数据中...
            </div>
          ) : (
            <CandleChart klines={inspectKlines} trades={[]} symbol={selectedInspect.symbol} />
          )}
        </div>
      )}
    </div>
  );
};
