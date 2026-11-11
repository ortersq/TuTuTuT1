import React, { useEffect, useState, useCallback } from 'react';
import {
  BacktestConfig,
  BacktestResult,
  Kline,
  RiskManagementConfig,
  StrategyKey,
  StrategyParams,
} from './types/trading';
import { DEFAULT_STRATEGY_PARAMS } from './utils/strategies';
import { fetchBinanceKlines, MultiStrategyComparison, runMultiStrategyBenchmark } from './utils/binanceApi';
import { runFuturesBacktest } from './utils/backtest';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { MetricsCards } from './components/MetricsCards';
import { EquityChart } from './components/EquityChart';
import { CandleChart } from './components/CandleChart';
import { StrategyLeaderboard } from './components/StrategyLeaderboard';
import { RiskManagementPanel } from './components/RiskManagementPanel';
import { TradeLogTable } from './components/TradeLogTable';
import { CodeExportModal } from './components/CodeExportModal';
import { StrategyGuide } from './components/StrategyGuide';
import { RealDataAuditModal } from './components/RealDataAuditModal';
import { AutoBotPanel } from './components/AutoBotPanel';
import { PatternAnalyzer } from './components/PatternAnalyzer';
import { AlertCircle, RefreshCw, Compass, ShieldCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'patterns' | 'autobot' | 'leaderboard' | 'risk' | 'trades' | 'export' | 'guide'
  >('overview');

  // Market & Data Parameters
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [interval, setInterval] = useState<string>('1h');
  const [candleCount, setCandleCount] = useState<number>(500);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>('ensemble');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [leverage, setLeverage] = useState<number>(5);

  // Risk Management Configuration
  const [risk, setRisk] = useState<RiskManagementConfig>({
    slMode: 'ATR',
    slPercent: 2.0,
    slAtrMultiplier: 2.0,
    tpMode: 'RISK_REWARD',
    tpPercent: 4.0,
    tpRiskRewardRatio: 2.0,
    useTrailingStop: true,
    trailingCallbackPercent: 1.2,
    sizingMode: 'EQUITY_PERCENT',
    positionSizePercent: 25,
    fixedAmountUSDT: 2000,
    riskPerTradePercent: 1.5,
    leverage: 5,
    maxAllowedDrawdownPercent: 25,
  });

  // Strategy Parameters
  const [params, setParams] = useState<StrategyParams>(DEFAULT_STRATEGY_PARAMS);

  // Backtest state
  const [klines, setKlines] = useState<Kline[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [benchmark, setBenchmark] = useState<MultiStrategyComparison | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // Synchronize leverage changes
  const handleLeverageChange = (newLev: number) => {
    setLeverage(newLev);
    setRisk((r) => ({ ...r, leverage: newLev }));
  };

  // Run Backtest Function
  const runBacktest = useCallback(
    async (forceFetch: boolean = false) => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        let currentKlines = klines;
        let auditData = backtestResult?.audit;

        if (forceFetch || currentKlines.length === 0) {
          const fetchRes = await fetchBinanceKlines({
            symbol,
            interval,
            limit: candleCount,
          });
          currentKlines = fetchRes.klines;
          auditData = fetchRes.audit;
          setKlines(currentKlines);
        }

        const currentConfig: BacktestConfig = {
          symbol,
          interval,
          initialCapital,
          risk: {
            ...risk,
            leverage,
          },
          makerFeeRate: 0.0002, // 0.02% VIP0
          takerFeeRate: 0.0005, // 0.05% VIP0
          slippageRate: 0.0005, // 0.05%
          strategy: selectedStrategy,
          params,
        };

        // 1. Run main strategy backtest
        const result = runFuturesBacktest(currentKlines, currentConfig);
        if (auditData) result.audit = auditData;
        setBacktestResult(result);

        // 2. Run multi-strategy parallel comparison
        const benchResult = runMultiStrategyBenchmark(currentKlines, currentConfig, auditData);
        setBenchmark(benchResult);
      } catch (err: any) {
        setErrorMessage(err.message || '拉取数据或回测计算失败，请稍后重试');
      } finally {
        setIsLoading(false);
      }
    },
    [symbol, interval, candleCount, selectedStrategy, initialCapital, leverage, risk, params, klines]
  );

  // Initial load
  useEffect(() => {
    runBacktest(true);
  }, [symbol, interval, candleCount]);

  // Re-run backtest locally when strategy or risk config changes
  useEffect(() => {
    if (klines.length > 0) {
      runBacktest(false);
    }
  }, [selectedStrategy, initialCapital, leverage, risk, params]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* Top Bar Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isLoading={isLoading}
        onRunBacktest={() => runBacktest(true)}
        symbol={symbol}
        interval={interval}
      />

      {/* Control Toolbar */}
      <Toolbar
        symbol={symbol}
        setSymbol={(s) => {
          setSymbol(s);
          setKlines([]);
        }}
        interval={interval}
        setInterval={(i) => {
          setInterval(i);
          setKlines([]);
        }}
        candleCount={candleCount}
        setCandleCount={(c) => {
          setCandleCount(c);
          setKlines([]);
        }}
        selectedStrategy={selectedStrategy}
        setSelectedStrategy={setSelectedStrategy}
        leverage={leverage}
        setLeverage={handleLeverageChange}
        initialCapital={initialCapital}
        setInitialCapital={setInitialCapital}
        onRefresh={() => runBacktest(true)}
        isLoading={isLoading}
      />

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-6 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/40 rounded-xl flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => runBacktest(true)}
            className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded text-rose-200 transition-colors font-medium cursor-pointer"
          >
            重试
          </button>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 px-6 py-5 max-w-[1600px] w-full mx-auto">
        {isLoading && !backtestResult ? (
          <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
            <div className="text-sm font-medium">正在拉取币安 {symbol} 真实行情并执行多策略回测...</div>
          </div>
        ) : backtestResult ? (
          <>
            {/* Tab 1: Overview & Charts */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* Market Status Strip & Real Data Provenance Badge */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-[#111726] border border-slate-800/80 rounded-xl text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Real Data Provenance Badge */}
                    <button
                      onClick={() => setShowAuditModal(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 font-semibold transition-colors cursor-pointer"
                      title="点击检验币安官方原始接口地址与数据切片"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>100% 币安官方真实数据源</span>
                      {backtestResult.audit && (
                        <span className="text-[10px] text-emerald-400/80 font-mono">
                          ({backtestResult.audit.latencyMs}ms)
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 font-medium text-slate-300">
                      <Compass className="w-4 h-4 text-amber-400" />
                      <span>状态机判定:</span>
                      <strong className="text-amber-400">
                        {backtestResult.marketRegimeStats.trendingBarsPercent > 50
                          ? '单边趋势主导 (Trending)'
                          : '宽幅箱体震荡 (Consolidation)'}
                      </strong>
                    </div>

                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">
                      趋势K线: <strong className="text-slate-200">{backtestResult.marketRegimeStats.trendingBarsPercent.toFixed(1)}%</strong>
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">
                      震荡K线: <strong className="text-slate-200">{backtestResult.marketRegimeStats.consolidationBarsPercent.toFixed(1)}%</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <button
                      onClick={() => setShowAuditModal(true)}
                      className="text-xs text-slate-400 hover:text-amber-300 underline underline-offset-2 transition-colors cursor-pointer mr-2"
                    >
                      查看币安原始 API 响应
                    </button>

                    <span>当前策略:</span>
                    <span className="text-amber-300 font-bold px-2 py-0.5 bg-amber-500/10 rounded">
                      {selectedStrategy === 'ensemble'
                        ? '自适应多策略量化融合引擎'
                        : selectedStrategy === 'supertrend'
                        ? 'SuperTrend + EMA200 动态趋势追踪'
                        : selectedStrategy === 'dual_thrust'
                        ? 'Dual Thrust CTA 经典突破'
                        : selectedStrategy === 'bollinger_rsi'
                        ? '布林带 + RSI 均值回归'
                        : selectedStrategy === 'macd_vpa'
                        ? 'MACD + VPA 量价动量'
                        : 'ATR 动态网格对冲'}
                    </span>
                  </div>
                </div>

                {/* Primary Metric KPI Cards */}
                <MetricsCards
                  metrics={backtestResult.metrics}
                  strategyName={backtestResult.config.strategy}
                />

                {/* Equity Curve Chart */}
                <EquityChart
                  equityCurve={backtestResult.equityCurve}
                  initialCapital={backtestResult.config.initialCapital}
                />

                {/* Candlestick & Trade Markers Chart */}
                <CandleChart
                  klines={backtestResult.klines}
                  trades={backtestResult.trades}
                  symbol={backtestResult.config.symbol}
                />
              </div>
            )}

            {/* Tab 1.2: Pattern Analyzer (Price Action & Wyckoff) */}
            {activeTab === 'patterns' && (
              <PatternAnalyzer
                klines={backtestResult.klines}
                symbol={symbol}
                interval={interval}
                onApplyStrategy={(key) => {
                  setSelectedStrategy(key);
                  setActiveTab('overview');
                }}
              />
            )}

            {/* Tab 1.5: Auto Bot Panel */}
            {activeTab === 'autobot' && <AutoBotPanel />}

            {/* Tab 2: Strategy Leaderboard */}
            {activeTab === 'leaderboard' && (
              <StrategyLeaderboard
                benchmark={benchmark}
                selectedStrategy={selectedStrategy}
                onSelectStrategy={(key) => {
                  setSelectedStrategy(key);
                  setActiveTab('overview');
                }}
              />
            )}

            {/* Tab 3: Risk Management Central Panel */}
            {activeTab === 'risk' && (
              <RiskManagementPanel
                risk={risk}
                setRisk={setRisk}
                metrics={backtestResult.metrics}
                onApplyAndRerun={() => {
                  runBacktest(false);
                  setActiveTab('overview');
                }}
              />
            )}

            {/* Tab 4: Trade Audit Log */}
            {activeTab === 'trades' && (
              <TradeLogTable
                trades={backtestResult.trades}
                symbol={backtestResult.config.symbol}
              />
            )}

            {/* Tab 5: Strategy Guide & Tuning Matrix */}
            {activeTab === 'guide' && <StrategyGuide />}

            {/* Tab 6: Pine Script & Python Exporter */}
            {activeTab === 'export' && <CodeExportModal result={backtestResult} />}

            {/* Real Data Audit Modal */}
            {backtestResult.audit && (
              <RealDataAuditModal
                audit={backtestResult.audit}
                klines={backtestResult.klines}
                isOpen={showAuditModal}
                onClose={() => setShowAuditModal(false)}
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
