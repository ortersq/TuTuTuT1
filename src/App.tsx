import React, { useEffect, useState, useCallback } from 'react';
import {
  BacktestConfig,
  BacktestResult,
  Kline,
  RiskManagementConfig,
  StrategyKey,
  StrategyParams,
} from './types/trading';
import { DEFAULT_STRATEGY_PARAMS, STRATEGY_CATALOG } from './utils/strategies';
import { fetchBinanceKlines } from './utils/binanceApi';
import { runFuturesBacktest } from './utils/backtest';
import { Header, ActiveTab } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { MetricsCards } from './components/MetricsCards';
import { EquityChart } from './components/EquityChart';
import { CandleChart } from './components/CandleChart';
import { RiskManagementPanel } from './components/RiskManagementPanel';
import { TradeLogTable } from './components/TradeLogTable';
import { RealDataAuditModal } from './components/RealDataAuditModal';
import { AutoBotPanel } from './components/AutoBotPanel';
import { PatternAnalyzer } from './components/PatternAnalyzer';
import { AlertCircle, RefreshCw, Compass, ShieldCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Market & Data Parameters
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [interval, setInterval] = useState<string>('1h');
  const [candleCount, setCandleCount] = useState<number>(500);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>('pattern_price_action');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [leverage, setLeverage] = useState<number>(5);

  // Risk Management Configuration
  const [risk, setRisk] = useState<RiskManagementConfig>({
    slMode: 'ATR',
    slPercent: 2.0,
    slAtrMultiplier: 2.0,
    tpMode: 'RISK_REWARD',
    tpPercent: 4.0,
    tpRiskRewardRatio: 2.2,
    useTrailingStop: true,
    trailingCallbackPercent: 1.2,
    sizingMode: 'EQUITY_PERCENT',
    positionSizePercent: 25,
    fixedAmountUSDT: 2000,
    riskPerTradePercent: 1.5,
    leverage: 5,
    maxAllowedDrawdownPercent: 25,
  });

  const [params] = useState<StrategyParams>(DEFAULT_STRATEGY_PARAMS);

  // Backtest state
  const [klines, setKlines] = useState<Kline[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  const handleLeverageChange = (newLev: number) => {
    setLeverage(newLev);
    setRisk((r) => ({ ...r, leverage: newLev }));
  };

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
          makerFeeRate: 0.0002,
          takerFeeRate: 0.0005,
          slippageRate: 0.0005,
          strategy: selectedStrategy,
          params,
        };

        const result = runFuturesBacktest(currentKlines, currentConfig);
        if (auditData) result.audit = auditData;
        setBacktestResult(result);
      } catch (err: any) {
        setErrorMessage(err.message || '拉取币安真实行情或形态回测失败，请重试');
      } finally {
        setIsLoading(false);
      }
    },
    [symbol, interval, candleCount, selectedStrategy, initialCapital, leverage, risk, params, klines, backtestResult?.audit]
  );

  useEffect(() => {
    runBacktest(true);
  }, [symbol, interval, candleCount]);

  useEffect(() => {
    if (klines.length > 0) {
      runBacktest(false);
    }
  }, [selectedStrategy, initialCapital, leverage, risk, params]);

  const currentStrategyInfo =
    STRATEGY_CATALOG.find((s) => s.key === selectedStrategy) ?? STRATEGY_CATALOG[0];

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isLoading={isLoading}
        onRunBacktest={() => runBacktest(true)}
        symbol={symbol}
        interval={interval}
      />

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

      <main className="flex-1 px-6 py-5 max-w-[1600px] w-full mx-auto">
        {isLoading && !backtestResult ? (
          <div className="h-96 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
            <div className="text-sm font-medium">
              正在从币安官方接口拉取 {symbol} 真实历史 K 线并识别图形形态...
            </div>
          </div>
        ) : backtestResult ? (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* Real Data Provenance & Pattern Regime Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-[#111726] border border-slate-800/80 rounded-xl text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      onClick={() => setShowAuditModal(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300 font-semibold transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>100% 币安官方真实历史 K 线</span>
                      {backtestResult.audit && (
                        <span className="text-[10px] text-emerald-400/80 font-mono">
                          ({backtestResult.audit.latencyMs}ms)
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 font-medium text-slate-300">
                      <Compass className="w-4 h-4 text-amber-400" />
                      <span>当前盘面形态环境:</span>
                      <strong className="text-amber-400">
                        {backtestResult.marketRegimeStats.trendingBarsPercent > 50
                          ? '单边趋势主导 (优先匹配牛熊旗 & H2/L2 二次确认)'
                          : '箱体震荡主导 (优先匹配 Wyckoff 弹簧洗盘 & W底/M头)'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    <button
                      onClick={() => setShowAuditModal(true)}
                      className="text-xs text-slate-400 hover:text-amber-300 underline underline-offset-2 transition-colors cursor-pointer mr-2"
                    >
                      验证币安原始 K 线数据
                    </button>

                    <span>当前形态组合:</span>
                    <span className="text-amber-300 font-bold px-2 py-0.5 bg-amber-500/10 rounded">
                      {currentStrategyInfo.name}
                    </span>
                  </div>
                </div>

                <MetricsCards
                  metrics={backtestResult.metrics}
                  strategyName={currentStrategyInfo.name}
                />

                <EquityChart
                  equityCurve={backtestResult.equityCurve}
                  initialCapital={backtestResult.config.initialCapital}
                />

                <CandleChart
                  klines={backtestResult.klines}
                  trades={backtestResult.trades}
                  symbol={backtestResult.config.symbol}
                />
              </div>
            )}

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

            {activeTab === 'autobot' && <AutoBotPanel />}

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

            {activeTab === 'trades' && (
              <TradeLogTable
                trades={backtestResult.trades}
                symbol={backtestResult.config.symbol}
              />
            )}

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
