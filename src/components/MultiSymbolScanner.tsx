import React, { useState } from 'react';
import { BotStatus, SymbolScanResult, ActivePosition } from '../server/botEngine';
import { Activity, ShieldCheck, Zap, LineChart, AlertTriangle, Compass, HeartPulse } from 'lucide-react';
import { CandleChart } from './CandleChart';
import { LiveEquityChart } from './LiveEquityChart';
import { fetchBinanceKlines } from '../utils/binanceApi';
import { Kline } from '../types/trading';

interface MultiSymbolScannerProps {
  status: BotStatus | null;
  onRefreshStatus: () => void;
  onClosePosition: (symbol: string) => void;
}

export const MultiSymbolScanner: React.FC<MultiSymbolScannerProps> = ({
  status,
  onClosePosition,
}) => {
  const [selectedInspect, setSelectedInspect] = useState<{ symbol: string; interval: string } | null>(null);
  const [inspectKlines, setInspectKlines] = useState<Kline[]>([]);
  const [isFetchingChart, setIsFetchingChart] = useState<boolean>(false);

  const symbols = status?.monitoredSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  const timeframes = status?.monitoredTimeframes || ['5m', '15m', '30m'];

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
          <div className="text-xs text-slate-400 font-medium">账户净值 (USDT)</div>
          <div className="text-sm font-bold text-slate-100 font-mono mt-1">
            ${(status?.equity || 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-[#111726] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">当前活跃持仓数</div>
          <div className="text-sm font-bold text-emerald-400 mt-1">
            {status?.activePositions.length || 0} 个单子运行中
          </div>
        </div>
      </div>

      {/* Mode Banner explanation if paper mode */}
      {!status?.hasBinanceKeys && (
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

      {/* Live PnL & Equity Line Chart (Recharts) */}
      <LiveEquityChart
        equityHistory={status?.equityHistory || []}
        peakEquity={status?.peakEquity}
        currentEquity={status?.equity}
        currentBalance={status?.balance}
      />

      {/* Main Multi-Symbol Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {symbols.map((symbol) => {
          const scanForSymbol = status?.scanResults.filter((s) => s.symbol === symbol) || [];
          const activePosForSymbol = status?.activePositions.find((p) => p.symbol === symbol);
          const sampleScan = scanForSymbol.find((s) => s.interval === '15m') || scanForSymbol[0];
          const samplePrice = sampleScan?.currentPrice || 0;
          const sample24h = sampleScan?.change24hPercent || 0;
          const trendContext = sampleScan?.trendContext || 'RANGE_BOUND';
          const trendDesc = sampleScan?.trendDescription || '🟡 箱体震荡整理';

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
                    ${samplePrice > 0 ? samplePrice.toLocaleString('en-US') : '加载中...'}
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
