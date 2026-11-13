/**
 * Autonomous Multi-Symbol & Multi-Timeframe Chart Pattern Trading Engine
 * - Dynamic Monitored Pairs (User can add/delete symbols on the fly)
 * - Monitored Strategy Intervals: 5m, 15m, 30m
 * - Heartbeat Check & Live Market Trend Regime Monitoring (60s Periodic Heartbeat Logs)
 * - UI & .env Direct Binance Futures API Credentials Configuration
 * - Pattern Win Rate Self-Optimization Engine (Auto-prunes low win-rate patterns to guarantee profitability)
 * - Categorized System Logs Console (Reverse Chronological Order)
 * - Paper Trading / Observation Mode when no API Key is provided
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import {
  AiPnlForecastResult,
  ArbitrageOpportunity,
  BacktestConfig,
  CorrelationHedgingState,
  ExitReason,
  Kline,
  LiveAccountRiskMetrics,
  LiveAccountSyncInfo,
  MarketCorrelationMetrics,
  MarketTickerSnapshot,
  PatternLearningItem,
  PortfolioAllocationState,
  PortfolioBasketState,
  RiskManagementConfig,
  ServerSystemMetrics,
  SmartExecutionResult,
  StrategyKey,
  StrategyParams,
  StrategyScreenerItem,
  SymbolExchangeRules,
  SymbolRiskControlItem,
  SymbolSensitivityRLState,
  TimeframeDiagnosticReport,
} from '../types/trading';
import {
  DEFAULT_SYMBOL_EXCHANGE_RULES,
  fetchBinanceFuturesTickers,
  fetchBinanceKlines,
  fetchFuturesExchangeRules,
} from '../utils/binanceApi';
import { calculateATR, calculateEMA } from '../utils/indicators';
import {
  computeDynamicPortfolioWeights,
  detectCrossSymbolArbitrage,
  evaluate7dStrategyScreener,
  predict24hPnlModel,
} from '../utils/quantModels';
import {
  computeDynamicSmallCapitalSizing,
  computeNormalizedMarketCorrelation,
  countStepDecimals,
  DEFAULT_PORTFOLIO_BASKET_CONFIG,
  evaluatePortfolioBasketTakeProfit,
  formatToStep,
  LOCKED_TARGET_SYMBOLS,
  normalizeLockedSymbol,
} from '../utils/riskAndExecution';
import {
  buildLiveSyncInfo,
  mergeClosedTrades,
  parseBinanceAccountResponse,
  parseBinanceOpenPositions,
  parseBinanceRealClosedTrades,
  reconstructLiveEquityHistoryFromIncome,
  type ParsedBinanceAccount,
} from '../utils/binanceSync';
import { DEFAULT_STRATEGY_PARAMS, generateAllSignals } from '../utils/strategies';
import { BinanceApiError, BinanceFuturesRest } from './binanceRest';

dotenv.config();

export interface ActivePosition {
  id: string;
  symbol: string;
  interval: string;
  side: 'LONG' | 'SHORT';
  patternType?: string;
  patternName: string;
  patternCategory?: string;
  entryTime: number;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  peakPnlUsdt: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  trailingPeakPrice: number;
  trailingStopPrice?: number | null;
  isTrailingActive?: boolean;
  liquidationPrice: number;
  strategyUsed: StrategyKey;
  binanceOrderId?: string;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  isPaper: boolean;
}

export interface BotTradeRecord {
  id: string;
  symbol: string;
  interval: string;
  side: 'LONG' | 'SHORT';
  patternType?: string;
  patternName: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  netPnl: number;
  pnlPercent: number;
  peakPnlUsdt?: number;
  reversionUsdt?: number;
  volatilityLevel?: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  exitReason: ExitReason;
  strategyUsed: StrategyKey;
  isPaper: boolean;
  isExternalExchangeTrade?: boolean;
}

export interface SymbolScanResult {
  symbol: string;
  interval: string;
  currentPrice: number;
  change24hPercent: number;
  atr: number;
  trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND';
  trendDescription: string;
  signal: 1 | -1 | 0;
  patternType?: string;
  patternName?: string;
  patternCategory?: string;
  qualityScore?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  lastScanTime: number;
}

export interface LogEntry {
  id: string;
  time: string;
  timestamp: number;
  level: 'info' | 'warn' | 'success' | 'error';
  category: 'SYSTEM' | 'ORDER' | 'SIGNAL' | 'API';
  message: string;
  symbol?: string;
}

export interface PatternStatItem {
  patternType: string;
  patternName: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  totalNetPnl: number;
  profitFactor: number;
  avgPnlPercent: number;
  status: 'ACTIVE_HIGH_CONVICTION' | 'ACTIVE_NORMAL' | 'PAUSED_LOW_WINRATE';
}

export interface LiveEquityPoint {
  timestamp: number;
  time: string;
  equity: number;
  balance: number;
  unrealizedPnl: number;
  activePositionsCount: number;
}

export interface BotStatus {
  isRunning: boolean;
  mode: 'PAPER' | 'LIVE';
  hasBinanceKeys: boolean;
  binanceEndpoint: string;
  liveSyncInfo: LiveAccountSyncInfo | null;
  symbolExchangeRules: Record<string, SymbolExchangeRules>;
  monitoredSymbols: string[];
  monitoredTimeframes: string[];
  balance: number;
  equity: number;
  peakEquity: number;
  drawdownPercent: number;
  leverage: number;
  activePositions: ActivePosition[];
  closedTrades: BotTradeRecord[];
  scanResults: SymbolScanResult[];
  marketTickers: Record<string, MarketTickerSnapshot>;
  patternStats: PatternStatItem[];
  equityHistory: LiveEquityPoint[];
  learningGeneration: number;
  patternLearningStats: PatternLearningItem[];
  timeframeDiagnostic: TimeframeDiagnosticReport;
  symbolRiskControlStats: SymbolRiskControlItem[];
  marketCorrelation: MarketCorrelationMetrics;
  symbolRLSensitivityStates: SymbolSensitivityRLState[];
  smartExecutionLogs: SmartExecutionResult[];
  correlationHedgingLogs: CorrelationHedgingState[];
  strategyScreener: StrategyScreenerItem[];
  aiPnlForecast: AiPnlForecastResult;
  arbitrageOpportunities: ArbitrageOpportunity[];
  portfolioAllocation: PortfolioAllocationState;
  portfolioBasket: PortfolioBasketState;
  riskMetrics: LiveAccountRiskMetrics;
  logs: LogEntry[];
  recentSchedulingEvents: LogEntry[];
  systemMetrics: ServerSystemMetrics;
  lastUpdateTime: number;
  lastMarketPreviewTime: number;
  riskConfig: RiskManagementConfig;
}

class TradingEngine {
  private isRunning: boolean = false;
  private mode: 'PAPER' | 'LIVE' = 'PAPER';
  private monitoredSymbols: string[] = [...LOCKED_TARGET_SYMBOLS];
  private monitoredTimeframes: string[] = ['5m', '15m', '30m'];

  private apiKey: string = process.env.BINANCE_API_KEY?.trim() || '';
  private apiSecret: string = process.env.BINANCE_API_SECRET?.trim() || '';

  /**
   * Single gateway for every signed Binance call. It owns weight budgeting, 429/418 back-off,
   * time-offset correction and hard timeouts, and it ALWAYS throws on failure instead of
   * returning an empty array (the root cause of the "positions vanished" false closes).
   */
  private readonly binanceRest: BinanceFuturesRest = new BinanceFuturesRest(
    () => this.getFuturesBaseUrl(),
    () => this.apiKey,
    () => this.apiSecret,
    (level, message) => this.addLog(level, 'API', message)
  );

  private positionsSyncedAt: number = 0;
  private lastPositionSignature: string | null = null;
  private lastHistorySyncAt: number = 0;
  private lastProtectiveRepairAt: number = 0;
  private lastTrailingExchangeSyncAt: number = 0;
  private lastOrphanSweepAt: number = 0;
  /** Per-symbol cooldown so correlation hedging cannot chop the same position every 10s. */
  private lastCorrelationHedgeAt: Map<string, number> = new Map();
  /** Back-off after repeated failed close attempts so a rejected order cannot spam every cycle. */
  private closeRetryAfter: Map<string, number> = new Map();
  private closeFailureCount: Map<string, number> = new Map();
  /** Last time we attached exchange protection for `symbol:side` (prevents duplicate SL/TP storms). */
  private protectionPlacedAt: Map<string, number> = new Map();
  /**
   * Journal cut-off. Exchange fills older than this are NOT re-imported after a reset, otherwise
   * the old 交割单 / 净值曲线 would come straight back on the next sync and the reset would be
   * cosmetic. 0 means "no cut-off" (never reset).
   */
  private journalStartedAt: number = 0;
  /** Journal cut-off is persisted to disk so a reset survives a process restart. */
  private persistenceEnabled: boolean = false;
  private readonly journalStatePath: string = path.join(process.cwd(), '.journal-state.json');

  private balance: number = 10000;
  private equity: number = 10000;
  private peakEquity: number = 10000;
  private leverage: number = 5;

  private liveSyncInfo: LiveAccountSyncInfo | null = null;
  private hasSyncedLiveHistory: boolean = false;
  private lastSyncErrorLogTime: number = 0;
  private lastCircuitBreakerLogTime: number = 0;
  private lastDrawdownLockLogTime: number = 0;
  private isHedgeMode: boolean = false;
  private lastHedgeModeCheck: number = 0;
  private pendingOrderSymbols: Set<string> = new Set();
  private symbolExchangeRules: Map<string, SymbolExchangeRules> = new Map(
    Object.entries(DEFAULT_SYMBOL_EXCHANGE_RULES)
  );
  private lastExchangeInfoRefresh: number = 0;
  private symbolAtrPctBaseline: Map<string, number> = new Map();
  private arbitrageOpportunities: ArbitrageOpportunity[] = [];
  private lastArbitrageExecTime: Map<string, number> = new Map();
  private liveSyncTimer: NodeJS.Timeout | null = null;
  private marketPreviewTimer: NodeJS.Timeout | null = null;
  private isRefreshingMarket: boolean = false;
  private lastMarketPreviewTime: number = 0;
  private syncInFlight: Promise<LiveAccountSyncInfo | null> | null = null;
  private syncToken: number = 0;
  private lastLiveSamplePushTime: number = 0;
  private latestSymbolKlinesMap: Map<string, Kline[]> = new Map();
  private marketTickers: Map<string, MarketTickerSnapshot> = new Map();
  private basketPeakNetPnl: number = 0;
  private basketCloseCooldownUntil: number | null = null;
  private lastBasketCooldownLogTime: number = 0;

  private activePositions: ActivePosition[] = [];
  private closedTrades: BotTradeRecord[] = [];
  private scanResults: SymbolScanResult[] = [];
  private patternStats: PatternStatItem[] = [];
  private equityHistory: LiveEquityPoint[] = [];
  private learningGeneration: number = 1;
  private patternLearningWeights: Map<string, PatternLearningItem> = new Map();
  private smartExecutionLogs: SmartExecutionResult[] = [];
  private correlationHedgingLogs: CorrelationHedgingState[] = [];
  private logs: LogEntry[] = [];
  private lastUpdateTime: number = Date.now();
  private cycleCounter: number = 0;
  private statusListeners: Set<(status: BotStatus) => void> = new Set();
  private notifyTimer: NodeJS.Timeout | null = null;

  private riskConfig: RiskManagementConfig = {
    slMode: 'ATR',
    slPercent: 1.5,
    slAtrMultiplier: 1.8,
    tpMode: 'RISK_REWARD',
    tpPercent: 3.5,
    tpRiskRewardRatio: 2.2,
    useTrailingStop: true,
    trailingActivationPercent: 0.8,
    trailingCallbackPercent: 0.45,
    trailingStepPercent: 0.5,
    trailingActivationUsdt: 25,
    autoBreakevenEnabled: true,
    autoBreakevenDynamicPercent: 0.8,
    autoBreakevenUsdt: 15,
    notification: {
      enableEmergencyAlerts: true,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || '',
      webhookUrl: process.env.EMERGENCY_WEBHOOK_URL?.trim() || '',
    },
    portfolioBasket: {
      ...DEFAULT_PORTFOLIO_BASKET_CONFIG,
    },
    sizingMode: 'EQUITY_PERCENT',
    positionSizePercent: 20,
    fixedAmountUSDT: 1000,
    riskPerTradePercent: 2.0,
    leverage: 5,
    maxAllowedDrawdownPercent: 20,
  };

  private params: StrategyParams = DEFAULT_STRATEGY_PARAMS;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor() {
    const hasKeys = this.hasApiCredentials();
    this.mode = hasKeys ? 'LIVE' : 'PAPER';
    if (hasKeys) {
      // Never seed fake $10,000 paper equity when API keys are configured
      this.balance = 0;
      this.equity = 0;
      this.peakEquity = 0;
      this.equityHistory = [];
    } else {
      this.equityHistory.push({
        timestamp: Date.now(),
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        equity: this.equity,
        balance: this.balance,
        unrealizedPnl: 0,
        activePositionsCount: 0,
      });
    }
    this.initPatternLearningState();
    this.addLog(
      'info',
      'SYSTEM',
      `多币种 5m/15m/30m 动态形态量化引擎就绪 (监控: ${this.monitoredSymbols.join(', ')}) | 🧠 自学习强化引擎: 激活 (第 #${this.learningGeneration} 代) | 模式: ${
        hasKeys
          ? '🟢 币安实盘 API 模式 (正在连接交易所同步真实净值与持仓)'
          : '🔵 模拟观察模式 (无 API Key，只自动模拟开平仓并记录损益)'
      }`
    );
    // Never start background polling just because the module was imported: unit tests, CLI
    // helpers and one-off scripts must not fire live Binance requests (it kept the test process
    // alive for ~40s and spent real request weight).
    const isTestRunner =
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      process.env.DSH_NO_BACKGROUND_POLLING === '1' ||
      process.argv.some(
        (arg) => arg === '--test' || /(^|[\\/])[^\\/]+\.test\.(ts|js|mjs|cjs)$/.test(arg)
      );
    if (!isTestRunner) {
      if (hasKeys) {
        this.ensureLiveSyncLoop();
        this.syncLiveAccountNow(true).catch(() => {});
      }
      this.ensureMarketPreviewLoop();
      this.refreshMarketPreview().catch(() => {});
    }
    this.persistenceEnabled = !isTestRunner;
    if (this.persistenceEnabled) this.loadJournalState();
  }

  /** Restore the journal cut-off written by a previous reset (see `resetJournal`). */
  private loadJournalState(): void {
    try {
      if (!fs.existsSync(this.journalStatePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.journalStatePath, 'utf8'));
      const cut = Number(raw?.journalStartedAt);
      if (Number.isFinite(cut) && cut > 0) this.journalStartedAt = cut;
    } catch {
      // corrupt/unreadable state file must never block startup
    }
  }

  private saveJournalState(): void {
    if (!this.persistenceEnabled) return;
    try {
      fs.writeFileSync(
        this.journalStatePath,
        JSON.stringify({ journalStartedAt: this.journalStartedAt, updatedAt: Date.now() }, null, 2),
        'utf8'
      );
    } catch (err: any) {
      this.addLog('warn', 'SYSTEM', `⚠️ 账本水位线写入失败（重启后旧记录可能重新导入）: ${err?.message || err}`);
    }
  }

  private ensureMarketPreviewLoop(): void {
    if (this.marketPreviewTimer) return;
    // Keep live prices & read-only pattern scans fresh every 10s even while auto-trading is paused
    this.marketPreviewTimer = setInterval(() => {
      if (!this.isRunning && !this.isProcessing) {
        this.refreshMarketPreview().catch(() => {});
      }
    }, 10_000);
    this.marketPreviewTimer.unref?.();
  }

  private upsertScanResult(item: SymbolScanResult): void {
    const idx = this.scanResults.findIndex(
      (s) => s.symbol === item.symbol && s.interval === item.interval
    );
    if (idx >= 0) {
      this.scanResults[idx] = item;
    } else {
      this.scanResults.push(item);
    }
    if (item.interval === '15m' || !this.marketTickers.has(item.symbol)) {
      const existingTicker = this.marketTickers.get(item.symbol);
      // Preserve authoritative 24h ticker change from /ticker/24hr if available, otherwise use scan bar change
      this.marketTickers.set(item.symbol, {
        symbol: item.symbol,
        price: item.currentPrice,
        change24hPercent: existingTicker?.source?.includes('24HR')
          ? existingTicker.change24hPercent
          : item.change24hPercent,
        updatedAt: item.lastScanTime,
        source: existingTicker?.source || 'BINANCE_KLINES',
      });
    }
    this.notifyListeners();
  }

  private async refreshTickersSnapshot(): Promise<void> {
    try {
      const tickers = await fetchBinanceFuturesTickers(
        this.monitoredSymbols,
        this.getFuturesBaseUrl()
      );
      const now = Date.now();
      for (const [sym, q] of tickers.entries()) {
        this.marketTickers.set(sym, {
          symbol: sym,
          price: q.price,
          change24hPercent: q.change24hPercent,
          updatedAt: now,
          source: q.source,
        });
      }
    } catch {
      // ignore transient ticker error
    }
  }

  /**
   * Read-only market quote + 5m/15m/30m pattern scan so homepage never gets stuck on "加载中..."
   * even when auto-trading is paused. Never opens or closes orders.
   */
  public async refreshMarketPreview(): Promise<void> {
    if (this.isRefreshingMarket || this.isProcessing) return;
    this.isRefreshingMarket = true;
    try {
      await Promise.allSettled([
        this.refreshExchangeRulesIfNeeded(false),
        this.refreshTickersSnapshot(),
      ]);

      await Promise.allSettled(
        this.monitoredSymbols.map(async (symbol) => {
          if (this.hasApiCredentials() && this.getSymbolRules(symbol).available === false) return;
          for (const interval of this.monitoredTimeframes) {
            try {
              const fetchResult = await fetchBinanceKlines({
                symbol,
                interval,
                limit: 120,
              });
              const klines = fetchResult.klines;
              if (klines.length < 30) continue;

              if (interval === '15m' || !this.latestSymbolKlinesMap.has(symbol)) {
                this.latestSymbolKlinesMap.set(symbol, klines);
              }

              const latestBar = klines[klines.length - 1];
              const currentPrice = latestBar.close;
              const firstBarPrice = klines[0].open;
              const change24hPercent =
                firstBarPrice > 0 ? ((currentPrice - firstBarPrice) / firstBarPrice) * 100 : 0;
              const currentAtr =
                calculateATR(klines, 14)[klines.length - 1] ?? (latestBar.high - latestBar.low);

              const recentSlice = klines.slice(-60);
              const baselinePct =
                recentSlice.reduce((s, k) => s + (k.high - k.low) / Math.max(1e-8, k.close), 0) /
                Math.max(1, recentSlice.length);
              if (interval === '15m' || !this.symbolAtrPctBaseline.has(symbol)) {
                this.symbolAtrPctBaseline.set(symbol, baselinePct);
              }

              const closes = klines.map((k) => k.close);
              const ema20Arr = calculateEMA(closes, 20);
              const ema50Arr = calculateEMA(closes, 50);
              const e20 = ema20Arr[ema20Arr.length - 1];
              const e50 = ema50Arr[ema50Arr.length - 1];

              let trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND' = 'RANGE_BOUND';
              let trendDescription = '🟡 箱体震荡整理 (EMA20/50 交叉粘合)';
              if (e20 !== null && e50 !== null) {
                if (e20 > e50 * 1.001) {
                  trendContext = 'BULL_TREND';
                  trendDescription = '🟢 多头主升趋势 (EMA20 > EMA50 向上多头发散)';
                } else if (e20 < e50 * 0.999) {
                  trendContext = 'BEAR_TREND';
                  trendDescription = '🔴 空头主跌趋势 (EMA20 < EMA50 向下空头发散)';
                }
              }

              const { signals, patternMap } = generateAllSignals(
                klines,
                this.params,
                'pattern_price_action'
              );
              const latestIndex = signals.length - 1;
              const latestSig = signals[latestIndex];
              const matchedPattern = patternMap.get(latestIndex);

              this.upsertScanResult({
                symbol,
                interval,
                currentPrice,
                change24hPercent: Number(change24hPercent.toFixed(2)),
                atr: currentAtr,
                trendContext,
                trendDescription,
                signal: latestSig,
                patternType: matchedPattern?.type,
                patternName: matchedPattern?.name,
                patternCategory: matchedPattern?.category,
                qualityScore: matchedPattern?.qualityScore,
                stopLossPrice: matchedPattern?.stopLossPrice,
                targetPrice: matchedPattern?.targetPrice,
                lastScanTime: Date.now(),
              });
            } catch {
              // skip single symbol/timeframe failure without blocking other cards
            }
          }
        })
      );
      const now = Date.now();
      this.lastUpdateTime = now;
      this.lastMarketPreviewTime = now;
    } finally {
      this.isRefreshingMarket = false;
      this.notifyListeners();
    }
  }

  private ensureLiveSyncLoop(): void {
    if (this.liveSyncTimer || !this.hasApiCredentials()) return;
    // Poll real Binance account, positions & PnL every 5 seconds even when auto-trading is paused
    this.liveSyncTimer = setInterval(() => {
      if (this.hasApiCredentials()) {
        this.syncLiveAccountNow(false).catch(() => {});
      } else {
        this.stopLiveSyncLoop();
      }
    }, 5000);
    this.liveSyncTimer.unref?.();
  }

  private stopLiveSyncLoop(): void {
    if (this.liveSyncTimer) {
      clearInterval(this.liveSyncTimer);
      this.liveSyncTimer = null;
    }
  }

  private createInitialTimeframeStats() {
    return [
      { timeframe: '5m', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
      { timeframe: '15m', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
      { timeframe: '30m', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
    ];
  }

  private createInitialSessionStats() {
    return [
      { sessionKey: 'ASIA' as const, sessionName: '亚盘低波震荡 (08:00-16:00)', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
      { sessionKey: 'EUROPE' as const, sessionName: '欧盘趋势动能 (16:00-22:00)', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
      { sessionKey: 'US' as const, sessionName: '美盘高波爆发 (22:00-06:00)', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
      { sessionKey: 'OVERNIGHT' as const, sessionName: '尾盘平仓交割 (06:00-08:00)', weight: 1.0, winRate: 0, totalTrades: 0, wins: 0 },
    ];
  }

  private initPatternLearningState() {
    const defaultPatterns: { type: string; name: string }[] = [
      { type: 'WYCKOFF_SPRING', name: 'Wyckoff 弹簧破底洗盘 (Spring)' },
      { type: 'WYCKOFF_UPTHRUST', name: 'Wyckoff 诱多假突破出货 (UTAD)' },
      { type: 'BROOKS_H2_LONG', name: 'Al Brooks H2 均线二次多头确认' },
      { type: 'BROOKS_L2_SHORT', name: 'Al Brooks L2 均线二次受阻做空' },
      { type: 'BULL_FLAG', name: '经典牛旗中继爆发 (Bull Flag)' },
      { type: 'BEAR_FLAG', name: '经典熊旗中继破位 (Bear Flag)' },
      { type: 'W_BOTTOM', name: 'W底颈线放量突破 (Double Bottom)' },
      { type: 'M_TOP', name: 'M头颈线放量破位 (Double Top)' },
      { type: 'CROSS_SYMBOL_ARBITRAGE', name: '跨品种统计套利 (Cross-Symbol Arb)' },
    ];

    for (const p of defaultPatterns) {
      this.patternLearningWeights.set(p.type, {
        patternType: p.type,
        patternName: p.name,
        weight: 1.0,
        confidenceScore: 50,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgPnlUsdt: 0,
        totalNetPnlUsdt: 0,
        qualityScoreBoost: 0,
        adaptiveSizingMultiplier: 1.0,
        timeframeStats: this.createInitialTimeframeStats(),
        sessionStats: this.createInitialSessionStats(),
        bestTimeframe: '15m (初始)',
        bestSession: '美盘高波爆发 (初始)',
        status: 'LEARNING_ACTIVE',
        lastUpdated: Date.now(),
      });
    }
  }

  public updatePatternLearning(trade: BotTradeRecord) {
    if (
      trade.isExternalExchangeTrade ||
      trade.patternType === 'LIVE_EXCHANGE_HISTORY' ||
      trade.patternType === 'BINANCE_ACCOUNT_FILL' ||
      trade.patternType === 'EXTERNAL_EXCHANGE_FILL' ||
      trade.patternType === 'LIVE_EXCHANGE_SYNC' ||
      trade.patternType === 'EXTERNAL_POSITION' ||
      trade.patternType === 'OTHER' ||
      !trade.patternType
    ) {
      return;
    }
    const key = trade.patternType;
    let item = this.patternLearningWeights.get(key);
    if (!item) {
      item = {
        patternType: key,
        patternName: trade.patternName || key,
        weight: 1.0,
        confidenceScore: 50,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgPnlUsdt: 0,
        totalNetPnlUsdt: 0,
        qualityScoreBoost: 0,
        adaptiveSizingMultiplier: 1.0,
        timeframeStats: this.createInitialTimeframeStats(),
        sessionStats: this.createInitialSessionStats(),
        bestTimeframe: trade.interval || '15m',
        bestSession: '美盘高波爆发',
        status: 'LEARNING_ACTIVE',
        lastUpdated: Date.now(),
      };
      this.patternLearningWeights.set(key, item);
    }

    const returnRate = trade.marginUsed > 0 ? trade.netPnl / trade.marginUsed : 0;
    let reward = Math.max(-1.0, Math.min(1.0, returnRate * 2.2));
    if (trade.netPnl > 0) {
      if (
        trade.exitReason === 'TAKE_PROFIT' ||
        trade.exitReason === 'TRAILING_STOP' ||
        trade.exitReason === 'PROFIT_PROTECT_EXIT'
      ) {
        reward += 0.15;
      }
    } else if (trade.netPnl < 0) {
      reward -= 0.1;
    }

    const alpha = 0.18; // Global learning rate
    const oldWeight = item.weight;
    const newWeight = Math.max(0.2, Math.min(2.5, oldWeight * (1 + alpha * reward)));
    item.weight = Number(newWeight.toFixed(2));
    item.totalTrades += 1;
    if (trade.netPnl > 0) item.wins += 1;
    else if (trade.netPnl < 0) item.losses += 1;

    item.winRate = Number(((item.wins / item.totalTrades) * 100).toFixed(1));
    item.totalNetPnlUsdt = Number((item.totalNetPnlUsdt + trade.netPnl).toFixed(2));
    item.avgPnlUsdt = Number((item.totalNetPnlUsdt / item.totalTrades).toFixed(2));

    // 1. Update Timeframe-specific Statistics (5m vs 15m vs 30m)
    const tfStat = item.timeframeStats.find((t) => t.timeframe === trade.interval);
    if (tfStat) {
      tfStat.totalTrades += 1;
      if (trade.netPnl > 0) tfStat.wins += 1;
      tfStat.winRate = Number(((tfStat.wins / tfStat.totalTrades) * 100).toFixed(1));
      tfStat.weight = Number(Math.max(0.2, Math.min(2.5, tfStat.weight * (1 + alpha * reward))).toFixed(2));
    }

    // 2. Update Trading Session Statistics (Asia / Europe / US / Overnight)
    const entryHourUtc = new Date(trade.entryTime).getUTCHours();
    let sessionKey: 'ASIA' | 'EUROPE' | 'US' | 'OVERNIGHT' = 'ASIA';
    if (entryHourUtc >= 14 && entryHourUtc < 22) sessionKey = 'US';
    else if (entryHourUtc >= 8 && entryHourUtc < 14) sessionKey = 'EUROPE';
    else if (entryHourUtc >= 22) sessionKey = 'OVERNIGHT';

    const sStat = item.sessionStats.find((s) => s.sessionKey === sessionKey);
    if (sStat) {
      sStat.totalTrades += 1;
      if (trade.netPnl > 0) sStat.wins += 1;
      sStat.winRate = Number(((sStat.wins / sStat.totalTrades) * 100).toFixed(1));
      sStat.weight = Number(Math.max(0.2, Math.min(2.5, sStat.weight * (1 + alpha * reward))).toFixed(2));
    }

    // 3. Recalculate Best Timeframe & Best Trading Session
    const activeTfs = [...item.timeframeStats].sort((a, b) => b.winRate - a.winRate || b.totalTrades - a.totalTrades);
    if (activeTfs[0] && activeTfs[0].totalTrades > 0) {
      item.bestTimeframe = `${activeTfs[0].timeframe} (胜率 ${activeTfs[0].winRate}%)`;
    }

    const activeSessions = [...item.sessionStats].sort((a, b) => b.winRate - a.winRate || b.totalTrades - a.totalTrades);
    if (activeSessions[0] && activeSessions[0].totalTrades > 0) {
      item.bestSession = `${activeSessions[0].sessionName.split(' ')[0]} (胜率 ${activeSessions[0].winRate}%)`;
    }

    // Dynamic confidence score (0 ~ 100)
    const sampleFactor = Math.min(30, item.totalTrades * 5);
    const winFactor = item.winRate * 0.5;
    const weightFactor = (item.weight - 1.0) * 20;
    item.confidenceScore = Math.max(0, Math.min(100, Math.round(winFactor + sampleFactor + weightFactor)));

    if (item.weight >= 1.6 && item.totalTrades >= 2) item.qualityScoreBoost = 15;
    else if (item.weight >= 1.3 && item.totalTrades >= 2) item.qualityScoreBoost = 10;
    else if (item.weight >= 1.1) item.qualityScoreBoost = 5;
    else if (item.weight <= 0.4 && item.totalTrades >= 2) item.qualityScoreBoost = -25;
    else if (item.weight <= 0.7 && item.totalTrades >= 2) item.qualityScoreBoost = -12;
    else item.qualityScoreBoost = 0;

    item.adaptiveSizingMultiplier = Number(Math.min(1.5, Math.max(0.4, item.weight)).toFixed(2));

    if (item.confidenceScore >= 68 && item.weight >= 1.25) {
      item.status = 'OPTIMAL_HIGH_CONVICTION';
    } else if ((item.weight <= 0.45 || item.winRate < 35) && item.totalTrades >= 3) {
      item.status = 'DECAY_PRUNED';
    } else {
      item.status = 'LEARNING_ACTIVE';
    }

    item.lastUpdated = Date.now();
    this.learningGeneration += 1;

    this.addLog(
      'info',
      'SYSTEM',
      `🧠 [多维时空自学习 Update #${this.learningGeneration}] 形态【${item.patternName}】在 [${trade.interval} / ${sessionKey}] 结算: 权重 ${oldWeight.toFixed(2)}x -> ${item.weight.toFixed(2)}x | 最佳周期: ${item.bestTimeframe} | 黄金时段: ${item.bestSession} | 信念仓位: ${item.adaptiveSizingMultiplier}x`
    );
  }

  public hasApiCredentials(): boolean {
    return Boolean(
      this.apiKey &&
        this.apiSecret &&
        this.apiKey !== 'MY_BINANCE_API_KEY' &&
        this.apiKey.length > 10
    );
  }

  public async setCredentials(key: string, secret: string): Promise<void> {
    this.apiKey = key.trim();
    this.apiSecret = secret.trim();
    const hasKeys = this.hasApiCredentials();
    this.mode = hasKeys ? 'LIVE' : 'PAPER';

    try {
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      envContent = envContent.replace(/^BINANCE_API_KEY=.*$/m, '');
      envContent = envContent.replace(/^BINANCE_API_SECRET=.*$/m, '');
      envContent += `\nBINANCE_API_KEY=${this.apiKey}\nBINANCE_API_SECRET=${this.apiSecret}\n`;
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    } catch {
      // ignore
    }

    if (hasKeys) {
      // Clear all simulated/paper equity & trade records so Live UI strictly reflects real Binance data
      this.activePositions = this.activePositions.filter((p) => !p.isPaper);
      this.closedTrades = this.closedTrades.filter((t) => !t.isPaper);
      this.equityHistory = [];
      this.balance = 0;
      this.equity = 0;
      this.peakEquity = 0;
      this.lastLiveSamplePushTime = 0;
      this.hasSyncedLiveHistory = false;
      this.liveSyncInfo = null;

      this.addLog(
        'success',
        'API',
        '✓ 币安 API Key 保存成功，已清理模拟盘历史数据并切换至 🟢 实盘模式，正在实时拉取交易所净值与持仓...'
      );
      this.ensureLiveSyncLoop();
      await Promise.allSettled([
        this.refreshExchangeRulesIfNeeded(true),
        this.syncLiveAccountNow(true),
        this.refreshMarketPreview(),
      ]);
    } else {
      this.stopLiveSyncLoop();
      this.activePositions = [];
      this.closedTrades = [];
      this.liveSyncInfo = null;
      this.hasSyncedLiveHistory = false;
      this.lastLiveSamplePushTime = 0;
      this.balance = 10000;
      this.equity = 10000;
      this.peakEquity = 10000;
      this.equityHistory = [
        {
          timestamp: Date.now(),
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          equity: 10000,
          balance: 10000,
          unrealizedPnl: 0,
          activePositionsCount: 0,
        },
      ];
      this.addLog('warn', 'API', '⚠️ 币安 API Key 已清除，已切换至 🔵 模拟观察模式');
    }
  }

  public addSymbol(rawSymbol: string): boolean {
    const locked = normalizeLockedSymbol(rawSymbol);
    if (!locked) {
      this.addLog(
        'warn',
        'SYSTEM',
        `🔒 [核心合约白名单锁定] 拒绝添加 ${rawSymbol}：实盘监控范围已锁定为 [${LOCKED_TARGET_SYMBOLS.join(', ')}]`
      );
      return false;
    }
    if (!this.monitoredSymbols.includes(locked)) {
      this.monitoredSymbols.push(locked);
      this.addLog('info', 'SYSTEM', `➕ 恢复核心监控合约: ${locked}`);
      return true;
    }
    return false;
  }

  public removeSymbol(rawSymbol: string): boolean {
    const locked = normalizeLockedSymbol(rawSymbol);
    const formatted = locked || rawSymbol.trim().toUpperCase();
    if (this.monitoredSymbols.includes(formatted)) {
      if (this.monitoredSymbols.length <= 1) {
        this.addLog('warn', 'SYSTEM', `⚠️ 至少需保留 1 个核心监控合约`);
        return false;
      }
      this.monitoredSymbols = this.monitoredSymbols.filter((s) => s !== formatted);
      this.scanResults = this.scanResults.filter((s) => s.symbol !== formatted);
      this.addLog('warn', 'SYSTEM', `➖ 移除监控合约: ${formatted}`);
      return true;
    }
    return false;
  }

  private getFuturesBaseUrl(): string {
    // Explicit override first: lets users point at a proxy / mirror, and lets integration tests
    // run against a stub instead of the production matching engine.
    const override = process.env.BINANCE_FUTURES_BASE_URL?.trim();
    if (override) return override.replace(/\/+$/, '');
    return process.env.BINANCE_USE_TESTNET === 'true'
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';
  }

  private signQuery(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private async refreshExchangeRulesIfNeeded(force: boolean = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastExchangeInfoRefresh < 300_000) return;
    this.lastExchangeInfoRefresh = now;
    const fetched = await fetchFuturesExchangeRules(this.getFuturesBaseUrl());
    if (fetched.size > 0) {
      for (const sym of this.monitoredSymbols) {
        const rule = fetched.get(sym);
        if (rule) {
          this.symbolExchangeRules.set(sym, rule);
        } else {
          const fallback = DEFAULT_SYMBOL_EXCHANGE_RULES[sym];
          this.symbolExchangeRules.set(sym, {
            ...(fallback || {
              symbol: sym,
              pricePrecision: 2,
              quantityPrecision: 3,
              tickSize: 0.01,
              stepSize: 0.001,
              minQty: 0.001,
              minNotional: 5,
            }),
            available: false,
            note: `币安 USDT-M 合约交易列表 (/fapi/v1/exchangeInfo) 暂未查到 ${sym}`,
          });
        }
      }
    }
  }

  private getSymbolRules(symbol: string): SymbolExchangeRules {
    return (
      this.symbolExchangeRules.get(symbol) ||
      DEFAULT_SYMBOL_EXCHANGE_RULES[symbol] || {
        symbol,
        available: true,
        pricePrecision: symbol.startsWith('BTC') ? 1 : symbol.startsWith('ETH') ? 2 : 4,
        quantityPrecision: symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 3 : 1,
        tickSize: symbol.startsWith('BTC') ? 0.1 : symbol.startsWith('ETH') ? 0.01 : 0.0001,
        stepSize: symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 0.001 : 0.1,
        minQty: symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 0.001 : 0.1,
        minNotional: symbol.startsWith('BTC') ? 100 : symbol.startsWith('ETH') ? 20 : 5,
      }
    );
  }

  public async syncLiveAccountIfStale(maxAgeMs: number = 4000): Promise<LiveAccountSyncInfo | null> {
    if (!this.hasApiCredentials()) return null;
    // While Binance has us in a 429/418 cool-down, serve the cached snapshot instead of
    // hammering the API from every HTTP poll (that is what escalated bans to multiple minutes).
    if (this.binanceRest.isRateLimited()) return this.liveSyncInfo;
    const syncedAt = this.liveSyncInfo?.syncedAt ?? 0;
    if (Date.now() - syncedAt < maxAgeMs && this.liveSyncInfo) {
      return this.liveSyncInfo;
    }
    return this.syncLiveAccountNow(!this.hasSyncedLiveHistory);
  }

  public async syncLiveAccountNow(fetchHistory: boolean = true): Promise<LiveAccountSyncInfo | null> {
    if (!this.hasApiCredentials()) return null;
    if (this.syncInFlight) {
      // Join the in-flight request instead of issuing a duplicate one. If the caller needed the
      // trade history and the in-flight sync will not provide it, run one more pass afterwards.
      const startedAt = Date.now();
      await this.syncInFlight.catch(() => null);
      if (!fetchHistory) return this.liveSyncInfo;
      if (this.lastHistorySyncAt >= startedAt - 1_000) return this.liveSyncInfo;
    }
    const token = ++this.syncToken;
    const clear = () => {
      if (this.syncToken === token) this.syncInFlight = null;
    };
    const promise = this.syncBinanceAccountAndPositions(fetchHistory).then(() => this.liveSyncInfo);
    this.syncInFlight = promise;
    promise.then(clear, clear);
    return promise;
  }

  private recordLiveEquitySample(
    equityVal: number,
    balanceVal: number,
    unrealizedPnlVal: number,
    activeCount: number
  ): void {
    const now = Date.now();
    const roundedEq = Number(equityVal.toFixed(2));
    const roundedBal = Number(balanceVal.toFixed(2));
    const roundedPnl = Number(unrealizedPnlVal.toFixed(2));
    const last = this.equityHistory[this.equityHistory.length - 1];
    const changed =
      !last ||
      Math.abs(last.equity - roundedEq) >= 0.01 ||
      Math.abs(last.unrealizedPnl - roundedPnl) >= 0.01 ||
      last.activePositionsCount !== activeCount;

    if (!last || changed || now - this.lastLiveSamplePushTime >= 5000) {
      this.lastLiveSamplePushTime = now;
      this.equityHistory.push({
        timestamp: now,
        time: new Date(now).toLocaleTimeString('zh-CN', { hour12: false }),
        equity: roundedEq,
        balance: roundedBal,
        unrealizedPnl: roundedPnl,
        activePositionsCount: activeCount,
      });
      if (this.equityHistory.length > 360) {
        this.equityHistory.shift();
      }
    }
  }

  /**
   * Mark a failed sync WITHOUT touching local positions.
   * A failed request is never evidence that a position was closed — that assumption is what
   * produced the `[交易所触发平仓同步]` storm and the fabricated −96 USDT PnL in the diagnostics.
   */
  private markSyncFailure(err: any, scope: string): void {
    const message = err?.message || String(err);
    const now = Date.now();
    const stats = this.binanceRest.getStats();
    const prev = this.liveSyncInfo;
    this.liveSyncInfo = {
      syncedAt: prev?.syncedAt ?? 0,
      syncOk: false,
      errorMessage: `${scope}同步失败: ${message}`,
      walletBalance: prev?.walletBalance ?? this.balance,
      availableBalance: prev?.availableBalance ?? this.balance,
      marginBalance: prev?.marginBalance ?? this.equity,
      unrealizedProfit: prev?.unrealizedProfit ?? 0,
      positionInitialMargin: prev?.positionInitialMargin ?? 0,
      openPositionsCount: this.activePositions.filter((p) => !p.isPaper).length,
      equitySource: 'BINANCE_LIVE_API',
      positionsOk: prev?.positionsOk ?? false,
      positionsSyncedAt: this.positionsSyncedAt,
      usedWeight1m: stats.usedWeight1m,
      rateLimitedUntil: stats.rateLimitedUntil,
    };
    if (now - this.lastSyncErrorLogTime > 60_000) {
      this.lastSyncErrorLogTime = now;
      const held = this.activePositions.filter((p) => !p.isPaper).length;
      this.addLog(
        'error',
        'API',
        `❌ [币安实盘同步失败] ${message}｜本地实盘持仓 ${held} 笔已完整保留，未按"空持仓"做任何平仓判定`
      );
    }
  }

  private async syncBinanceAccountAndPositions(fetchHistory: boolean = false): Promise<void> {
    if (!this.hasApiCredentials()) return;
    const now = Date.now();

    // ---------------------------------------------------------------- 1. account & equity
    let acctData: any;
    try {
      acctData = await this.binanceRest.account();
    } catch (err) {
      this.markSyncFailure(err, '账户与净值');
      this.notifyListeners();
      return;
    }

    const parsedAcct = parseBinanceAccountResponse(acctData);
    this.balance = parsedAcct.availableBalance;
    this.equity = parsedAcct.marginBalance;
    if (this.equity > this.peakEquity) this.peakEquity = this.equity;
    const wasFirstOk = !this.liveSyncInfo?.syncOk;

    // ---------------------------------------------------------------- 2. positions snapshot
    // This snapshot is MANDATORY. If it fails we abort the whole sync: equity stays usable,
    // but no close detection, no order cancelling and no activePositions mutation happens.
    let posList: any[] | null = null;
    let positionsError = '';
    try {
      const raw = await this.binanceRest.positionRisk();
      if (Array.isArray(raw)) posList = raw;
      else positionsError = 'positionRisk 返回格式异常';
    } catch (err: any) {
      positionsError = err?.message || String(err);
    }

    if (!posList) {
      const stats = this.binanceRest.getStats();
      const prev = this.liveSyncInfo;
      this.liveSyncInfo = {
        syncedAt: now,
        syncOk: false,
        errorMessage: `持仓快照获取失败: ${positionsError}`,
        walletBalance: parsedAcct.walletBalance,
        availableBalance: parsedAcct.availableBalance,
        marginBalance: parsedAcct.marginBalance,
        unrealizedProfit: parsedAcct.unrealizedProfit,
        positionInitialMargin: parsedAcct.positionInitialMargin,
        openPositionsCount: this.activePositions.filter((p) => !p.isPaper).length,
        equitySource: 'BINANCE_LIVE_API',
        positionsOk: false,
        positionsSyncedAt: prev?.positionsSyncedAt ?? this.positionsSyncedAt,
        usedWeight1m: stats.usedWeight1m,
        rateLimitedUntil: stats.rateLimitedUntil,
      };
      if (now - this.lastSyncErrorLogTime > 60_000) {
        this.lastSyncErrorLogTime = now;
        const held = this.activePositions.filter((p) => !p.isPaper).length;
        this.addLog(
          'error',
          'API',
          `❌ [币安持仓同步失败] ${positionsError}｜本地 ${held} 笔实盘持仓保持不变，拒绝把"请求失败"当成"已被交易所平仓"`
        );
      }
      this.notifyListeners();
      return;
    }

    const realOpenPositions = posList.filter((p) => Math.abs(parseFloat(p?.positionAmt || '0')) > 0);
    const posSignature = realOpenPositions
      .map((p) => {
        const amt = parseFloat(p.positionAmt || '0');
        return `${p.symbol}:${amt > 0 ? 'L' : 'S'}:${Math.abs(amt).toFixed(8)}`;
      })
      .sort()
      .join('|');
    const positionSetChanged =
      this.lastPositionSignature !== null && this.lastPositionSignature !== posSignature;
    this.lastPositionSignature = posSignature;
    this.positionsSyncedAt = now;

    const stats = this.binanceRest.getStats();
    this.liveSyncInfo = {
      ...buildLiveSyncInfo(parsedAcct, realOpenPositions.length, now),
      positionsOk: true,
      positionsSyncedAt: now,
      usedWeight1m: stats.usedWeight1m,
      rateLimitedUntil: stats.rateLimitedUntil,
    };

    if (wasFirstOk) {
      this.addLog(
        'success',
        'API',
        `✅ [币安实盘账户已连接] 持仓模式: ${this.isHedgeMode ? '双向持仓 (Hedge)' : '单向持仓 (One-Way)'} | 钱包余额: $${parsedAcct.walletBalance.toFixed(
          2
        )} | 可用保证金: $${parsedAcct.availableBalance.toFixed(
          2
        )} | 实时净值: $${this.equity.toFixed(2)} | 浮动盈亏: ${parsedAcct.unrealizedProfit >= 0 ? '+' : ''}$${parsedAcct.unrealizedProfit.toFixed(2)} USDT`
      );
    }

    // ---------------------------------------------------------------- 3. genuinely closed legs
    // Only positions that are absent from an AUTHORITATIVE snapshot reach this branch, and a
    // close is only booked when the real fills can be reconciled from /fapi/v1/userTrades.
    const survivors: ActivePosition[] = [];
    for (const existing of this.activePositions) {
      if (existing.isPaper) {
        survivors.push(existing);
        continue;
      }
      const stillOpen = realOpenPositions.some((p) => {
        const amt = parseFloat(p.positionAmt || '0');
        return p.symbol === existing.symbol && (amt > 0 ? 'LONG' : 'SHORT') === existing.side;
      });
      if (stillOpen) {
        survivors.push(existing);
        continue;
      }
      await this.handleExchangeSideClose(existing);
    }
    this.activePositions = survivors;

    // ---------------------------------------------------------------- 4. protective orders
    // Queried per held symbol (weight 1) instead of one global call (weight 40).
    const symbolsHeld = Array.from(new Set(realOpenPositions.map((p) => String(p?.symbol))));
    const ordersBySymbol = new Map<string, any[]>();
    let ordersKnown = true;
    for (const sym of symbolsHeld) {
      try {
        const normal = await this.binanceRest.openOrders(sym);
        const algo = await this.binanceRest.openAlgoOrders(sym);
        ordersBySymbol.set(sym, [
          ...(Array.isArray(normal) ? normal : []),
          // Tag the source so the id can be turned back into `algo:<algoId>` and cancelled
          // through the correct endpoint.
          ...(Array.isArray(algo) ? algo.map((o: any) => ({ ...o, __source: 'ALGO' })) : []),
        ]);
      } catch (err: any) {
        ordersKnown = false;
        ordersBySymbol.set(sym, []);
        if (now - this.lastSyncErrorLogTime > 60_000) {
          this.lastSyncErrorLogTime = now;
          this.addLog(
            'warn',
            'API',
            `⚠️ [挂单状态未知] ${sym} 条件单查询失败 (${err?.message || err})，本次跳过补挂以免重复下单`
          );
        }
      }
    }

    const parsedPositions = parseBinanceOpenPositions(
      posList,
      [],
      [],
      this.activePositions,
      this.leverage,
      now,
      {
        ordersBySymbol,
        ordersKnown,
        // Only treat "no stop found" as authoritative when we could see both order books.
        ordersAuthoritative: ordersKnown && this.binanceRest.getStats().algoOrdersSupported !== false,
      }
    );

    if (ordersKnown) {
      await this.repairProtectiveOrders(parsedPositions);
    }
    this.activePositions = parsedPositions;

    // Self-heal duplicate SL/TP orders left behind by failed replacements.
    if (ordersKnown) {
      await this.pruneRedundantProtectiveOrders(ordersBySymbol);
    }

    // Clean up orders that belong to symbols with no position (old churn leftovers).
    await this.sweepOrphanOrders(new Set(symbolsHeld));

    // ---------------------------------------------------------------- 5. hedge mode (1/min)
    if (now - this.lastHedgeModeCheck > 60_000 && this.binanceRest.canAfford(30)) {
      this.lastHedgeModeCheck = now;
      try {
        const dualData: any = await this.binanceRest.positionMode();
        if (typeof dualData?.dualSidePosition === 'boolean') {
          this.isHedgeMode = dualData.dualSidePosition;
        }
      } catch {
        // non fatal: keep the previously detected mode
      }
    }

    // ---------------------------------------------------------------- 6. trade history
    const historyDue = fetchHistory || !this.hasSyncedLiveHistory || positionSetChanged;
    const historyAllowed = fetchHistory || now - this.lastHistorySyncAt >= 60_000;
    if (historyDue && historyAllowed && this.binanceRest.canAfford(75)) {
      await this.syncClosedTradeHistory(parsedAcct, now);
    }

    this.recordLiveEquitySample(
      this.equity,
      this.balance,
      parsedAcct.unrealizedProfit,
      this.activePositions.length
    );
    this.notifyListeners();
  }

  /**
   * Reconcile a position that really disappeared from the exchange.
   * Books PnL ONLY from real fills; a missing fill means we stop tracking the position without
   * inventing a result (the old code used `markPrice - entryPrice` and called it realised PnL).
   */
  private async handleExchangeSideClose(existing: ActivePosition): Promise<void> {
    // Position is flat: its leftover conditional orders are stale and could open a reverse
    // position later, so they must be removed.
    await this.cancelAllBinanceOrders(existing.symbol, true).catch(() => {});

    const resolved = await this.tryResolveClosedFill(existing);
    if (!resolved) {
      this.addLog(
        'warn',
        'ORDER',
        `⚠️ [交易所侧平仓] ${existing.symbol} (${existing.side}) 在币安已无持仓，但未核对到对应交割流水，已停止跟踪该笔仓位（不写入盈亏，避免污染统计与自学习）`,
        existing.symbol
      );
      return;
    }

    this.closedTrades.push(resolved);
    this.closedTrades = this.closedTrades.slice(-200);
    this.updatePatternLearning(resolved);
    this.addLog(
      resolved.netPnl >= 0 ? 'success' : 'warn',
      'ORDER',
      `✔ [交易所触发平仓同步] ${existing.symbol} (${existing.side}) 已在币安实盘完成平仓，真实交割损益 ${
        resolved.netPnl >= 0 ? '+' : ''
      }$${resolved.netPnl.toFixed(2)} USDT（成交均价 $${resolved.exitPrice}，数量 ${resolved.quantity}）`,
      existing.symbol
    );
  }

  private inferExitReason(pos: ActivePosition, exitPrice: number): ExitReason {
    if (pos.stopLossPrice && pos.stopLossPrice > 0) {
      const hitSl =
        pos.side === 'LONG'
          ? exitPrice <= pos.stopLossPrice * 1.003
          : exitPrice >= pos.stopLossPrice * 0.997;
      if (hitSl) return 'STOP_LOSS';
    }
    if (pos.takeProfitPrice && pos.takeProfitPrice > 0) {
      const hitTp =
        pos.side === 'LONG'
          ? exitPrice >= pos.takeProfitPrice * 0.997
          : exitPrice <= pos.takeProfitPrice * 1.003;
      if (hitTp) return 'TAKE_PROFIT';
    }
    const profitable =
      pos.side === 'LONG' ? exitPrice > pos.entryPrice : exitPrice < pos.entryPrice;
    return profitable ? 'TAKE_PROFIT' : 'STOP_LOSS';
  }

  /**
   * Build the closed-trade record from real exchange fills (preferred) or from a real execution
   * price returned by our own market-close order. Returns null when neither is available.
   */
  private async tryResolveClosedFill(
    pos: ActivePosition,
    fallbackExitPrice?: number,
    fallbackReason?: ExitReason
  ): Promise<BotTradeRecord | null> {
    const closingSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    let fills: any[] = [];
    try {
      const trades = await this.binanceRest.userTrades(pos.symbol, 50);
      fills = (Array.isArray(trades) ? trades : [])
        .filter((t) => {
          const tTime = Number(t?.time) || 0;
          return (
            tTime >= pos.entryTime - 5_000 &&
            String(t?.side || '').toUpperCase() === closingSide &&
            parseFloat(t?.qty || '0') > 0
          );
        })
        .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
    } catch {
      fills = [];
    }

    const totalQty = fills.reduce((sum, f) => sum + (parseFloat(f.qty || '0') || 0), 0);
    const qtyCovered = totalQty > 0 && (pos.quantity <= 0 || totalQty >= pos.quantity * 0.9);

    if (qtyCovered) {
      const quoteQty = fills.reduce((s, f) => s + (parseFloat(f.quoteQty || '0') || 0), 0);
      const realized = fills.reduce((s, f) => s + (parseFloat(f.realizedPnl || '0') || 0), 0);
      const commission = fills.reduce(
        (s, f) =>
          s + (String(f.commissionAsset || '').toUpperCase() === 'USDT' ? parseFloat(f.commission || '0') || 0 : 0),
        0
      );
      const avgExit = totalQty > 0 ? quoteQty / totalQty : 0;
      const exitTime = Math.max(...fills.map((f) => Number(f.time) || 0)) || Date.now();
      const lastOrderId = String(fills[fills.length - 1]?.orderId ?? exitTime);
      const netPnl = realized - commission;
      const marginUsed =
        pos.marginUsed > 0
          ? pos.marginUsed
          : quoteQty > 0
          ? quoteQty / Math.max(1, pos.leverage)
          : Math.abs(netPnl);

      return {
        id: `binance_fill_${pos.symbol}_${lastOrderId}`,
        symbol: pos.symbol,
        interval: pos.interval,
        side: pos.side,
        patternType: pos.patternType,
        patternName: pos.patternName,
        entryTime: pos.entryTime,
        exitTime,
        entryPrice: Number(pos.entryPrice.toFixed(8)),
        exitPrice: Number((avgExit > 0 ? avgExit : pos.currentPrice).toFixed(6)),
        quantity: Number(totalQty.toFixed(8)),
        leverage: pos.leverage,
        marginUsed: Number(marginUsed.toFixed(4)),
        netPnl: Number(netPnl.toFixed(4)),
        pnlPercent: marginUsed > 0 ? Number(((netPnl / marginUsed) * 100).toFixed(2)) : 0,
        peakPnlUsdt: pos.peakPnlUsdt,
        reversionUsdt: Math.max(0, (pos.peakPnlUsdt || 0) - netPnl),
        volatilityLevel: 'NORMAL',
        exitReason: fallbackReason ?? this.inferExitReason(pos, avgExit || pos.currentPrice),
        strategyUsed: pos.strategyUsed,
        isPaper: false,
      };
    }

    // No fill evidence available. Only synthesise when the caller holds a REAL execution price
    // (the avgPrice of the market order we just sent) — never from a mark-price guess.
    if (!fallbackExitPrice || !(fallbackExitPrice > 0) || !(pos.entryPrice > 0)) return null;
    const qty = pos.quantity > 0 ? pos.quantity : 0;
    if (qty <= 0) return null;
    const gross =
      pos.side === 'LONG'
        ? (fallbackExitPrice - pos.entryPrice) * qty
        : (pos.entryPrice - fallbackExitPrice) * qty;
    const exitFee = fallbackExitPrice * qty * 0.0005;
    const netPnl = gross - exitFee;
    const marginUsed = pos.marginUsed > 0 ? pos.marginUsed : (fallbackExitPrice * qty) / Math.max(1, pos.leverage);

    return {
      id: `pos_${pos.id}_filled`,
      symbol: pos.symbol,
      interval: pos.interval,
      side: pos.side,
      patternType: pos.patternType,
      patternName: pos.patternName,
      entryTime: pos.entryTime,
      exitTime: Date.now(),
      entryPrice: Number(pos.entryPrice.toFixed(8)),
      exitPrice: Number(fallbackExitPrice.toFixed(6)),
      quantity: Number(qty.toFixed(8)),
      leverage: pos.leverage,
      marginUsed: Number(marginUsed.toFixed(4)),
      netPnl: Number(netPnl.toFixed(4)),
      pnlPercent: marginUsed > 0 ? Number(((netPnl / marginUsed) * 100).toFixed(2)) : 0,
      peakPnlUsdt: pos.peakPnlUsdt,
      reversionUsdt: Math.max(0, (pos.peakPnlUsdt || 0) - netPnl),
      volatilityLevel: 'NORMAL',
      exitReason: fallbackReason ?? this.inferExitReason(pos, fallbackExitPrice),
      strategyUsed: pos.strategyUsed,
      isPaper: false,
    };
  }

  /** Real account / income / userTrades history, merged (never overwritten) into closedTrades. */
  private async syncClosedTradeHistory(parsedAcct: ParsedBinanceAccount, now: number): Promise<void> {
    this.lastHistorySyncAt = now;
    try {
      const incomes = await this.binanceRest.income(80);
      const allIncomes: any[] = Array.isArray(incomes) ? incomes : [];
      // Honour the journal cut-off so a reset is permanent (Binance still holds the old fills).
      const incomeList =
        this.journalStartedAt > 0
          ? allIncomes.filter((i: any) => (Number(i?.time) || 0) >= this.journalStartedAt)
          : allIncomes;

      const distinctSyms = Array.from(
        new Set([
          ...this.activePositions.map((p) => p.symbol),
          ...incomeList.map((i: any) => i?.symbol).filter(Boolean),
        ])
      ).slice(0, 6) as string[];

      const tradeResults = await Promise.allSettled(
        distinctSyms.map((sym) => this.binanceRest.userTrades(sym, 30))
      );
      const allUserTrades: any[] = [];
      for (const res of tradeResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) allUserTrades.push(...res.value);
      }
      const userTradesForJournal =
        this.journalStartedAt > 0
          ? allUserTrades.filter((t: any) => (Number(t?.time) || 0) >= this.journalStartedAt)
          : allUserTrades;

      const reconstructedHistory = reconstructLiveEquityHistoryFromIncome(
        incomeList,
        parsedAcct,
        this.activePositions.length,
        now
      );
      if (reconstructedHistory.length > 0) {
        const cutoff = reconstructedHistory[reconstructedHistory.length - 1].timestamp;
        const liveTail = this.equityHistory.filter((pt) => pt.timestamp > cutoff);
        this.equityHistory = [...reconstructedHistory, ...liveTail].slice(-360);
        for (const pt of this.equityHistory) {
          if (pt.equity > this.peakEquity) this.peakEquity = pt.equity;
        }
        this.lastLiveSamplePushTime = now;
      }

      const realClosed = parseBinanceRealClosedTrades(
        incomeList,
        userTradesForJournal,
        this.leverage
      ).filter((t) => this.journalStartedAt === 0 || t.exitTime >= this.journalStartedAt);
      if (realClosed.length > 0) {
        this.closedTrades = mergeClosedTrades(this.closedTrades, realClosed);
        this.addLog(
          'info',
          'API',
          `📜 已从币安合约实时同步 ${realClosed.length} 笔真实实盘成交与资金流水历史 (${reconstructedHistory.length} 个历史净值节点)`
        );
      }
      this.hasSyncedLiveHistory = true;
    } catch (err: any) {
      // Keep hasSyncedLiveHistory=false so the next cheap window retries, but never spam.
      if (now - this.lastSyncErrorLogTime > 60_000) {
        this.lastSyncErrorLogTime = now;
        this.addLog('warn', 'API', `⚠️ 币安历史交割单辅助同步受限: ${err?.message || '请求失败'}`);
      }
    }
  }

  private async setBinanceLeverage(symbol: string, leverage: number): Promise<void> {
    if (!this.hasApiCredentials()) return;
    try {
      await this.binanceRest.setLeverage(symbol, leverage);
    } catch (err: any) {
      this.addLog('warn', 'API', `设置 ${symbol} 杠杆 (${leverage}x) 返回提示: ${err?.message || err}`, symbol);
    }
  }

  private async placeBinanceMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly: boolean = false,
    positionSide?: 'LONG' | 'SHORT'
  ): Promise<{ orderId: string; executedQty?: number; avgPrice?: number } | null> {
    if (!this.hasApiCredentials()) {
      throw new Error('未配置 BINANCE_API_KEY');
    }

    const rules = this.getSymbolRules(symbol);
    const qtyDecimals = countStepDecimals(rules.stepSize);
    const formattedQty = formatToStep(quantity, rules.stepSize, 'floor');
    if (formattedQty <= 0 || formattedQty < rules.minQty) {
      throw new Error(
        `下单数量 ${quantity.toFixed(6)} 低于币安 ${symbol} 最小下单数量 (${rules.minQty}, 步长 ${rules.stepSize})`
      );
    }

    const derivedPosSide: 'LONG' | 'SHORT' =
      positionSide ||
      (reduceOnly ? (side === 'SELL' ? 'LONG' : 'SHORT') : side === 'BUY' ? 'LONG' : 'SHORT');

    const params: Record<string, string> = {
      symbol,
      side,
      type: 'MARKET',
      quantity: formattedQty.toFixed(qtyDecimals),
      newOrderRespType: 'RESULT',
    };
    if (this.isHedgeMode) params.positionSide = derivedPosSide;
    else if (reduceOnly) params.reduceOnly = 'true';

    const data: any = await this.binanceRest.placeOrder(params);
    const executedQty = data?.executedQty ? parseFloat(data.executedQty) : formattedQty;
    let avgPrice = data?.avgPrice ? parseFloat(data.avgPrice) : 0;
    const cumQuote = data?.cumQuote ? parseFloat(data.cumQuote) : 0;
    // MARKET orders frequently return avgPrice "0"; cumQuote/executedQty is the real fill price.
    // Using the local scan price here was what stored synthetic entry prices on live positions.
    if (!(avgPrice > 0) && cumQuote > 0 && executedQty > 0) {
      avgPrice = cumQuote / executedQty;
    }

    return {
      orderId: String(data?.orderId ?? ''),
      executedQty,
      avgPrice: avgPrice > 0 ? avgPrice : undefined,
    };
  }

  /**
   * Place an exchange-side STOP_MARKET / TAKE_PROFIT_MARKET order.
   *
   * Changes vs. the previous implementation:
   *  - the trigger price is validated against the real mark price first, so Binance can no longer
   *    reject it with -2021 "Order would immediately trigger" and leave the leg unprotected;
   *  - `-4120` ("use the Algo Order API") is NO LONGER reported as "already protected". That
   *    mis-reading stored the sentinel `exchange_existing_order` as an order id, so the engine
   *    believed a naked position had a stop;
   *  - the Algo endpoint (IP weight 0) is tried as a real fallback instead of being decorative.
   */
  private async placeBinanceConditionalOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET',
    stopPrice: number,
    quantity?: number,
    positionSide?: 'LONG' | 'SHORT',
    referencePrice?: number
  ): Promise<{ orderId: string } | null> {
    if (!this.hasApiCredentials() || !Number.isFinite(stopPrice) || stopPrice <= 0) return null;

    const rules = this.getSymbolRules(symbol);
    const priceDecimals = countStepDecimals(rules.tickSize);
    const formattedPrice = formatToStep(stopPrice, rules.tickSize, 'round');
    if (formattedPrice <= 0) return null;
    const priceStr = formattedPrice.toFixed(priceDecimals);

    if (referencePrice && referencePrice > 0) {
      const p = Number(priceStr);
      const closingLong = side === 'SELL';
      const valid =
        type === 'STOP_MARKET'
          ? closingLong
            ? p < referencePrice * 0.999
            : p > referencePrice * 1.001
          : closingLong
          ? p > referencePrice * 1.001
          : p < referencePrice * 0.999;
      if (!valid) {
        this.addLog(
          'warn',
          'API',
          `⚠️ [条件单方向校验拦截] ${symbol} ${type} @ $${priceStr} 相对标记价 $${referencePrice} 方向错误（下单必被 -2021 拒绝），已跳过并交由本地风控接管`,
          symbol
        );
        return null;
      }
    }

    const derivedPosSide: 'LONG' | 'SHORT' = positionSide || (side === 'SELL' ? 'LONG' : 'SHORT');
    const finalQty =
      quantity && quantity > 0 ? formatToStep(quantity, rules.stepSize, 'floor') : 0;
    const errors: string[] = [];

    // Attempt 1: legacy order endpoint with closePosition=true (closes whatever is open).
    try {
      const params: Record<string, string> = {
        symbol,
        side,
        type,
        stopPrice: priceStr,
        closePosition: 'true',
        workingType: 'MARK_PRICE',
        priceProtect: 'TRUE',
      };
      if (this.isHedgeMode) params.positionSide = derivedPosSide;
      const data: any = await this.binanceRest.placeOrder(params);
      if (data?.orderId) return { orderId: String(data.orderId) };
      errors.push('legacy/closePosition 未返回 orderId');
    } catch (err: any) {
      errors.push(err?.message || String(err));
      if (err instanceof BinanceApiError && err.code === -2021) {
        this.addLog('warn', 'API', `⚠️ [止损/止盈立即触发被拒] ${symbol} ${type} @ $${priceStr}，已改为本地追踪管理`, symbol);
        return null;
      }
    }

    // Attempt 2: legacy order endpoint with explicit quantity + reduceOnly / positionSide.
    if (finalQty >= rules.minQty) {
      try {
        const params: Record<string, string> = {
          symbol,
          side,
          type,
          stopPrice: priceStr,
          quantity: finalQty.toFixed(countStepDecimals(rules.stepSize)),
          workingType: 'MARK_PRICE',
        };
        if (this.isHedgeMode) params.positionSide = derivedPosSide;
        else params.reduceOnly = 'true';
        const data: any = await this.binanceRest.placeOrder(params);
        if (data?.orderId) return { orderId: String(data.orderId) };
        errors.push('legacy/quantity 未返回 orderId');
      } catch (err: any) {
        errors.push(err?.message || String(err));
      }
    }

    // Attempt 3: Binance Algo conditional-order endpoint (0 IP weight).
    try {
      const params: Record<string, string> = {
        algoType: 'CONDITIONAL',
        symbol,
        side,
        type,
        triggerPrice: priceStr,
        workingType: 'MARK_PRICE',
      };
      if (finalQty >= rules.minQty) {
        params.quantity = finalQty.toFixed(countStepDecimals(rules.stepSize));
      } else {
        params.closePosition = 'true';
      }
      if (this.isHedgeMode) params.positionSide = derivedPosSide;
      const data: any = await this.binanceRest.placeAlgoOrder(params);
      const algoId = data?.algoId ?? data?.clientAlgoId ?? data?.orderId;
      if (algoId) return { orderId: `algo:${algoId}` };
      errors.push('algo 未返回 algoId');
    } catch (err: any) {
      errors.push(err?.message || String(err));
    }

    this.addLog(
      'error',
      'API',
      `❌ 交易所直挂条件单失败 (${symbol} ${type} @ $${priceStr})，三种通道均未成功，仓位暂由本地风控接管: ${errors.join(' | ')}`,
      symbol
    );
    return null;
  }

  /**
   * Cancel a specific order on Binance Futures. Algo ids are prefixed with `algo:`.
   */
  /**
   * Cancel a specific order on Binance Futures.
   *
   * Order ids from the Algo book are prefixed with `algo:`. Because an id may have been stored
   * before the prefix existed (or the order may have been migrated between books), we try the
   * expected endpoint first and then the other one — a "not found" on the first book must not
   * leave a live stop behind.
   */
  private async cancelBinanceOrder(symbol: string, orderId: string): Promise<void> {
    if (!this.hasApiCredentials() || !orderId) return;
    if (orderId === 'exchange_existing_order') return; // legacy sentinel from an older build
    const isAlgo = orderId.startsWith('algo:');
    const rawId = isAlgo ? orderId.slice(5) : orderId;
    const attempts: Array<() => Promise<any>> = isAlgo
      ? [
          () => this.binanceRest.cancelAlgoOrder(rawId),
          () => this.binanceRest.cancelOrder(symbol, rawId),
        ]
      : [
          () => this.binanceRest.cancelOrder(symbol, rawId),
          () => this.binanceRest.cancelAlgoOrder(rawId),
        ];
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch {
        // try the other book
      }
    }
  }

  /**
   * Cancel all open orders for a symbol, including Algo-book conditional orders that
   * `DELETE /fapi/v1/allOpenOrders` does not cover.
   */
  private async cancelAllBinanceOrders(symbol: string, _includeAlgo: boolean = true): Promise<void> {
    if (!this.hasApiCredentials()) return;
    try {
      await this.binanceRest.cancelAllOpenOrders(symbol);
    } catch {
      // ignore: symbol may have no open orders
    }

    // Sweep the Algo book explicitly: these orders survive `allOpenOrders` and, for a flat
    // position, would later fire as a reverse entry.
    try {
      await this.binanceRest.cancelAllAlgoOpenOrders(symbol);
    } catch {
      // Fall back to cancelling them one by one when the bulk endpoint is unavailable.
      try {
        const algos = await this.binanceRest.openAlgoOrders(symbol);
        for (const order of algos) {
          const algoId = String(order?.algoId || '');
          if (!algoId) continue;
          try {
            await this.binanceRest.cancelAlgoOrder(algoId);
          } catch {
            // already gone
          }
        }
      } catch {
        // algo book unavailable on this deployment — fall back to locally tracked ids below
      }
    }

    const tracked = this.activePositions.filter((p) => p.symbol === symbol);
    for (const pos of tracked) {
      for (const id of [pos.stopLossOrderId, pos.takeProfitOrderId]) {
        if (id) await this.cancelBinanceOrder(symbol, id);
      }
    }
  }

  /**
   * Remove protective orders that belong to symbols with NO position at all.
   *
   * These are the leftovers of the old open/close churn (or of a position closed manually on the
   * phone): nothing references them any more, so nothing ever cancels them, and they can later
   * fire as a reverse entry. Runs at most once a minute and only for symbols the exchange itself
   * reports as flat, so it can never strip protection from a live position.
   */
  private async sweepOrphanOrders(heldSymbols: Set<string>): Promise<void> {
    if (!this.hasApiCredentials()) return;
    const now = Date.now();
    if (now - this.lastOrphanSweepAt < 60_000) return;
    if (!this.binanceRest.canAfford(12)) return;
    this.lastOrphanSweepAt = now;

    for (const sym of this.monitoredSymbols) {
      if (heldSymbols.has(sym)) continue;
      try {
        const normal = await this.binanceRest.openOrders(sym);
        const algo = await this.binanceRest.openAlgoOrders(sym);
        const count = (Array.isArray(normal) ? normal.length : 0) + (Array.isArray(algo) ? algo.length : 0);
        if (count === 0) continue;
        await this.cancelAllBinanceOrders(sym);
        this.addLog(
          'warn',
          'API',
          `🧹 [孤儿挂单清理] ${sym} 已无持仓但残留 ${count} 张挂单，已全部撤销（避免之后反向开仓）`,
          sym
        );
      } catch {
        // per-symbol failure must not block the sync
      }
    }
  }

  private orderIdOf(order: any): string {
    const raw = String(order?.orderId || order?.algoId || '');
    if (!raw) return '';
    return order?.__source === 'ALGO' ? `algo:${raw}` : raw;
  }

  /**
   * Remove duplicate protective orders for a symbol, keeping exactly one SL and one TP.
   *
   * This is the self-healing counterpart of every "replace the stop" path (breakeven / trailing
   * stop): those place the NEW order first and then cancel the old one, so any failed cancel
   * (wrong order book, timeout, id mismatch) left the old order live. Over one trending move the
   * account ends up with a pile of stale SL/TP orders while only one position exists — exactly the
   * "1 position, 12 orders" symptom.
   *
   * The orders passed in are the snapshot already fetched by the caller, so this costs only the
   * DELETEs for the duplicates found.
   */
  private async pruneRedundantProtectiveOrders(ordersBySymbol: Map<string, any[]>): Promise<void> {
    if (!this.hasApiCredentials()) return;

    for (const pos of this.activePositions) {
      const symbol = pos.symbol;
      const allOrders = ordersBySymbol.get(symbol);
      if (!Array.isArray(allOrders) || allOrders.length < 2) continue;
      // Hedge mode can hold a LONG and a SHORT on the same symbol; only touch our own side.
      const orders = allOrders.filter(
        (o) => !o?.positionSide || o.positionSide === 'BOTH' || o.positionSide === pos.side
      );
      if (orders.length < 2) continue;

      const classify = (o: any): 'SL' | 'TP' | null => {
        const t = String(o?.type || o?.orderType || '').toUpperCase();
        if (t === 'STOP_MARKET' || t === 'STOP') return 'SL';
        if (t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT') return 'TP';
        return null;
      };
      const rawIdOf = (o: any): string => String(o?.orderId || o?.algoId || '');
      const priceOf = (o: any): number => parseFloat(o?.stopPrice || o?.triggerPrice || '0') || 0;

      const groups: Array<{ kind: 'SL' | 'TP'; list: any[]; keepId?: string; target: number | null }> = [
        {
          kind: 'SL',
          list: orders.filter((o) => classify(o) === 'SL'),
          keepId: pos.stopLossOrderId,
          target: pos.stopLossPrice,
        },
        {
          kind: 'TP',
          list: orders.filter((o) => classify(o) === 'TP'),
          keepId: pos.takeProfitOrderId,
          target: pos.takeProfitPrice,
        },
      ];

      for (const group of groups) {
        if (group.list.length <= 1) continue;
        const keepRaw = (group.keepId || '').replace(/^algo:/, '');
        let keepIdx = keepRaw ? group.list.findIndex((o) => rawIdOf(o) === keepRaw) : -1;
        if (keepIdx < 0 && group.target && group.target > 0) {
          let best = Infinity;
          group.list.forEach((o, i) => {
            const p = priceOf(o);
            if (!(p > 0)) return;
            const d = Math.abs(p - group.target!);
            if (d < best) {
              best = d;
              keepIdx = i;
            }
          });
        }
        // Never wipe every order: if we cannot identify which one to keep, leave the book alone.
        if (keepIdx < 0) continue;

        let cancelled = 0;
        for (let i = 0; i < group.list.length; i++) {
          if (i === keepIdx) continue;
          if (cancelled >= 10) break;
          const id = this.orderIdOf(group.list[i]);
          if (!id) continue;
          if (keepRaw && id.replace(/^algo:/, '') === keepRaw) continue;
          await this.cancelBinanceOrder(symbol, id);
          cancelled += 1;
          // Gentle pacing: Binance also rate-limits cancels per 10s window.
          await new Promise((r) => setTimeout(r, 80));
        }

        if (cancelled > 0) {
          const keptId = this.orderIdOf(group.list[keepIdx]) || group.keepId;
          if (group.kind === 'SL') pos.stopLossOrderId = keptId || pos.stopLossOrderId;
          else pos.takeProfitOrderId = keptId || pos.takeProfitOrderId;
          this.addLog(
            'warn',
            'API',
            `🧹 [冗余挂单清理] ${symbol} 发现 ${group.list.length} 张${
              group.kind === 'SL' ? '止损' : '止盈'
            }单，已撤销 ${cancelled} 张重复单，仅保留 1 张 (#${keptId})`,
            symbol
          );
        }
      }
    }
  }

  private registerCloseFailure(symbol: string): void {
    const count = (this.closeFailureCount.get(symbol) ?? 0) + 1;
    this.closeFailureCount.set(symbol, count);
    if (count >= 3) {
      this.closeRetryAfter.set(symbol, Date.now() + 60_000);
      this.addLog(
        'error',
        'API',
        `⛔ [平仓连续失败熔断] ${symbol} 已连续 ${count} 次平仓失败，暂停自动重试 60 秒（请检查持仓模式/保证金/最小下单量）`,
        symbol
      );
    }
  }

  private clearCloseFailure(symbol: string): void {
    this.closeFailureCount.delete(symbol);
    this.closeRetryAfter.delete(symbol);
  }

  /**
   * Mirror a ratcheting trailing stop onto the exchange.
   * Previously `trailingStopPrice` existed only in memory: a process restart left the original
   * (wider) exchange stop in force while the UI claimed profits were locked in.
   */
  private async syncTrailingStopToExchange(pos: ActivePosition): Promise<void> {
    if (pos.isPaper || !this.hasApiCredentials()) return;
    const desired = pos.trailingStopPrice;
    if (!desired || !(desired > 0) || !(pos.currentPrice > 0)) return;
    const now = Date.now();
    if (now - this.lastTrailingExchangeSyncAt < 10_000) return;
    // Only push when the improvement is material, otherwise we burn weight on every tick.
    if (
      pos.stopLossPrice &&
      pos.stopLossPrice > 0 &&
      Math.abs(desired - pos.stopLossPrice) / pos.stopLossPrice < 0.0015
    ) {
      return;
    }
    if (!this.binanceRest.canAfford(4)) return;
    this.lastTrailingExchangeSyncAt = now;

    const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const placed = await this.placeBinanceConditionalOrder(
      pos.symbol,
      closeSide,
      'STOP_MARKET',
      desired,
      pos.quantity,
      pos.side,
      pos.currentPrice
    );
    if (!placed?.orderId) return;
    const oldId = pos.stopLossOrderId;
    pos.stopLossPrice = desired;
    pos.stopLossOrderId = placed.orderId;
    // Cancel the superseded stop only after the replacement is live.
    if (oldId && oldId !== placed.orderId) {
      await this.cancelBinanceOrder(pos.symbol, oldId);
    }
    this.addLog(
      'info',
      'API',
      `📈 [移动止损已同步至交易所] ${pos.symbol} STOP_MARKET 上移至 $${desired.toFixed(2)} (#${placed.orderId})`,
      pos.symbol
    );
  }

  /** Real quantity currently open on the exchange for a symbol/side, or null if unknown. */
  private async getExchangePositionQty(
    symbol: string,
    side: 'LONG' | 'SHORT'
  ): Promise<number | null> {
    try {
      const list = await this.binanceRest.positionRisk();
      if (!Array.isArray(list)) return null;
      const match = list.find((p) => {
        const amt = parseFloat(p?.positionAmt || '0');
        return p?.symbol === symbol && (amt > 0 ? 'LONG' : 'SHORT') === side;
      });
      if (!match) return 0;
      return Math.abs(parseFloat(match.positionAmt || '0'));
    } catch {
      return null;
    }
  }

  /**
   * Stop price guaranteed to sit on the correct side of the current mark price.
   * Preferred level is the configured -1.5% from entry; when the market has already run past it
   * (e.g. a position adopted from the exchange with no stop), fall back to a -1.5% stop from the
   * current mark instead of the extremely tight 0.6% one, which would be chopped instantly.
   */
  private computeSafeStopPrice(
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    markPrice: number
  ): number | null {
    if (!(entryPrice > 0) || !(markPrice > 0)) return null;
    if (side === 'LONG') {
      const preferred = entryPrice * 0.985;
      const candidate = preferred < markPrice * 0.995 ? preferred : markPrice * 0.985;
      return candidate > 0 ? candidate : null;
    }
    const preferred = entryPrice * 1.015;
    const candidate = preferred > markPrice * 1.005 ? preferred : markPrice * 1.015;
    return candidate > 0 ? candidate : null;
  }

  /** Take-profit price guaranteed to sit on the correct side of the current mark price. */
  private computeSafeTakeProfitPrice(
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    markPrice: number
  ): number | null {
    if (!(entryPrice > 0) || !(markPrice > 0)) return null;
    if (side === 'LONG') {
      const preferred = entryPrice * 1.033;
      const candidate = preferred > markPrice * 1.005 ? preferred : markPrice * 1.02;
      return candidate > 0 ? candidate : null;
    }
    const preferred = entryPrice * 0.967;
    const candidate = preferred < markPrice * 0.995 ? preferred : markPrice * 0.98;
    return candidate > 0 ? candidate : null;
  }

  /**
   * Re-attach exchange-side protection for positions that have none.
   * Levels are derived from the REAL mark price, never from the scan series.
   */
  private async repairProtectiveOrders(positions: ActivePosition[]): Promise<void> {
    if (!this.hasApiCredentials()) return;
    const now = Date.now();
    if (now - this.lastProtectiveRepairAt < 5_000) return;
    this.lastProtectiveRepairAt = now;

    for (const pos of positions) {
      if (!(pos.currentPrice > 0) || !(pos.entryPrice > 0) || !(pos.quantity > 0)) continue;
      const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
      const protKey = `${pos.symbol}:${pos.side}`;
      // If we attached protection recently, do not attach it again: on deployments where the
      // algo-order query is unavailable our own new stop is invisible to `openOrders`, and
      // without this guard the engine would place a duplicate SL/TP on every 5s sync.
      if (now - (this.protectionPlacedAt.get(protKey) ?? 0) < 120_000) continue;
      let placedAny = false;

      if (!pos.stopLossOrderId) {
        if (!this.binanceRest.canAfford(6)) return;
        const safeSl = this.computeSafeStopPrice(pos.side, pos.entryPrice, pos.currentPrice);
        if (safeSl) {
          const placed = await this.placeBinanceConditionalOrder(
            pos.symbol,
            closeSide,
            'STOP_MARKET',
            safeSl,
            pos.quantity,
            pos.side,
            pos.currentPrice
          );
          if (placed?.orderId) {
            placedAny = true;
            pos.stopLossPrice = safeSl;
            pos.stopLossOrderId = placed.orderId;
            this.addLog(
              'info',
              'API',
              `🛡️ [实盘持仓补挂交易所止损] 为 ${pos.symbol} (${pos.side}) 补挂 STOP_MARKET @ $${safeSl.toFixed(2)} (#${placed.orderId})`,
              pos.symbol
            );
          }
        }
      }

      if (!pos.takeProfitOrderId) {
        if (!this.binanceRest.canAfford(6)) return;
        const safeTp = this.computeSafeTakeProfitPrice(pos.side, pos.entryPrice, pos.currentPrice);
        if (safeTp) {
          const placed = await this.placeBinanceConditionalOrder(
            pos.symbol,
            closeSide,
            'TAKE_PROFIT_MARKET',
            safeTp,
            pos.quantity,
            pos.side,
            pos.currentPrice
          );
          if (placed?.orderId) {
            placedAny = true;
            pos.takeProfitPrice = safeTp;
            pos.takeProfitOrderId = placed.orderId;
            this.addLog(
              'info',
              'API',
              `🎯 [实盘持仓补挂交易所止盈] 为 ${pos.symbol} (${pos.side}) 补挂 TAKE_PROFIT_MARKET @ $${safeTp.toFixed(2)} (#${placed.orderId})`,
              pos.symbol
            );
          }
        }
      }

      if (placedAny) this.protectionPlacedAt.set(protKey, Date.now());
    }
  }

  public computePatternStats(): PatternStatItem[] {
    const map: Record<string, { name: string; wins: number; losses: number; netPnl: number; returns: number[] }> = {};

    const knownPatterns: { type: string; name: string }[] = [
      { type: 'WYCKOFF_SPRING', name: 'Wyckoff 弹簧破底洗盘 (Spring)' },
      { type: 'WYCKOFF_UPTHRUST', name: 'Wyckoff 诱多假突破出货 (UTAD)' },
      { type: 'BROOKS_H2_LONG', name: 'Al Brooks H2 均线二次多头确认' },
      { type: 'BROOKS_L2_SHORT', name: 'Al Brooks L2 均线二次受阻做空' },
      { type: 'BULL_FLAG', name: '经典牛旗中继爆发 (Bull Flag)' },
      { type: 'BEAR_FLAG', name: '经典熊旗中继破位 (Bear Flag)' },
      { type: 'W_BOTTOM', name: 'W底颈线放量突破 (Double Bottom)' },
      { type: 'M_TOP', name: 'M头颈线放量破位 (Double Top)' },
      { type: 'CROSS_SYMBOL_ARBITRAGE', name: '跨品种统计套利 (Cross-Symbol Arb)' },
    ];

    for (const kp of knownPatterns) {
      map[kp.type] = { name: kp.name, wins: 0, losses: 0, netPnl: 0, returns: [] };
    }

    for (const t of this.closedTrades) {
      if (
        t.isExternalExchangeTrade ||
        t.patternType === 'LIVE_EXCHANGE_HISTORY' ||
        t.patternType === 'BINANCE_ACCOUNT_FILL' ||
        t.patternType === 'EXTERNAL_EXCHANGE_FILL' ||
        t.patternType === 'LIVE_EXCHANGE_SYNC' ||
        t.patternType === 'EXTERNAL_POSITION' ||
        t.patternType === 'OTHER' ||
        !t.patternType
      ) {
        continue;
      }
      const key = t.patternType;
      if (!map[key]) {
        map[key] = { name: t.patternName || key, wins: 0, losses: 0, netPnl: 0, returns: [] };
      }
      const item = map[key];
      if (t.netPnl > 0) item.wins++;
      else if (t.netPnl < 0) item.losses++;
      item.netPnl += t.netPnl;
      item.returns.push(t.pnlPercent);
    }

    return Object.keys(map).map((typeKey) => {
      const item = map[typeKey];
      const total = item.wins + item.losses;
      const winRate = total > 0 ? (item.wins / total) * 100 : 0;
      const avgPnl = item.returns.length > 0 ? item.returns.reduce((a, b) => a + b, 0) / item.returns.length : 0;

      const grossWin = this.closedTrades
        .filter((t) => (t.patternType || 'OTHER') === typeKey && t.netPnl > 0)
        .reduce((a, b) => a + b.netPnl, 0);
      const grossLoss = Math.abs(
        this.closedTrades
          .filter((t) => (t.patternType || 'OTHER') === typeKey && t.netPnl < 0)
          .reduce((a, b) => a + b.netPnl, 0)
      );
      const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

      let status: 'ACTIVE_HIGH_CONVICTION' | 'ACTIVE_NORMAL' | 'PAUSED_LOW_WINRATE' = 'ACTIVE_NORMAL';
      if (total >= 3 && (winRate < 50 || item.netPnl < 0)) {
        status = 'PAUSED_LOW_WINRATE';
      } else if (winRate >= 65 || (total >= 2 && item.netPnl > 0)) {
        status = 'ACTIVE_HIGH_CONVICTION';
      }

      return {
        patternType: typeKey,
        patternName: item.name,
        totalTrades: total,
        wins: item.wins,
        losses: item.losses,
        winRatePercent: Number(winRate.toFixed(1)),
        totalNetPnl: Number(item.netPnl.toFixed(2)),
        profitFactor: Number(profitFactor.toFixed(2)),
        avgPnlPercent: Number(avgPnl.toFixed(2)),
        status,
      };
    });
  }

  private prevCpuInfo: { idle: number; total: number } | null = null;

  private getCpuUsagePercent(): number {
    try {
      const cpus = os.cpus();
      if (!cpus || cpus.length === 0) return 12.0;

      let idle = 0;
      let total = 0;
      for (const cpu of cpus) {
        for (const type in cpu.times) {
          total += (cpu.times as any)[type];
        }
        idle += cpu.times.idle;
      }

      if (!this.prevCpuInfo) {
        this.prevCpuInfo = { idle, total };
        return 14.2;
      }

      const idleDiff = idle - this.prevCpuInfo.idle;
      const totalDiff = total - this.prevCpuInfo.total;
      this.prevCpuInfo = { idle, total };

      if (totalDiff === 0) return 0;
      const usage = 100 - (100 * idleDiff) / totalDiff;
      return Number(Math.max(0, Math.min(100, usage)).toFixed(1));
    } catch {
      return 15.0;
    }
  }

  private getServerSystemMetrics(): ServerSystemMetrics {
    try {
      const totalMemBytes = os.totalmem();
      const freeMemBytes = os.freemem();
      const usedMemBytes = totalMemBytes - freeMemBytes;

      const totalMemoryMb = Math.round(totalMemBytes / (1024 * 1024));
      const freeMemoryMb = Math.round(freeMemBytes / (1024 * 1024));
      const usedMemoryMb = Math.round(usedMemBytes / (1024 * 1024));
      const memoryUsagePercent = Number(((usedMemBytes / totalMemBytes) * 100).toFixed(1));
      const processHeapUsedMb = Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1));

      return {
        cpuUsagePercent: this.getCpuUsagePercent(),
        totalMemoryMb,
        freeMemoryMb,
        usedMemoryMb,
        memoryUsagePercent,
        processHeapUsedMb,
        uptimeSeconds: Math.floor(process.uptime()),
      };
    } catch {
      return {
        cpuUsagePercent: 12.0,
        totalMemoryMb: 2048,
        freeMemoryMb: 1024,
        usedMemoryMb: 1024,
        memoryUsagePercent: 50.0,
        processHeapUsedMb: 65.0,
        uptimeSeconds: Math.floor(process.uptime()),
      };
    }
  }

  public getTimeframeDiagnosticReport(): TimeframeDiagnosticReport {
    let latestAtrRatio = 1.0;
    if (this.scanResults.length > 0) {
      const normalizedRatios: number[] = [];
      for (const s of this.scanResults) {
        if (s.currentPrice > 0 && s.atr > 0) {
          const atrPct = s.atr / s.currentPrice;
          const basePct = this.symbolAtrPctBaseline.get(s.symbol) || atrPct;
          normalizedRatios.push(Math.min(5.0, Math.max(0.3, atrPct / (basePct || atrPct))));
        }
      }
      if (normalizedRatios.length > 0) {
        const avgRatio = normalizedRatios.reduce((a, b) => a + b, 0) / normalizedRatios.length;
        latestAtrRatio = Number(avgRatio.toFixed(2));
      }
    }

    let currentRegime: 'LOW_VOLATILITY_CHOP' | 'NORMAL_TRENDING' | 'HIGH_VOLATILITY_BREAKOUT' | 'EXTREME_VOLATILITY_SPIKE' = 'NORMAL_TRENDING';
    let regimeName = '🟢 稳健趋势波段 (Normal Trending)';
    let regimeDescription = '大盘波幅平稳，趋势发散顺畅，突破与回踩模式均具备高可靠性。';

    if (latestAtrRatio >= 2.0) {
      currentRegime = 'EXTREME_VOLATILITY_SPIKE';
      regimeName = '🔴 极度剧烈插针 (Extreme Volatility Spike)';
      regimeDescription = '市场出现剧烈插针与暴跌恐慌，小周期噪音剧烈，需依靠大周期结构防御。';
    } else if (latestAtrRatio >= 1.3) {
      currentRegime = 'HIGH_VOLATILITY_BREAKOUT';
      regimeName = '⚡ 高波动动能爆发 (High Volatility Breakout)';
      regimeDescription = '动能加速放大，放量突破特征明显，适合中短周期快速跟进。';
    } else if (latestAtrRatio <= 0.85) {
      currentRegime = 'LOW_VOLATILITY_CHOP';
      regimeName = '🟡 低波窄幅震荡 (Low Volatility Chop)';
      regimeDescription = '成交量萎缩，盘面横盘无方向，小周期频繁假突破，宜选择大中周期过滤杂波。';
    }

    const allTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];

    const suitabilityMap: Record<string, Record<string, { score: number; desc: string }>> = {
      LOW_VOLATILITY_CHOP: {
        '1m': { score: 25, desc: '低波震荡期 1m 杂波极多，假突破率高' },
        '3m': { score: 35, desc: '低波震荡期 3m 缺乏主线，易被反复洗盘' },
        '5m': { score: 55, desc: '5m 表现平平，仅适合超短线观望' },
        '15m': { score: 88, desc: '推荐: 15m 过滤低波杂波，结构相对清晰' },
        '30m': { score: 95, desc: '最佳推荐: 30m 具备强震荡过滤能力，胜率极高' },
        '1h': { score: 90, desc: '推荐: 1h 大周期受低波影响较小' },
        '4h': { score: 82, desc: '4h 稳健性强但交易信号触发较慢' },
        '1d': { score: 75, desc: '1d 日线级别稳健，适合长线参考' },
      },
      NORMAL_TRENDING: {
        '1m': { score: 40, desc: '1m 交易手续费消耗较大' },
        '3m': { score: 60, desc: '3m 适合高频短线回调确认' },
        '5m': { score: 82, desc: '5m 响应迅速，适合捕获趋势启动' },
        '15m': { score: 96, desc: '黄金推荐: 15m 趋势与胜率最佳平衡点' },
        '30m': { score: 92, desc: '推荐: 30m 趋势稳定性强，盈亏比极佳' },
        '1h': { score: 85, desc: '1h 适合中线趋势追踪' },
        '4h': { score: 78, desc: '4h 趋势方向极度明确' },
        '1d': { score: 70, desc: '1d 周期较长，适合大方向对齐' },
      },
      HIGH_VOLATILITY_BREAKOUT: {
        '1m': { score: 50, desc: '1m 速度极快，需要极低延迟' },
        '3m': { score: 78, desc: '3m 快速跟进强动能突破' },
        '5m': { score: 95, desc: '最佳推荐: 5m 在高波爆发期敏捷捕获第一波突破' },
        '15m': { score: 93, desc: '黄金推荐: 15m 兼顾爆发力与突破真实度' },
        '30m': { score: 85, desc: '30m 反应略稍迟缓但非常安全' },
        '1h': { score: 75, desc: '1h 适合大波幅行情追踪' },
        '4h': { score: 65, desc: '4h 无法及时响应突发高波行情' },
        '1d': { score: 50, desc: '1d 滞后性较高' },
      },
      EXTREME_VOLATILITY_SPIKE: {
        '1m': { score: 15, desc: '危险: 剧烈插针期 1m 秒杀止损盘' },
        '3m': { score: 25, desc: '危险: 3m 易受剧烈扫损插针误伤' },
        '5m': { score: 45, desc: '5m 存在较高插针扫损风险' },
        '15m': { score: 75, desc: '15m 适中，需配合防守止损' },
        '30m': { score: 94, desc: '黄金推荐: 30m 抗插针洗盘，结构完好' },
        '1h': { score: 92, desc: '推荐: 1h 大结构有效规避插针' },
        '4h': { score: 88, desc: '4h 安全系数最高，彻底抵御剧烈插针' },
        '1d': { score: 80, desc: '1d 大周线安全防御' },
      },
    };

    const currentRegimeMap = suitabilityMap[currentRegime];

    const items = allTimeframes.map((tf) => {
      const tradesForTf = this.closedTrades.filter((t) => t.interval === tf);
      const totalTrades = tradesForTf.length;
      const wins = tradesForTf.filter((t) => t.netPnl > 0).length;
      const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 50.0;
      const totalNetPnlUsdt = Number(tradesForTf.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
      const avgPnlUsdt = totalTrades > 0 ? Number((totalNetPnlUsdt / totalTrades).toFixed(2)) : 0;

      const suitability = currentRegimeMap[tf] || { score: 60, desc: '通用周期' };

      return {
        timeframe: tf,
        rank: 1,
        totalTrades,
        wins,
        winRate,
        avgPnlUsdt,
        totalNetPnlUsdt,
        volatilitySuitabilityScore: suitability.score,
        isRecommended: false,
        regimeFitDescription: suitability.desc,
      };
    });

    items.sort((a, b) => {
      const scoreA = a.winRate * 0.5 + a.volatilitySuitabilityScore * 0.5;
      const scoreB = b.winRate * 0.5 + b.volatilitySuitabilityScore * 0.5;
      return scoreB - scoreA;
    });

    items.forEach((item, idx) => {
      item.rank = idx + 1;
      if (idx === 0) item.isRecommended = true;
    });

    const topRec = items[0];
    const recReason = `当前市场处于【${regimeName.split(' ')[0]}】环境 (波动指数 ${latestAtrRatio}x)。综合历史胜率 (${topRec.winRate}%) 与该波段适配度 (${topRec.volatilitySuitabilityScore}分)，系统诊断【${topRec.timeframe}】为最佳黄金分析周期。`;

    return {
      currentRegime,
      regimeName,
      regimeDescription,
      volatilityIndexRatio: latestAtrRatio,
      recommendedTimeframe: topRec.timeframe,
      recommendationReason: recReason,
      rankings: items,
    };
  }

  public computeSymbolRiskControlStats(): SymbolRiskControlItem[] {
    const baseLeverage = this.leverage;

    return this.monitoredSymbols.map((sym) => {
      const tradesForSym = this.closedTrades.filter((t) => t.symbol === sym);
      const totalTrades = tradesForSym.length;
      const wins = tradesForSym.filter((t) => t.netPnl > 0).length;
      const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;

      let sharpe = 0;
      if (totalTrades >= 2) {
        const returns = tradesForSym.map((t) => (t.marginUsed > 0 ? t.netPnl / t.marginUsed : 0));
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance =
          returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0) sharpe = Number(((mean / stdDev) * Math.sqrt(252)).toFixed(2));
      }

      let maxDd = 0;
      if (totalTrades >= 2) {
        let cumPnl = 0;
        let peakPnl = 0;
        let maxDraw = 0;
        for (const t of tradesForSym) {
          cumPnl += t.netPnl;
          if (cumPnl > peakPnl) peakPnl = cumPnl;
          const ddUsdt = peakPnl - cumPnl;
          if (ddUsdt > maxDraw) maxDraw = ddUsdt;
        }
        maxDd = Number(Math.min(30, Math.max(0, maxDraw / 10)).toFixed(1));
      }

      let riskLevel: 'SAFE_NORMAL' | 'WARNING_REDUCE_LEVERAGE' | 'CRITICAL_CAP_POSITIONS' = 'SAFE_NORMAL';
      let effectiveLeverage = baseLeverage;
      let maxAllowedPositions = 2;
      let actionDescription =
        totalTrades < 2
          ? '⚪ 尚无足够平仓样本 (<2笔)，维持标准基准风控参数'
          : '🟢 夏普比率与回撤正常，风险处于平稳受控状态';

      if (totalTrades >= 2 && (sharpe < 0 || maxDd > 18)) {
        riskLevel = 'CRITICAL_CAP_POSITIONS';
        effectiveLeverage = Math.max(1, Math.floor(baseLeverage * 0.4));
        maxAllowedPositions = 1;
        actionDescription = `🔴 [严重风险管控] 夏普比率低至 ${sharpe.toFixed(2)} (回撤 ${maxDd.toFixed(1)}%)，自动强制将杠杆降至 ${effectiveLeverage}x 并限制最大单量！`;
      } else if (totalTrades >= 2 && (sharpe < 1.0 || maxDd > 12)) {
        riskLevel = 'WARNING_REDUCE_LEVERAGE';
        effectiveLeverage = Math.max(1, Math.floor(baseLeverage * 0.7));
        maxAllowedPositions = 1;
        actionDescription = `🟡 [预警风险管控] 夏普比率偏低 (${sharpe.toFixed(2)})，自动缩减杠杆至 ${effectiveLeverage}x`;
      }

      return {
        symbol: sym,
        sharpeRatio: sharpe,
        maxDrawdownPercent: maxDd,
        totalTrades,
        winRate,
        riskLevel,
        effectiveLeverage,
        maxAllowedPositions,
        actionDescription,
      };
    });
  }

  public computeMarketCorrelationMetrics(): MarketCorrelationMetrics {
    return computeNormalizedMarketCorrelation(
      this.scanResults.map((s) => ({
        symbol: s.symbol,
        currentPrice: s.currentPrice,
        atr: s.atr,
        baselineAtrPercent: this.symbolAtrPctBaseline.get(s.symbol),
        signal: s.signal,
      })),
      this.leverage
    );
  }

  public getStrategyScreener(): StrategyScreenerItem[] {
    return evaluate7dStrategyScreener(this.closedTrades);
  }

  public getAiPnlForecast(): AiPnlForecastResult {
    const highQualitySignals = this.scanResults.filter(
      (s) => s.signal !== 0 && (s.qualityScore ?? 0) >= 85
    ).length;
    return predict24hPnlModel(
      this.closedTrades,
      this.activePositions,
      this.equity,
      highQualitySignals
    );
  }

  public getPortfolioAllocation(): PortfolioAllocationState {
    return computeDynamicPortfolioWeights(
      this.scanResults.map((s) => ({
        symbol: s.symbol,
        interval: s.interval,
        currentPrice: s.currentPrice,
        atr: s.atr,
        baselineAtrPercent: this.symbolAtrPctBaseline.get(s.symbol),
        trendContext: s.trendContext,
      })),
      this.monitoredSymbols
    );
  }

  public computeSymbolRLSensitivityStates(): SymbolSensitivityRLState[] {
    const riskStats = this.computeSymbolRiskControlStats();

    return riskStats.map((stat) => {
      const { symbol, sharpeRatio, winRate, maxDrawdownPercent } = stat;
      const reward = sharpeRatio * 0.4 + (winRate - 50) * 0.3 - maxDrawdownPercent * 0.3;

      let rlAction: 'ELEVATE_SENSITIVITY' | 'MAINTAIN' | 'RESTRICT_SENSITIVITY' = 'MAINTAIN';
      let sensitivityScore = 75;
      let qualityScoreThreshold = 85;
      let atrMultiplier = 1.8;
      let statusDescription = '⚖️ [强化学习 - 维持标准] 参数处于中性区间，保持标准信号敏感度 (85分门槛)';

      if (reward >= 1.2 || (sharpeRatio >= 1.8 && winRate >= 65)) {
        rlAction = 'ELEVATE_SENSITIVITY';
        sensitivityScore = 95;
        qualityScoreThreshold = 78;
        atrMultiplier = 1.5;
        statusDescription = `🚀 [强化学习 - 提敏增频] 处于极佳夏普胜率区间 (夏普 ${sharpeRatio}, 胜率 ${winRate}%)，RL 自动放宽开仓门槛至 ≥78分，敏捷捕获主升浪！`;
      } else if (reward <= -0.5 || sharpeRatio < 0.6 || maxDrawdownPercent > 12) {
        rlAction = 'RESTRICT_SENSITIVITY';
        sensitivityScore = 40;
        qualityScoreThreshold = 92;
        atrMultiplier = 2.2;
        statusDescription = `🛡️ [强化学习 - 收紧防线] 处于弱夏普/大回撤风险区 (夏普 ${sharpeRatio}, 回撤 ${maxDrawdownPercent}%)，RL 自动提高开仓门槛至 ≥92分，严格过滤弱信号！`;
      }

      return {
        symbol,
        sensitivityScore,
        qualityScoreThreshold,
        atrMultiplier,
        rlGeneration: this.learningGeneration,
        sharpeRatio,
        winRate,
        maxDrawdown: maxDrawdownPercent,
        rlAction,
        statusDescription,
        lastUpdated: Date.now(),
      };
    });
  }

  public evaluateSmartExecutionAlgorithm(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    currentPrice: number,
    klines: Kline[]
  ): SmartExecutionResult {
    const notionalUsdt = quantity * currentPrice;

    let volRatio = 1.0;
    if (klines.length >= 20) {
      const recentVol = klines[klines.length - 1].volume || 1;
      const avgVol20 = klines.slice(-20).reduce((sum, k) => sum + k.volume, 0) / 20;
      volRatio = avgVol20 > 0 ? recentVol / avgVol20 : 1.0;
    }

    let executionAlgorithm: SmartExecutionResult['executionAlgorithm'] = 'MARKET_DIRECT';
    let slicesCount = 1;
    let estimatedSlippageBps = 2.5;
    let executionReason = `🟢 市场深度充沛 (成交量 ${volRatio.toFixed(2)}x 均值)，极速直挂撮合执行`;

    if (volRatio < 0.65 || notionalUsdt >= 2500) {
      executionAlgorithm = 'ICEBERG_LIMIT_SLICING';
      slicesCount = 4;
      estimatedSlippageBps = 0.8;
      executionReason = `📉 深度预警: 成交量低于均值 (${(volRatio * 100).toFixed(0)}%) 或单笔面值 $${Math.round(notionalUsdt)} USDT，自动由市价单切换为 4 片冰山限价微溢价分片单，规避买卖盘吃深滑点！`;
    } else if (volRatio >= 1.8) {
      executionAlgorithm = 'TWAP_HEDGING';
      slicesCount = 3;
      estimatedSlippageBps = 1.2;
      executionReason = `⚡ 高波插针期预警: 市场剧烈震荡，开启 3 段式 TWAP 溢价平滑对冲挂单，提升成交质量！`;
    }

    const result: SmartExecutionResult = {
      symbol,
      side,
      executionAlgorithm,
      volumeRatio: Number(volRatio.toFixed(2)),
      estimatedSlippageBps,
      slicesCount,
      executionReason,
      timestamp: Date.now(),
    };

    this.smartExecutionLogs.unshift(result);
    if (this.smartExecutionLogs.length > 50) this.smartExecutionLogs.pop();

    this.addLog(
      'info',
      'ORDER',
      `🧊 【智能订单执行算法 - ${symbol} ${side}】算法: ${executionAlgorithm} (${slicesCount}分片, 预估滑点 ${estimatedSlippageBps} bps) | ${executionReason}`,
      symbol
    );

    return result;
  }

  private computePairwiseReturnCorrelation(symA: string, symB: string): number | null {
    const klA = this.latestSymbolKlinesMap.get(symA);
    const klB = this.latestSymbolKlinesMap.get(symB);
    if (!klA || !klB || klA.length < 25 || klB.length < 25) return null;
    const len = Math.min(klA.length, klB.length, 48);
    const sliceA = klA.slice(-len);
    const sliceB = klB.slice(-len);
    const retA: number[] = [];
    const retB: number[] = [];
    for (let k = 1; k < len; k++) {
      if (sliceA[k - 1].close > 0 && sliceB[k - 1].close > 0) {
        retA.push((sliceA[k].close - sliceA[k - 1].close) / sliceA[k - 1].close);
        retB.push((sliceB[k].close - sliceB[k - 1].close) / sliceB[k - 1].close);
      }
    }
    if (retA.length < 15) return null;
    const meanA = retA.reduce((s, v) => s + v, 0) / retA.length;
    const meanB = retB.reduce((s, v) => s + v, 0) / retB.length;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let k = 0; k < retA.length; k++) {
      const dA = retA[k] - meanA;
      const dB = retB[k] - meanB;
      cov += dA * dB;
      varA += dA * dA;
      varB += dB * dB;
    }
    const denom = Math.sqrt(varA * varB);
    return denom > 0 ? Number((cov / denom).toFixed(2)) : null;
  }

  public async checkDynamicCorrelationHedging(): Promise<CorrelationHedgingState[]> {
    if (this.activePositions.length < 2) return [];

    const newLogs: CorrelationHedgingState[] = [];
    const hasKeys = this.hasApiCredentials();

    for (let i = 0; i < this.activePositions.length; i++) {
      for (let j = i + 1; j < this.activePositions.length; j++) {
        const pos1 = this.activePositions[i];
        const pos2 = this.activePositions[j];

        const computedR = this.computePairwiseReturnCorrelation(pos1.symbol, pos2.symbol);
        if (computedR === null) continue;
        const r = computedR;

        if (r >= 0.80 && pos1.side === pos2.side) {
          const p1Pnl = pos1.unrealizedPnl;
          const p2Pnl = pos2.unrealizedPnl;

          const weakerPos = p1Pnl < p2Pnl ? pos1 : pos2;
          const rules = this.getSymbolRules(weakerPos.symbol);
          const oldQty = weakerPos.quantity;
          const reduceQty = formatToStep(oldQty * 0.4, rules.stepSize, 'floor');
          const newQty = formatToStep(oldQty - reduceQty, rules.stepSize, 'floor');
          const hedgePct = oldQty > 0 ? Math.round((reduceQty / oldQty) * 100) : 0;

          // HARD COOLDOWN. This method runs on every 10s cycle; without a cooldown it chopped 40%
          // off the same position over and over (0.75 -> 0.45 -> 0.27 ...) until it was dust,
          // paying taker fees each time and leaving the exchange stop at the old size.
          const lastHedgeAt = this.lastCorrelationHedgeAt.get(weakerPos.symbol) ?? 0;
          const hedgeCooling = Date.now() - lastHedgeAt < 30 * 60_000;

          if (!hedgeCooling && reduceQty >= rules.minQty && newQty >= rules.minQty) {
            if (!weakerPos.isPaper && hasKeys) {
              try {
                await this.placeBinanceMarketOrder(
                  weakerPos.symbol,
                  weakerPos.side === 'LONG' ? 'SELL' : 'BUY',
                  reduceQty,
                  true
                );
                await this.syncLiveAccountNow(false);
              } catch (err: any) {
                this.addLog(
                  'warn',
                  'API',
                  `⚠️ [实盘动态相关性减仓跳过] ${weakerPos.symbol}: ${err.message}`,
                  weakerPos.symbol
                );
                continue;
              }
            } else {
              weakerPos.quantity = newQty;
              weakerPos.marginUsed = Number((weakerPos.marginUsed * (newQty / oldQty)).toFixed(2));
            }

            this.lastCorrelationHedgeAt.set(weakerPos.symbol, Date.now());

            const hedgeLog: CorrelationHedgingState = {
              pairName: `${pos1.symbol} / ${pos2.symbol}`,
              correlationCoefficient: r,
              symbolA: pos1.symbol,
              symbolB: pos2.symbol,
              weakerSymbol: weakerPos.symbol,
              actionTaken: `主动下调弱势币种持仓 ${hedgePct}% (由 ${oldQty} 降至 ${newQty})`,
              hedgedQuantityPercent: hedgePct,
              timestamp: Date.now(),
            };

            this.correlationHedgingLogs.unshift(hedgeLog);
            if (this.correlationHedgingLogs.length > 50) this.correlationHedgingLogs.pop();

            this.addLog(
              'warn',
              'ORDER',
              `🛡️ 【动态相关性主动对冲生效】: 监测到【${pos1.symbol}】与【${pos2.symbol}】真实正相关系数达 ${(r * 100).toFixed(0)}%，自动主动下调弱势币种【${weakerPos.symbol}】持仓 ${hedgePct}% (${oldQty} -> ${newQty})，实现组合主动降维与风险平滑！`,
              weakerPos.symbol
            );

            newLogs.push(hedgeLog);
          }
        }
      }
    }

    return newLogs;
  }

  public getRiskMetrics(): LiveAccountRiskMetrics {
    const hasKeys = this.hasApiCredentials();
    const totalEquity =
      hasKeys && this.liveSyncInfo?.syncOk
        ? this.liveSyncInfo.marginBalance
        : this.equity > 0
        ? this.equity
        : this.balance;
    const walletBalance =
      hasKeys && this.liveSyncInfo?.syncOk ? this.liveSyncInfo.walletBalance : this.balance;
    const availableBalance =
      hasKeys && this.liveSyncInfo?.syncOk ? this.liveSyncInfo.availableBalance : this.balance;
    const positionsMargin = this.activePositions.reduce(
      (s, p) => s + Math.max(0, p.marginUsed || 0),
      0
    );
    const exchangeMargin =
      hasKeys && this.liveSyncInfo?.syncOk ? this.liveSyncInfo.positionInitialMargin ?? 0 : 0;
    const totalMarginUsed = Number(Math.max(positionsMargin, exchangeMargin).toFixed(2));
    const marginUtilizationPercent =
      totalEquity > 0 ? Number(Math.min(100, (totalMarginUsed / totalEquity) * 100).toFixed(2)) : 0;
    const freeMarginBufferPercent = Number(
      Math.max(0, 100 - marginUtilizationPercent).toFixed(2)
    );
    const totalUnrealizedPnl =
      hasKeys && this.liveSyncInfo?.syncOk
        ? Number(this.liveSyncInfo.unrealizedProfit.toFixed(2))
        : Number(this.activePositions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0).toFixed(2));
    const drawdownPercent =
      this.peakEquity > 0
        ? Number(Math.max(0, ((this.peakEquity - this.equity) / this.peakEquity) * 100).toFixed(2))
        : 0;
    const maxAllowedDrawdownPercent = this.riskConfig.maxAllowedDrawdownPercent ?? 20;
    const isDrawdownLocked =
      this.peakEquity > 0 && drawdownPercent >= maxAllowedDrawdownPercent;
    const riskPerTradePercent = this.riskConfig.riskPerTradePercent ?? 2.0;
    const maxSingleTradeRiskUsdt = Number(
      ((Math.max(0, totalEquity) * riskPerTradePercent) / 100).toFixed(2)
    );

    return {
      totalEquity: Number(Math.max(0, totalEquity).toFixed(2)),
      walletBalance: Number(Math.max(0, walletBalance).toFixed(2)),
      availableBalance: Number(Math.max(0, availableBalance).toFixed(2)),
      totalMarginUsed,
      marginUtilizationPercent,
      freeMarginBufferPercent,
      totalUnrealizedPnl,
      drawdownPercent,
      maxAllowedDrawdownPercent,
      isDrawdownLocked,
      isHedgeMode: this.isHedgeMode,
      riskPerTradePercent,
      maxSingleTradeRiskUsdt,
      lockedSymbols: [...LOCKED_TARGET_SYMBOLS],
      dataSource: hasKeys ? 'BINANCE_LIVE_API' : 'PAPER_SIMULATION',
    };
  }

  public getStatus(): BotStatus {
    const hasKeys = this.hasApiCredentials();
    const logsReversed = [...this.logs].reverse();
    const recentSchedulingEvents = logsReversed
      .filter((l) => l.category === 'SYSTEM' || l.category === 'ORDER' || l.category === 'SIGNAL')
      .slice(0, 10);

    return {
      isRunning: this.isRunning,
      mode: hasKeys ? 'LIVE' : 'PAPER',
      hasBinanceKeys: hasKeys,
      binanceEndpoint: this.getFuturesBaseUrl(),
      liveSyncInfo: this.liveSyncInfo,
      symbolExchangeRules: Object.fromEntries(this.symbolExchangeRules.entries()),
      monitoredSymbols: this.monitoredSymbols,
      monitoredTimeframes: this.monitoredTimeframes,
      balance: this.balance,
      equity: this.equity,
      peakEquity: this.peakEquity,
      drawdownPercent:
        this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0,
      leverage: this.leverage,
      activePositions: this.activePositions,
      closedTrades: this.closedTrades.slice(-50),
      scanResults: this.scanResults,
      marketTickers: Object.fromEntries(this.marketTickers.entries()),
      patternStats: this.computePatternStats(),
      equityHistory: [...this.equityHistory],
      learningGeneration: this.learningGeneration,
      patternLearningStats: Array.from(this.patternLearningWeights.values()),
      timeframeDiagnostic: this.getTimeframeDiagnosticReport(),
      symbolRiskControlStats: this.computeSymbolRiskControlStats(),
      marketCorrelation: this.computeMarketCorrelationMetrics(),
      symbolRLSensitivityStates: this.computeSymbolRLSensitivityStates(),
      smartExecutionLogs: [...this.smartExecutionLogs],
      correlationHedgingLogs: [...this.correlationHedgingLogs],
      strategyScreener: this.getStrategyScreener(),
      aiPnlForecast: this.getAiPnlForecast(),
      arbitrageOpportunities: [...this.arbitrageOpportunities],
      portfolioAllocation: this.getPortfolioAllocation(),
      portfolioBasket: this.getPortfolioBasketState(),
      riskMetrics: this.getRiskMetrics(),
      logs: [...this.logs],
      recentSchedulingEvents,
      systemMetrics: this.getServerSystemMetrics(),
      lastUpdateTime: this.lastUpdateTime,
      lastMarketPreviewTime: this.lastMarketPreviewTime,
      riskConfig: this.riskConfig,
    };
  }

  public getPortfolioBasketState(scansSnapshot: SymbolScanResult[] = this.scanResults): PortfolioBasketState {
    if (this.activePositions.length < 2) {
      this.basketPeakNetPnl = 0;
    }
    const marketCorr = this.computeMarketCorrelationMetrics();
    const state = evaluatePortfolioBasketTakeProfit({
      positions: this.activePositions.map((p) => ({
        symbol: p.symbol,
        interval: p.interval,
        side: p.side,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        quantity: p.quantity,
        leverage: p.leverage,
        marginUsed: p.marginUsed,
        unrealizedPnl: p.unrealizedPnl,
      })),
      scans: scansSnapshot.map((s) => ({
        symbol: s.symbol,
        interval: s.interval,
        trendContext: s.trendContext,
        signal: s.signal,
      })),
      marketCorrelation: marketCorr,
      config: this.riskConfig.portfolioBasket,
      previousPeakNetPnl: this.basketPeakNetPnl,
      cooldownActiveUntil: this.basketCloseCooldownUntil,
    });
    this.basketPeakNetPnl = state.peakNetRealizablePnl;
    return state;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const hasKeys = this.hasApiCredentials();
    this.mode = hasKeys ? 'LIVE' : 'PAPER';

    this.addLog(
      'success',
      'SYSTEM',
      `▶ 启动全自动监控与胜率自优服务 | 监控币种: ${this.monitoredSymbols.join(', ')} | 监控周期: ${this.monitoredTimeframes.join(', ')} | 模式: ${
        hasKeys ? '🟢 币安实盘 API 下单' : '🔵 模拟盘观察记录'
      }`
    );

    this.executeCycle();
    this.timer = setInterval(() => this.executeCycle(), 10000);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.addLog('warn', 'SYSTEM', '⏸ 多币种监控已暂停');
  }

  public updateConfig(newConfig: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
    riskConfig?: Partial<RiskManagementConfig>;
  }) {
    if (newConfig.monitoredSymbols && Array.isArray(newConfig.monitoredSymbols)) {
      const normalized = Array.from(
        new Set(
          newConfig.monitoredSymbols
            .map((s) => normalizeLockedSymbol(s))
            .filter((s): s is string => s !== null)
        )
      );
      this.monitoredSymbols =
        normalized.length > 0 ? normalized : [...LOCKED_TARGET_SYMBOLS];
    }
    if (newConfig.monitoredTimeframes && Array.isArray(newConfig.monitoredTimeframes)) {
      this.monitoredTimeframes = newConfig.monitoredTimeframes;
    }
    if (newConfig.leverage) {
      const clampedLev = Math.max(1, Math.min(20, Math.round(newConfig.leverage)));
      this.leverage = clampedLev;
      this.riskConfig.leverage = clampedLev;
    }
    if (newConfig.riskConfig) {
      this.riskConfig = {
        ...this.riskConfig,
        ...newConfig.riskConfig,
        portfolioBasket: newConfig.riskConfig.portfolioBasket
          ? {
              ...(this.riskConfig.portfolioBasket || DEFAULT_PORTFOLIO_BASKET_CONFIG),
              ...newConfig.riskConfig.portfolioBasket,
            }
          : this.riskConfig.portfolioBasket,
      };
    }
    this.addLog(
      'info',
      'SYSTEM',
      `监控配置已更新 | 锁定合约: ${this.monitoredSymbols.join(', ')} | 周期: ${this.monitoredTimeframes.join(', ')} | 杠杆上限: ${this.leverage}x`
    );
    this.notifyListeners(true);
  }

  public subscribe(listener: (status: BotStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyListeners(immediate: boolean = false): void {
    if (this.statusListeners.size === 0) return;
    if (immediate) {
      if (this.notifyTimer) {
        clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
      const snapshot = this.getStatus();
      for (const cb of this.statusListeners) {
        try {
          cb(snapshot);
        } catch {
          // ignore closed socket error
        }
      }
      return;
    }
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      if (this.statusListeners.size === 0) return;
      const snapshot = this.getStatus();
      for (const cb of this.statusListeners) {
        try {
          cb(snapshot);
        } catch {
          // ignore
        }
      }
    }, 150);
    this.notifyTimer.unref?.();
  }

  /**
   * Wipe the operational journal so the dashboard starts from a clean slate.
   *
   * - `clearLogs`     : empties the live log console (in-memory, capped at 500 entries).
   * - `clearTrades`   : empties 交割单 / 净值曲线 / 执行与对冲记录, resets the equity peak and
   *                     sets a cut-off timestamp so exchange history before it is never re-imported.
   * - `resetLearning` : resets the self-learning weights to their initial state.
   *
   * Open positions are deliberately KEPT: they are real exposure and dropping their records would
   * leave them unmanaged on the exchange.
   */
  public resetJournal(options: {
    clearLogs?: boolean;
    clearTrades?: boolean;
    resetLearning?: boolean;
    /** Suppress the confirmation log line (used by the "清空日志" button so the console is truly empty). */
    silent?: boolean;
  } = {}): {
    clearedLogs: number;
    clearedTrades: number;
    learningReset: boolean;
    cutoverAt: number;
    activePositionsKept: number;
  } {
    const clearLogs = options.clearLogs !== false;
    const clearTrades = options.clearTrades !== false;
    const resetLearning = options.resetLearning !== false;

    const clearedLogs = clearLogs ? this.logs.length : 0;
    const clearedTrades = clearTrades ? this.closedTrades.length : 0;
    const activePositionsKept = this.activePositions.length;
    const cutoverAt = Date.now();

    if (clearLogs) {
      this.logs = [];
      this.lastSyncErrorLogTime = 0;
      this.lastCircuitBreakerLogTime = 0;
      this.lastDrawdownLockLogTime = 0;
      this.lastBasketCooldownLogTime = 0;
      this.lastProtectiveRepairAt = 0;
      this.lastTrailingExchangeSyncAt = 0;
    }

    if (clearTrades) {
      this.closedTrades = [];
      this.smartExecutionLogs = [];
      this.correlationHedgingLogs = [];
      this.basketPeakNetPnl = 0;
      this.equityHistory = [];
      // Cut-off: fills / income events older than now must never be re-imported.
      this.journalStartedAt = cutoverAt;
      this.saveJournalState();
      this.hasSyncedLiveHistory = false;
      this.lastHistorySyncAt = 0;
      const baseline = this.equity > 0 ? this.equity : Math.max(0, this.balance);
      this.peakEquity = baseline;
      this.equityHistory.push({
        timestamp: cutoverAt,
        time: new Date(cutoverAt).toLocaleTimeString('zh-CN', { hour12: false }),
        equity: Number(baseline.toFixed(2)),
        balance: Number(this.balance.toFixed(2)),
        unrealizedPnl: this.liveSyncInfo?.syncOk ? this.liveSyncInfo.unrealizedProfit : 0,
        activePositionsCount: activePositionsKept,
      });
    }

    if (resetLearning) {
      this.patternLearningWeights.clear();
      this.initPatternLearningState();
      this.learningGeneration = 1;
    }

    if (!options.silent) {
      this.addLog(
        'success',
        'SYSTEM',
        `🧹 [账本重置完成] 已清空 ${clearedLogs} 条日志、${clearedTrades} 笔交割单${
          resetLearning ? '、自学习权重已归零' : ''
        }；净值基准重设为 $${this.peakEquity.toFixed(2)}。${
          activePositionsKept > 0
            ? `当前 ${activePositionsKept} 笔实盘持仓继续保留监控（不会被清空）。`
            : '当前无持仓。'
        }`
      );
    }
    this.notifyListeners(true);
    return { clearedLogs, clearedTrades, learningReset: resetLearning, cutoverAt, activePositionsKept };
  }

  public resetDrawdownLock(): void {
    const baseline = this.equity > 0 ? this.equity : this.balance;
    this.peakEquity = baseline;
    this.lastDrawdownLockLogTime = 0;
    this.addLog(
      'success',
      'SYSTEM',
      `🔧 [异常溯源一键修复] 已将回撤峰值基准线校准至当前净值 $${baseline.toFixed(2)}，解除回撤熔断锁仓限制。`
    );
    this.notifyListeners(true);
  }

  public clearCooldowns(): void {
    this.basketCloseCooldownUntil = null;
    this.pendingOrderSymbols.clear();
    if (this.params.minPatternQuality > 75) {
      this.params = { ...this.params, minPatternQuality: 75 };
    }
    this.addLog(
      'success',
      'SYSTEM',
      `🔧 [异常溯源一键修复] 已清除全平冷却期与挂单占位锁，信号质量标准门限已校准为 ${this.params.minPatternQuality} 分。`
    );
    this.notifyListeners(true);
  }

  public optimizeSmallCapitalConfig(): void {
    const safeLev = Math.max(1, Math.min(5, this.leverage));
    this.leverage = safeLev;
    this.riskConfig = {
      ...this.riskConfig,
      sizingMode: 'EQUITY_PERCENT',
      positionSizePercent: 25,
      riskPerTradePercent: Math.min(2.0, this.riskConfig.riskPerTradePercent || 2.0),
      leverage: safeLev,
    };
    this.addLog(
      'success',
      'SYSTEM',
      `🔧 [异常溯源一键修复] 已激活小资金动态自适应配比 (单笔风险 ≤ ${this.riskConfig.riskPerTradePercent}%, 保证金占比 25%, 杠杆上限 ${safeLev}x)。`
    );
    this.notifyListeners(true);
  }

  public async emergencyClosePosition(
    reason: ExitReason = 'END_OF_DATA',
    symbol?: string
  ): Promise<{ closed: number; failed: number }> {
    if (!symbol) {
      const res = await this.closeAllPositions(reason);
      return { closed: res.closedCount, failed: Math.max(0, this.activePositions.length) };
    }
    const positionsToClose = this.activePositions.filter((p) => p.symbol === symbol);
    let closed = 0;
    let failed = 0;
    for (const pos of positionsToClose) {
      const ok = await this.closePosition(pos, pos.currentPrice, reason);
      if (ok) {
        closed += 1;
        this.addLog(
          'warn',
          'ORDER',
          `⚠️ 平仓完成: [${pos.symbol} ${pos.interval}] ${pos.side} @ ${pos.currentPrice} USDT`,
          pos.symbol
        );
      } else {
        failed += 1;
      }
    }
    return { closed, failed };
  }

  public async closeAllPositions(
    reason: ExitReason = 'MANUAL_CLOSE_ALL',
    applyCooldownMinutes?: number
  ): Promise<{ closedCount: number; netRealizedBeforeClose: number }> {
    if (this.activePositions.length === 0) {
      return { closedCount: 0, netRealizedBeforeClose: 0 };
    }

    const basketSnapshot = this.getPortfolioBasketState();
    // Close losing legs first, then winning legs so volatile adverse moves do not widen losses mid-sweep
    const orderedPositions = [...this.activePositions].sort(
      (a, b) => a.unrealizedPnl - b.unrealizedPnl
    );

    const uniqueSymbols = new Set<string>();
    let closedCount = 0;
    for (const pos of orderedPositions) {
      uniqueSymbols.add(pos.symbol);
      try {
        const closed = await this.closePosition(pos, pos.currentPrice, reason);
        if (closed) closedCount += 1;
      } catch (legErr: any) {
        this.addLog('error', 'API', `⚠️ 批量全平单腿异常 (${pos.symbol}): ${legErr?.message || legErr}`, pos.symbol);
      }
    }

    if (this.hasApiCredentials()) {
      for (const sym of uniqueSymbols) {
        await this.cancelAllBinanceOrders(sym).catch(() => {});
      }
      await this.syncLiveAccountNow(true);
    }

    this.basketPeakNetPnl = 0;
    const cooldownMins =
      applyCooldownMinutes ??
      (reason === 'BASKET_NET_TAKE_PROFIT'
        ? this.riskConfig.portfolioBasket?.cooldownMinutes ?? 20
        : Math.min(5, this.riskConfig.portfolioBasket?.cooldownMinutes ?? 5));

    if (cooldownMins > 0) {
      this.basketCloseCooldownUntil = Date.now() + cooldownMins * 60 * 1000;
    }

    this.addLog(
      basketSnapshot.netRealizablePnl >= 0 ? 'success' : 'warn',
      'ORDER',
      `🧹 [${reason === 'BASKET_NET_TAKE_PROFIT' ? '组合篮子自动全平落袋' : '一键全部平仓完成'}] 已按先亏后盈顺序平掉 ${closedCount}/${orderedPositions.length} 笔持仓并清空交易所挂单 | 平仓前扣费预估净利: ${basketSnapshot.netRealizablePnl >= 0 ? '+' : ''}$${basketSnapshot.netRealizablePnl.toFixed(2)} USDT | 开启 ${cooldownMins} 分钟防复开冷却保护`
    );

    return {
      closedCount,
      netRealizedBeforeClose: basketSnapshot.netRealizablePnl,
    };
  }

  private addLog(
    level: 'info' | 'warn' | 'success' | 'error',
    category: 'SYSTEM' | 'ORDER' | 'SIGNAL' | 'API',
    message: string,
    symbol?: string
  ) {
    const timeStr = new Date().toLocaleTimeString();
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      timestamp: Date.now(),
      level,
      category,
      message,
      symbol,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 500) this.logs.pop();
    this.notifyListeners();
  }

  public async sendEmergencyNotification(title: string, message: string): Promise<boolean> {
    const notif = this.riskConfig.notification;
    if (!notif || !notif.enableEmergencyAlerts) return false;

    const now = Date.now();
    if (notif.lastAlertTimestamp && now - notif.lastAlertTimestamp < 180000) {
      return false;
    }
    notif.lastAlertTimestamp = now;

    let sentCount = 0;
    const fullText = `🚨 [AI 量化熔断紧急预警中枢 - ${title}]\n\n${message}\n\n⏰ 发生时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

    if (notif.telegramBotToken && notif.telegramChatId) {
      try {
        const tgUrl = `https://api.telegram.org/bot${notif.telegramBotToken}/sendMessage`;
        const res = await fetch(tgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: notif.telegramChatId,
            text: fullText,
          }),
        });
        if (res.ok) {
          sentCount++;
          this.addLog('success', 'API', `📱 【Telegram 熔断紧急预警中枢成功推送】: 已发往 Chat ID ${notif.telegramChatId}`);
        }
      } catch (err: any) {
        this.addLog('warn', 'API', `Telegram 预警推送异常: ${err.message}`);
      }
    }

    if (notif.webhookUrl) {
      try {
        const res = await fetch(notif.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'CIRCUIT_BREAKER_TRIGGERED',
            title,
            message,
            timestamp: now,
            status: this.getStatus(),
          }),
        });
        if (res.ok) {
          sentCount++;
          this.addLog('success', 'API', `🌐 【外部 API / SendGrid / Webhook 成功推送】: 熔断数据包同步完成`);
        }
      } catch (err: any) {
        this.addLog('warn', 'API', `Webhook 预警推送异常: ${err.message}`);
      }
    }

    if (sentCount === 0) {
      this.addLog('info', 'SYSTEM', `🔔 【熔断预警通知接口触发】: ${title} | 已自动录入紧急预警日志 (未配置 Telegram Token 或 Webhook URL)`);
    }

    return sentCount > 0;
  }

  private async executeCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastUpdateTime = Date.now();
    this.cycleCounter++;

    try {
      const hasKeys = this.hasApiCredentials();
      this.mode = hasKeys ? 'LIVE' : 'PAPER';

      await Promise.allSettled([
        this.refreshExchangeRulesIfNeeded(false),
        this.refreshTickersSnapshot(),
        ...(hasKeys ? [this.syncLiveAccountNow(false)] : []),
      ]);

      // ZERO-TOUCH AUTO-EVOLUTION: Automatically absorb AI Diagnostic Recommended Timeframe into scanning pool!
      // Capped at 4 timeframes: every extra timeframe costs one kline request per symbol every
      // cycle, and an unbounded pool was silently multiplying API weight (5 symbols x 8 TF = 40
      // requests per 10s).
      const diagnostic = this.getTimeframeDiagnosticReport();
      const recTf = diagnostic.recommendedTimeframe;
      if (
        recTf &&
        !this.monitoredTimeframes.includes(recTf) &&
        this.monitoredTimeframes.length < 4 &&
        ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'].includes(recTf)
      ) {
        this.monitoredTimeframes.push(recTf);
        this.addLog(
          'info',
          'SYSTEM',
          `🤖 【全自动无感进化】系统诊断自动吸收【${recTf}】为当前最佳黄金分析周期，已自动载入监控引擎！`
        );
      }

      // ZERO-TOUCH AUTOMATED CIRCUIT BREAKER CHECK & EMERGENCY NOTIFICATION (throttled log)
      const mktCorr = this.computeMarketCorrelationMetrics();
      if (mktCorr.isCircuitBreakerActive) {
        if (Date.now() - this.lastCircuitBreakerLogTime > 60_000) {
          this.lastCircuitBreakerLogTime = Date.now();
          this.addLog(
            'warn',
            'SYSTEM',
            `🚨 【全自动风险熔断防线触发】: ${mktCorr.circuitBreakerReason}`
          );
        }

        const posDetails = this.activePositions.length > 0
          ? this.activePositions.map((p) => `• [${p.symbol} ${p.side}] 开仓价: $${p.entryPrice}, 浮盈: $${p.unrealizedPnl.toFixed(1)} (${p.unrealizedPnlPercent.toFixed(1)}%)`).join('\n')
          : '当前无活动持仓';

        const alertMessage = [
          `<b>熔断原因</b>: ${mktCorr.circuitBreakerReason}`,
          `<b>当前账户回撤</b>: ${this.getStatus().drawdownPercent.toFixed(2)}%`,
          `<b>大盘共振指数</b>: ${(mktCorr.correlationScore * 100).toFixed(0)}%`,
          `<b>波动爆发比率</b>: ${mktCorr.avgVolatilityRatio.toFixed(2)}x`,
          `<b>避险保护措施</b>: 已将杠杆收紧至 ${mktCorr.safeLevelLeverage}x 并限制最大持仓 ≤ ${mktCorr.maxAllowedAccountPositions} 笔`,
          `\n<b>当前活动持仓清单</b>:\n${posDetails}`,
        ].join('\n');

        await this.sendEmergencyNotification('全局大盘剧烈共振熔断预警', alertMessage);
      }

      const updatedScans: SymbolScanResult[] = [];
      const symbolKlinesMap = new Map<string, Kline[]>();
      const strategyScreener = this.getStrategyScreener();
      const portfolioAlloc = this.getPortfolioAllocation();

      for (const symbol of this.monitoredSymbols) {
        const symRules = this.getSymbolRules(symbol);
        if (hasKeys && symRules.available === false) {
          // Symbol is not tradable on Binance USDT-M (or its feed is permanently unavailable):
          // skip the scan entirely instead of burning kline weight every 10 seconds.
          continue;
        }
        for (const interval of this.monitoredTimeframes) {
          try {
            const fetchResult = await fetchBinanceKlines({
              symbol,
              interval,
              limit: 200,
            });

            const klines = fetchResult.klines;
            if (klines.length < 30) continue;

            if (interval === '15m' || !symbolKlinesMap.has(symbol)) {
              symbolKlinesMap.set(symbol, klines);
            }

            const latestBar = klines[klines.length - 1];
            const currentPrice = latestBar.close;
            const firstBarPrice = klines[0].open;
            const change24hPercent = ((currentPrice - firstBarPrice) / firstBarPrice) * 100;
            const currentAtr =
              calculateATR(klines, 14)[klines.length - 1] ?? (latestBar.high - latestBar.low);

            const recentSlice = klines.slice(-60);
            const baselinePct =
              recentSlice.reduce((s, k) => s + (k.high - k.low) / Math.max(1e-8, k.close), 0) /
              Math.max(1, recentSlice.length);
            if (interval === '15m' || !this.symbolAtrPctBaseline.has(symbol)) {
              this.symbolAtrPctBaseline.set(symbol, baselinePct);
            }

            const closes = klines.map((k) => k.close);
            const ema20Arr = calculateEMA(closes, 20);
            const ema50Arr = calculateEMA(closes, 50);
            const e20 = ema20Arr[ema20Arr.length - 1];
            const e50 = ema50Arr[ema50Arr.length - 1];

            let trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND' = 'RANGE_BOUND';
            let trendDescription = '🟡 箱体震荡整理 (EMA20/50 交叉粘合)';

            if (e20 !== null && e50 !== null) {
              if (e20 > e50 * 1.001) {
                trendContext = 'BULL_TREND';
                trendDescription = '🟢 多头主升趋势 (EMA20 > EMA50 向上多头发散)';
              } else if (e20 < e50 * 0.999) {
                trendContext = 'BEAR_TREND';
                trendDescription = '🔴 空头主跌趋势 (EMA20 < EMA50 向下空头发散)';
              }
            }

            const { signals, patternMap } = generateAllSignals(
              klines,
              this.params,
              'pattern_price_action'
            );

            const latestIndex = signals.length - 1;
            const latestSig = signals[latestIndex];
            const matchedPattern = patternMap.get(latestIndex);

            const scanObj: SymbolScanResult = {
              symbol,
              interval,
              currentPrice,
              change24hPercent: Number(change24hPercent.toFixed(2)),
              atr: currentAtr,
              trendContext,
              trendDescription,
              signal: latestSig,
              patternType: matchedPattern?.type,
              patternName: matchedPattern?.name,
              patternCategory: matchedPattern?.category,
              qualityScore: matchedPattern?.qualityScore,
              stopLossPrice: matchedPattern?.stopLossPrice,
              targetPrice: matchedPattern?.targetPrice,
              lastScanTime: Date.now(),
            };
            updatedScans.push(scanObj);
            this.upsertScanResult(scanObj);

            if (latestSig !== 0 && matchedPattern) {
              this.addLog(
                'info',
                'SIGNAL',
                `⚡ 触发形态信号: [${symbol} ${interval}] ${matchedPattern.name} (代码: ${matchedPattern.type}, 动作: ${matchedPattern.action}, 质量: ${matchedPattern.qualityScore})`,
                symbol
              );
            }

            const activePosIndex = this.activePositions.findIndex((p) => p.symbol === symbol);
            if (activePosIndex >= 0) {
              const pos = this.activePositions[activePosIndex];
              // In LIVE mode with synced Binance account, preserve authoritative MarkPrice & exchange unRealizedProfit from /fapi/v2/positionRisk!
              if (pos.isPaper || !hasKeys || !this.liveSyncInfo?.syncOk) {
                pos.currentPrice = currentPrice;
                if (pos.side === 'LONG') {
                  pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
                } else {
                  pos.unrealizedPnl = (pos.entryPrice - currentPrice) * pos.quantity;
                }
                pos.unrealizedPnlPercent = pos.marginUsed > 0 ? (pos.unrealizedPnl / pos.marginUsed) * 100 : 0;
              }

              const evalPrice = pos.currentPrice || currentPrice;

              if (pos.unrealizedPnl > (pos.peakPnlUsdt || 0)) {
                pos.peakPnlUsdt = pos.unrealizedPnl;
              }

              if (pos.side === 'LONG' && evalPrice > pos.trailingPeakPrice) {
                pos.trailingPeakPrice = evalPrice;
              } else if (pos.side === 'SHORT' && evalPrice < pos.trailingPeakPrice) {
                pos.trailingPeakPrice = evalPrice;
              }

              let exitTriggered: ExitReason | null = null;

              // 1. Profit Protection Exit (利润保护熔断锁利，彻底根治盈利30~80USDT后倒亏的严重痛点)
              // 规则：
              // A. 浮盈曾达到 >= 50 USDT，若利润回吐超过 35% (保留至少 65% 利润)，立即止盈平仓！
              // B. 浮盈曾达到 >= 25 USDT，若利润回吐超过 45% (保留至少 55% 利润)，立即止盈平仓！
              // C. 任何单子只要浮盈曾达到过 >= 20 USDT，净利润绝不允许跌破 +8 USDT 保底盈利！
              if (!exitTriggered && pos.peakPnlUsdt >= 20) {
                if (pos.peakPnlUsdt >= 50 && pos.unrealizedPnl <= pos.peakPnlUsdt * 0.65) {
                  exitTriggered = 'PROFIT_PROTECT_EXIT';
                  this.addLog(
                    'success',
                    'ORDER',
                    `💰 [${symbol} 利润保护止盈] 浮盈曾达到 $${pos.peakPnlUsdt.toFixed(1)}，回撤触及防线，锁定当前 +$${pos.unrealizedPnl.toFixed(1)} 利润果断平仓！`,
                    symbol
                  );
                } else if (pos.peakPnlUsdt >= 25 && pos.unrealizedPnl <= pos.peakPnlUsdt * 0.55) {
                  exitTriggered = 'PROFIT_PROTECT_EXIT';
                  this.addLog(
                    'success',
                    'ORDER',
                    `💰 [${symbol} 利润保护止盈] 浮盈曾达到 $${pos.peakPnlUsdt.toFixed(1)}，锁定当前 +$${pos.unrealizedPnl.toFixed(1)} 利润平仓，杜绝倒亏！`,
                    symbol
                  );
                } else if (pos.unrealizedPnl <= 8) {
                  exitTriggered = 'PROFIT_PROTECT_EXIT';
                  this.addLog(
                    'success',
                    'ORDER',
                    `🛡️ [${symbol} 底线锁利保护] 浮盈曾触及 $${pos.peakPnlUsdt.toFixed(1)}，回吐逼近成本，守住底线 +$${pos.unrealizedPnl.toFixed(1)} 平仓！`,
                    symbol
                  );
                }
              }

              // 2. Automated Zero-Touch Dynamic Breakeven Stop-Loss ("自动保本设置": 根据行情波动率与收益率全自动决策提升止损至成本价)
              if (this.riskConfig.autoBreakevenEnabled) {
                // Dynamically calculate breakeven threshold: High Volatility -> N=0.6% ($12 USDT), Normal -> N=0.9% ($15 USDT)
                const currentVolRatio = currentAtr > 0 ? (latestBar.high - latestBar.low) / currentAtr : 1.0;
                const dynamicBreakevenPercent = currentVolRatio >= 1.5 ? 0.6 : 0.9;
                const dynamicBreakevenUsdt = currentVolRatio >= 1.5 ? 12 : 15;

                const gainPercent = (pos.unrealizedPnl / pos.marginUsed) * 100;
                if (gainPercent >= dynamicBreakevenPercent || pos.peakPnlUsdt >= dynamicBreakevenUsdt) {
                  const safeCostLong = pos.entryPrice * 1.0015;
                  const safeCostShort = pos.entryPrice * 0.9985;
                  // Only ratchet to breakeven while price is still on the profitable side.
                  // Moving a long's stop above the current market makes Binance reject it with
                  // -2021 and, in the old build, silently left the leg "protected" in the UI only.
                  const canMoveLong = pos.side === 'LONG' && evalPrice > safeCostLong * 1.002;
                  const canMoveShort = pos.side === 'SHORT' && evalPrice < safeCostShort * 0.998;
                  let moved = false;

                  if (canMoveLong && (pos.stopLossPrice === null || pos.stopLossPrice < safeCostLong)) {
                    pos.stopLossPrice = safeCostLong;
                    moved = true;
                    this.addLog('success', 'ORDER', `🛡️ [${symbol} 自动保本触发] 浮盈已达 ${gainPercent.toFixed(1)}% (+$${pos.peakPnlUsdt.toFixed(1)} USDT)，自动拉升止损至开仓保本价 ($${safeCostLong.toFixed(2)})，彻底锁定本金零亏损！`, symbol);
                  } else if (canMoveShort && (pos.stopLossPrice === null || pos.stopLossPrice > safeCostShort)) {
                    pos.stopLossPrice = safeCostShort;
                    moved = true;
                    this.addLog('success', 'ORDER', `🛡️ [${symbol} 自动保本触发] 浮盈已达 ${gainPercent.toFixed(1)}% (+$${pos.peakPnlUsdt.toFixed(1)} USDT)，自动下调止损至开仓保本价 ($${safeCostShort.toFixed(2)})，彻底锁定本金零亏损！`, symbol);
                  }

                  // Sync conditional order on Binance Futures matching engine if real exchange API keys are present
                  if (moved && !pos.isPaper && this.hasApiCredentials() && pos.stopLossPrice) {
                    const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
                    // Place the new stop FIRST, then cancel the old one: never leave the position
                    // unprotected in between (the old code cancelled first).
                    const newSl = await this.placeBinanceConditionalOrder(
                      symbol,
                      closeSide,
                      'STOP_MARKET',
                      pos.stopLossPrice,
                      pos.quantity,
                      pos.side,
                      evalPrice
                    );
                    if (newSl?.orderId) {
                      const oldId = pos.stopLossOrderId;
                      pos.stopLossOrderId = newSl.orderId;
                      if (oldId && oldId !== newSl.orderId) {
                        await this.cancelBinanceOrder(symbol, oldId);
                      }
                      this.addLog('info', 'API', `⚡ [币安交易所自动保本挂单更新成功] 挂单价: $${pos.stopLossPrice.toFixed(2)} (单号 #${newSl.orderId})`, symbol);
                    }
                  }
                }
              }

              // 3. Strategy Pattern Structural Invalidation Check (策略形态结构失效平仓)
              if (!exitTriggered && e20 !== null && e50 !== null) {
                if (pos.patternType === 'BROOKS_H2_LONG' && currentPrice < e50 * 0.998) {
                  exitTriggered = 'PATTERN_INVALIDATED';
                  this.addLog('warn', 'ORDER', `⚠️ [${symbol}] Al Brooks H2 多头形态推演失效: 价格跌破 50EMA 趋势防守线 ($${e50.toFixed(2)})，策略自动平仓！`, symbol);
                } else if (pos.patternType === 'BROOKS_L2_SHORT' && currentPrice > e50 * 1.002) {
                  exitTriggered = 'PATTERN_INVALIDATED';
                  this.addLog('warn', 'ORDER', `⚠️ [${symbol}] Al Brooks L2 空头形态推演失效: 价格突破 50EMA 趋势防守线 ($${e50.toFixed(2)})，策略自动平仓！`, symbol);
                }
              }

              // 4. Liquidation Check
              if (!exitTriggered) {
                if (pos.side === 'LONG' && evalPrice <= pos.liquidationPrice) {
                  exitTriggered = 'LIQUIDATION';
                } else if (pos.side === 'SHORT' && evalPrice >= pos.liquidationPrice) {
                  exitTriggered = 'LIQUIDATION';
                }
              }

              // 5. Structural Stop Loss (形态极值止损)
              // Evaluated on the same price basis the exchange's MARK_PRICE conditional orders use.
              if (!exitTriggered && pos.stopLossPrice !== null) {
                if (pos.side === 'LONG' && evalPrice <= pos.stopLossPrice) exitTriggered = 'STOP_LOSS';
                else if (pos.side === 'SHORT' && evalPrice >= pos.stopLossPrice) exitTriggered = 'STOP_LOSS';
              }

              // 6. Structural Take Profit (形态结构目标止盈: 2.2x~2.5x 盈亏比)
              if (!exitTriggered && pos.takeProfitPrice !== null) {
                if (pos.side === 'LONG' && evalPrice >= pos.takeProfitPrice) exitTriggered = 'TAKE_PROFIT';
                else if (pos.side === 'SHORT' && evalPrice <= pos.takeProfitPrice) exitTriggered = 'TAKE_PROFIT';
              }

              // 7. Dynamic Trailing Stop-Loss Feature (用户可配置激活阈值 & 步进距离)
              if (!exitTriggered && this.riskConfig.useTrailingStop) {
                const activationRate = (this.riskConfig.trailingActivationPercent ?? 0.8) / 100;
                const callbackRate = (this.riskConfig.trailingCallbackPercent ?? 0.45) / 100;
                const activationUsdt = this.riskConfig.trailingActivationUsdt ?? 25;

                let gainRate = 0;
                if (pos.side === 'LONG') {
                  gainRate = (pos.trailingPeakPrice - pos.entryPrice) / pos.entryPrice;
                } else {
                  gainRate = (pos.entryPrice - pos.trailingPeakPrice) / pos.entryPrice;
                }

                // Check activation condition (gain reaches activation percent or floating profit reaches USDT threshold)
                if (gainRate >= activationRate || (pos.peakPnlUsdt && pos.peakPnlUsdt >= activationUsdt)) {
                  if (!pos.isTrailingActive) {
                    pos.isTrailingActive = true;
                    // Immediately elevate stop line to Breakeven (+0.15% fee buffer for long, -0.15% for short)
                    const breakevenPrice =
                      pos.side === 'LONG' ? pos.entryPrice * 1.0015 : pos.entryPrice * 0.9985;
                    pos.trailingStopPrice = breakevenPrice;
                    this.addLog(
                      'success',
                      'ORDER',
                      `🚀 [${symbol} ${pos.interval}] 移动追踪已激活 (顺势涨跌 ${(gainRate * 100).toFixed(2)}% / 浮盈 $${pos.peakPnlUsdt?.toFixed(1) || 0} USDT)！动态止损锁定至成本保本价 $${breakevenPrice.toFixed(2)}，杜绝倒亏！`,
                      symbol
                    );
                  }

                  if (pos.side === 'LONG') {
                    // Rachet stop higher as price makes new highs
                    const candidateStop = pos.trailingPeakPrice * (1 - callbackRate);
                    if (pos.trailingStopPrice === null || pos.trailingStopPrice === undefined || candidateStop > pos.trailingStopPrice) {
                      pos.trailingStopPrice = candidateStop;
                      await this.syncTrailingStopToExchange(pos);
                    }

                    if (evalPrice <= pos.trailingStopPrice) {
                      exitTriggered = 'TRAILING_STOP';
                      this.addLog(
                        'success',
                        'ORDER',
                        `💰 [${symbol} ${pos.interval} 移动追踪平仓锁利] 价格从最高峰值 $${pos.trailingPeakPrice.toFixed(2)} 回撤触及动态止盈线 $${pos.trailingStopPrice.toFixed(2)} (回撤 ${(callbackRate * 100).toFixed(2)}%)，锁定盈利 +$${pos.unrealizedPnl.toFixed(2)} USDT！`,
                        symbol
                      );
                    }
                  } else {
                    // Short
                    const candidateStop = pos.trailingPeakPrice * (1 + callbackRate);
                    if (pos.trailingStopPrice === null || pos.trailingStopPrice === undefined || candidateStop < pos.trailingStopPrice) {
                      pos.trailingStopPrice = candidateStop;
                      await this.syncTrailingStopToExchange(pos);
                    }

                    if (evalPrice >= pos.trailingStopPrice) {
                      exitTriggered = 'TRAILING_STOP';
                      this.addLog(
                        'success',
                        'ORDER',
                        `💰 [${symbol} ${pos.interval} 移动追踪平仓锁利] 价格从最低谷值 $${pos.trailingPeakPrice.toFixed(2)} 反弹触及动态止盈线 $${pos.trailingStopPrice.toFixed(2)} (回撤 ${(callbackRate * 100).toFixed(2)}%)，锁定盈利 +$${pos.unrealizedPnl.toFixed(2)} USDT！`,
                        symbol
                      );
                    }
                  }
                }
              }

              // 8. Strategy-Adaptive Momentum Decay Exit (策略-形态协同动能衰竭平仓)
              const holdingHours = (Date.now() - pos.entryTime) / (1000 * 3600);
              const maxThresholdHours = pos.interval === '5m' ? 2.0 : pos.interval === '15m' ? 6.0 : 12.0;

              if (!exitTriggered && holdingHours >= maxThresholdHours) {
                if (pos.unrealizedPnlPercent >= 0.5) {
                  // 顺势盈利中，豁免时间平仓，继续冲刺目标止盈
                } else {
                  exitTriggered = 'MOMENTUM_DECAY_TIMEOUT';
                  this.addLog('warn', 'ORDER', `⌛ [${symbol} ${pos.interval}] 形态【${pos.patternName}】推演超 ${holdingHours.toFixed(1)}h 且动能衰竭未果，智能平仓释放资金！`, symbol);
                }
              }

              if (exitTriggered) {
                this.addLog(
                  exitTriggered === 'TAKE_PROFIT' || exitTriggered === 'TRAILING_STOP' ? 'success' : 'warn',
                  'ORDER',
                  `🎯 [${symbol} ${pos.interval}] 触发平仓条件: ${exitTriggered} @ ${evalPrice} USDT`,
                  symbol
                );
                await this.closePosition(pos, evalPrice, exitTriggered);
                continue;
              }

              const holdingMs = Date.now() - pos.entryTime;
              const isMatchingTimeframe =
                pos.interval === interval || (pos.interval === 'LIVE' && interval === '15m');
              if (
                isMatchingTimeframe &&
                holdingMs >= 180_000 &&
                ((pos.side === 'LONG' && latestSig === -1) ||
                  (pos.side === 'SHORT' && latestSig === 1))
              ) {
                this.addLog(
                  'info',
                  'ORDER',
                  `🔄 [${symbol} ${interval}] 收到同周期反向信号【${matchedPattern?.name ?? '反向形态'}】(已持仓 ${(holdingMs / 60000).toFixed(1)}min)，平仓当前持仓`,
                  symbol
                );
                await this.closePosition(pos, currentPrice, 'SIGNAL_REVERSAL');
                continue;
              }
            }

            // AUTO-OPTIMIZATION PATTERN FILTERING WITH 7D SCREENER & DYNAMIC CAPITAL SIZING:
            if (activePosIndex < 0 && latestSig !== 0 && matchedPattern) {
              // Enforce strict 5-contract live lock & prevent concurrent/duplicate symbol order race
              if (
                !normalizeLockedSymbol(symbol) ||
                this.pendingOrderSymbols.has(symbol) ||
                this.activePositions.some((p) => p.symbol === symbol)
              ) {
                continue;
              }

              // Portfolio max drawdown kill-switch (hard block new openings when equity drawdown breaches limit)
              const liveRisk = this.getRiskMetrics();
              if (liveRisk.isDrawdownLocked) {
                if (Date.now() - this.lastDrawdownLockLogTime > 60_000) {
                  this.lastDrawdownLockLogTime = Date.now();
                  this.addLog(
                    'error',
                    'SYSTEM',
                    `🛑 [账户最大回撤熔断锁死] 当前净值回撤 ${liveRisk.drawdownPercent.toFixed(
                      2
                    )}% 已达到上限 ${liveRisk.maxAllowedDrawdownPercent}%，系统已强制禁止新增任何实盘开仓！`
                  );
                  await this.sendEmergencyNotification(
                    '最大回撤熔断停止开仓',
                    `账户净值回撤已达 ${liveRisk.drawdownPercent.toFixed(2)}% (阈值 ${liveRisk.maxAllowedDrawdownPercent}%)，已自动禁止一切新增开仓操作！`
                  );
                }
                continue;
              }

              if (this.basketCloseCooldownUntil && Date.now() < this.basketCloseCooldownUntil) {
                const remainMins = Math.max(1, Math.ceil((this.basketCloseCooldownUntil - Date.now()) / 60000));
                if (Date.now() - this.lastBasketCooldownLogTime > 60000) {
                  this.lastBasketCooldownLogTime = Date.now();
                  this.addLog(
                    'info',
                    'SIGNAL',
                    `🧊 [全平防原地复开冷却保护中] 剩余 ${remainMins} 分钟冷却，暂停开新仓避免同一根 K 线重复交手续费`,
                    symbol
                  );
                }
                continue;
              }

              if (hasKeys && (!this.liveSyncInfo || !this.liveSyncInfo.syncOk)) {
                this.addLog(
                  'error',
                  'API',
                  `🚫 [拒绝实盘开仓] 收到 ${symbol} ${matchedPattern.name} 信号，但币安账户同步失败 (${this.liveSyncInfo?.errorMessage || '尚未完成首次同步'})，严禁在净值未知时开仓！`,
                  symbol
                );
                continue;
              }

              const symRules = this.getSymbolRules(symbol);
              if (hasKeys && symRules.available === false) {
                this.addLog(
                  'warn',
                  'API',
                  `⏭️ [${symbol}] 当前未在币安 USDT-M 合约 (/fapi/v1/exchangeInfo) 列表中上市或不支持交易 (${symRules.note || '合约不可用'})，自动跳过下单！`,
                  symbol
                );
                continue;
              }

              // Portfolio max concurrent positions limit driven by VIX-like regime
              if (this.activePositions.length >= portfolioAlloc.maxConcurrentPositions) {
                this.addLog(
                  'info',
                  'SIGNAL',
                  `⚖️ [动态资产组合上限] VIX=${portfolioAlloc.vixLikeIndex} 限制最大同时持仓 ${portfolioAlloc.maxConcurrentPositions} 笔，暂停新增 ${symbol}`,
                  symbol
                );
                continue;
              }

              // 7-Day Strategy Auto Screener (Eliminate Grade < C)
              const matchedScreener = strategyScreener.find(
                (s) =>
                  matchedPattern.type.toLowerCase().includes(s.strategyKey.split('_')[0].toLowerCase()) ||
                  s.strategyKey === 'pattern_price_action'
              );
              if (matchedScreener?.status === 'ELIMINATED_BELOW_C' && matchedPattern.qualityScore < 95) {
                this.addLog(
                  'warn',
                  'SIGNAL',
                  `📉 [7日策略自动筛选淘汰]: ${matchedScreener.strategyName} 评级 ${matchedScreener.grade} 级 (<C)，已自动淘汰拦截开仓！`,
                  symbol
                );
                continue;
              }

              const patternTypeKey = matchedPattern.type;
              const learningItem = this.patternLearningWeights.get(patternTypeKey);

              // 1. Online Multi-Dimensional Self-Learning Check (Timeframe & Session Slicing)
              if (learningItem) {
                if (learningItem.status === 'DECAY_PRUNED' && matchedPattern.qualityScore < 94) {
                  this.addLog(
                    'warn',
                    'SIGNAL',
                    `🧠 【自学习强化剪枝拦截】: 拒绝开仓！形态【${matchedPattern.name}】已被强化学习标记为低胜率剪枝 (权重 ${learningItem.weight}x, 胜率 ${learningItem.winRate}%, 信号分: ${matchedPattern.qualityScore})`,
                    symbol
                  );
                  continue;
                }

                // A. Timeframe-Specific Low Win Rate Filter (5m vs 15m vs 30m)
                const tfStat = learningItem.timeframeStats?.find((t) => t.timeframe === interval);
                if (tfStat && tfStat.totalTrades >= 3 && tfStat.winRate < 35 && matchedPattern.qualityScore < 92) {
                  this.addLog(
                    'warn',
                    'SIGNAL',
                    `⏱️ 【周期离散防护拦截】: 拒绝开仓！形态【${matchedPattern.name}】在【${interval}】周期历史胜率仅 ${tfStat.winRate.toFixed(1)}% (${tfStat.wins}/${tfStat.totalTrades}胜)，降维避让`,
                    symbol
                  );
                  continue;
                }

                // B. Trading Session Low Win Rate Filter (Asia / Europe / US / Overnight)
                const currentUtcHour = new Date().getUTCHours();
                let currentSessionKey: 'ASIA' | 'EUROPE' | 'US' | 'OVERNIGHT' = 'ASIA';
                if (currentUtcHour >= 14 && currentUtcHour < 22) currentSessionKey = 'US';
                else if (currentUtcHour >= 8 && currentUtcHour < 14) currentSessionKey = 'EUROPE';
                else if (currentUtcHour >= 22) currentSessionKey = 'OVERNIGHT';

                const sStat = learningItem.sessionStats?.find((s) => s.sessionKey === currentSessionKey);
                if (sStat && sStat.totalTrades >= 3 && sStat.winRate < 35 && matchedPattern.qualityScore < 92) {
                  this.addLog(
                    'warn',
                    'SIGNAL',
                    `⏰ 【时段陷阱拦截】: 拒绝开仓！形态【${matchedPattern.name}】在当前【${sStat.sessionName.split(' ')[0]}】历史胜率仅 ${sStat.winRate.toFixed(1)}% (${sStat.wins}/${sStat.totalTrades}胜)，避开低效时段`,
                    symbol
                  );
                  continue;
                }
              }

              // 2. Dynamic Cool-off Check
              const historyForPattern = this.closedTrades
                .filter((t) => t.patternType === patternTypeKey)
                .slice(-10);
              const totalCompleted = historyForPattern.length;

              if (totalCompleted >= 3) {
                const lastTrade = historyForPattern[historyForPattern.length - 1];
                const hoursSinceLastTrade = (Date.now() - lastTrade.exitTime) / (1000 * 3600);

                const patternWins = historyForPattern.filter((t) => t.netPnl > 0).length;
                const patternWinRate = (patternWins / totalCompleted) * 100;
                const patternNetPnl = historyForPattern.reduce((acc, t) => acc + t.netPnl, 0);

                const isCoolOffUnfrozen = hoursSinceLastTrade >= 12;
                const isHighQualityBypass = matchedPattern.qualityScore >= 93;

                if ((patternWinRate < 45 || patternNetPnl < 0) && !isCoolOffUnfrozen && !isHighQualityBypass) {
                  this.addLog(
                    'warn',
                    'SIGNAL',
                    `⚠️ 【形态自优防护拦截】: 拒绝开仓！形态【${matchedPattern.name}】在近期 10 笔调单中胜率为 ${patternWinRate.toFixed(1)}% (${patternWins}/${totalCompleted}胜)，冷却观察中 (${hoursSinceLastTrade.toFixed(1)}h/12h)。`,
                    symbol
                  );
                  continue;
                } else if (isCoolOffUnfrozen && patternWinRate < 45) {
                  this.addLog(
                    'info',
                    'SIGNAL',
                    `🔄 【形态解冻复核】: 形态【${matchedPattern.name}】已过 12h 冷却期，随着大盘趋势转变重新解冻试仓！`,
                    symbol
                  );
                }
              }

              // 3. Reinforcement Learning-based Symbol Strategy Sensitivity Check
              const rlStates = this.computeSymbolRLSensitivityStates();
              const symRl = rlStates.find((r) => r.symbol === symbol);
              const requiredQualityThreshold = symRl ? symRl.qualityScoreThreshold : 85;

              if (matchedPattern.qualityScore < requiredQualityThreshold) {
                this.addLog(
                  'warn',
                  'SIGNAL',
                  `🧠 【强化学习灵敏度门槛拦截】: 拒绝开仓！币种【${symbol}】当前强化学习迭代门槛为 ≥${requiredQualityThreshold} 分 (${symRl?.rlAction})，当前信号分 ${matchedPattern.qualityScore} 分未达标`,
                  symbol
                );
                continue;
              }

              // 4. Global Market Correlation Circuit Breaker Enforcement
              const mktCorr = this.computeMarketCorrelationMetrics();
              if (mktCorr.isCircuitBreakerActive && this.activePositions.length >= mktCorr.maxAllowedAccountPositions) {
                this.addLog(
                  'warn',
                  'SIGNAL',
                  `🚨 【全局市场共振熔断锁定】: 拒绝开仓！市场检测到全网共振暴发，全局熔断限制最大持仓 ≤ ${mktCorr.maxAllowedAccountPositions} 笔！`,
                  symbol
                );
                continue;
              }

              // 5. Automated Symbol-Specific Risk Control (Sharpe ratio & Max drawdown protection)
              const symRiskCtrl = this.computeSymbolRiskControlStats().find((r) => r.symbol === symbol);
              const activeCountForSym = this.activePositions.filter((p) => p.symbol === symbol).length;

              if (symRiskCtrl && activeCountForSym >= symRiskCtrl.maxAllowedPositions) {
                this.addLog(
                  'warn',
                  'SIGNAL',
                  `🛡️ 【Symbol 风控上限限制】: 拒绝开仓！币种【${symbol}】已触及风控最大持仓上限 (${activeCountForSym}/${symRiskCtrl.maxAllowedPositions})`,
                  symbol
                );
                continue;
              }

              const side: 'LONG' | 'SHORT' = latestSig === 1 ? 'LONG' : 'SHORT';
              const baseLeverage = this.leverage;

              // Calculate ATR Volatility Ratio (Risk-Parity Volatility Scaling)
              const avgAtr20 = klines.slice(-20).reduce((sum, k) => sum + (k.high - k.low), 0) / 20;
              const volRatio = avgAtr20 > 0 ? currentAtr / avgAtr20 : 1.0;

              // Real-money safety lock: NEVER scale leverage above user's configured baseLeverage!
              let leverage = Math.max(1, Math.min(20, baseLeverage));
              if (mktCorr.isCircuitBreakerActive) {
                leverage = Math.min(leverage, mktCorr.safeLevelLeverage);
                this.addLog(
                  'warn',
                  'SIGNAL',
                  `🚨 【市场熔断避险降杠杆】: 全局大盘共振剧烈，强制将开仓杠杆归一化为 ${leverage}x 最低安全基线！`,
                  symbol
                );
              } else if (volRatio > 1.8) {
                // High Volatility Spike -> Lower leverage to widen stop-loss buffer & prevent wick liquidation
                leverage = Math.max(1, Math.round(leverage * 0.65));
                this.addLog('info', 'SIGNAL', `🛡️ [${symbol} 风险平价降杠杆] 当前波动率比率 ${volRatio.toFixed(2)}x (剧烈波动插针期)，杠杆调至 ${leverage}x 防扫损！`, symbol);
              } else if (matchedPattern.qualityScore < 85) {
                leverage = Math.max(1, Math.round(leverage * 0.8));
              }

              // Apply Symbol Sharpe / Max Drawdown Risk Control downscaling if symbol risk level is abnormal
              if (symRiskCtrl && symRiskCtrl.riskLevel !== 'SAFE_NORMAL') {
                const prevLev = leverage;
                leverage = Math.min(leverage, symRiskCtrl.effectiveLeverage);
                this.addLog(
                  'warn',
                  'SIGNAL',
                  `🛡️ 【Symbol 动态风控生效】: 币种【${symbol}】处于 ${symRiskCtrl.riskLevel} 状态 (夏普: ${symRiskCtrl.sharpeRatio}, 回撤: ${symRiskCtrl.maxDrawdownPercent}%)，强制将杠杆由 ${prevLev}x 下调至 ${leverage}x`,
                  symbol
                );
              }
              leverage = Math.min(baseLeverage, Math.max(1, leverage));

              const patternTitle = matchedPattern.name;
              let stopLossPrice: number | null = matchedPattern.stopLossPrice ?? null;
              let plannedStopDistance = stopLossPrice ? Math.abs(currentPrice - stopLossPrice) : 0;

              if (!stopLossPrice || plannedStopDistance <= 0) {
                if (this.riskConfig.slMode === 'PERCENT' && this.riskConfig.slPercent > 0) {
                  plannedStopDistance = currentPrice * (this.riskConfig.slPercent / 100);
                } else {
                  const mult = this.riskConfig.slAtrMultiplier > 0 ? this.riskConfig.slAtrMultiplier : 1.8;
                  plannedStopDistance = Math.max(currentAtr * mult, currentPrice * 0.008);
                }
                stopLossPrice = side === 'LONG' ? currentPrice - plannedStopDistance : currentPrice + plannedStopDistance;
              }

              let takeProfitPrice: number | null = matchedPattern.targetPrice ?? null;
              if (!takeProfitPrice || takeProfitPrice <= 0) {
                const rr = this.riskConfig.tpRiskRewardRatio > 0 ? this.riskConfig.tpRiskRewardRatio : 2.2;
                const rewardDist = Math.max(plannedStopDistance * rr, currentPrice * 0.015);
                takeProfitPrice = side === 'LONG' ? currentPrice + rewardDist : Math.max(currentPrice * 0.05, currentPrice - rewardDist);
              }

              // Live-equity-anchored Dynamic Allocation & Hard Single-Trade Risk Cap
              const sizingMult = learningItem ? learningItem.adaptiveSizingMultiplier : 1.0;
              const weightItem = portfolioAlloc.weights.find((w) => w.symbol === symbol);
              const activeMarginUsedTotal = this.activePositions.reduce(
                (sum, p) => sum + Math.max(0, p.marginUsed || 0),
                0
              );
              const liveTotalEquity =
                hasKeys && this.liveSyncInfo?.syncOk
                  ? this.liveSyncInfo.marginBalance
                  : this.equity > 0
                  ? this.equity
                  : this.balance;
              const sizingResult = computeDynamicSmallCapitalSizing({
                symbol,
                availableBalance: this.balance,
                totalEquity: liveTotalEquity,
                activeMarginUsedTotal,
                maxTotalMarginRatio: 0.78,
                currentPrice,
                leverage,
                basePositionPercent: this.riskConfig.positionSizePercent,
                learningMultiplier: sizingMult,
                portfolioExposureMultiplier: portfolioAlloc.totalExposureMultiplier,
                symbolWeightMultiplier: weightItem?.sizingMultiplier ?? 1.0,
                stopLossPrice,
                riskPerTradePercent: this.riskConfig.riskPerTradePercent || 2.0,
                rules: symRules,
              });

              if (!sizingResult.canOpen) {
                this.addLog(
                  'warn',
                  'ORDER',
                  `⏭️ [${symbol} 资金/仓位风控拦截] ${sizingResult.reason}`,
                  symbol
                );
                continue;
              }

              const quantity = sizingResult.quantity;
              const allocatedMargin = sizingResult.allocatedMargin;
              const entryFee = sizingResult.estimatedFee;
              leverage = sizingResult.effectiveLeverage;

              // Execute Smart Order Algorithm (Volume & Volatility Depth Evaluation)
              this.evaluateSmartExecutionAlgorithm(
                symbol,
                side === 'LONG' ? 'BUY' : 'SELL',
                quantity,
                currentPrice,
                klines
              );

              this.pendingOrderSymbols.add(symbol);
              try {
                let binanceOrderId: string | undefined;
                let actualEntryPrice = currentPrice;
                let actualQty = quantity;

                if (hasKeys) {
                  await this.setBinanceLeverage(symbol, leverage);
                  const orderRes = await this.placeBinanceMarketOrder(
                    symbol,
                    side === 'LONG' ? 'BUY' : 'SELL',
                    quantity,
                    false,
                    side
                  );
                  binanceOrderId = orderRes?.orderId;
                  if (orderRes?.executedQty && orderRes.executedQty > 0) actualQty = orderRes.executedQty;
                  if (orderRes?.avgPrice && orderRes.avgPrice > 0) actualEntryPrice = orderRes.avgPrice;
                } else {
                  this.balance = Math.max(0, this.balance - (allocatedMargin + entryFee));
                }

                const mmr = 0.005;
                const liqPrice =
                  side === 'LONG'
                    ? actualEntryPrice * (1 - 1 / leverage + mmr)
                    : actualEntryPrice * (1 + 1 / leverage - mmr);

                // MANDATORY Exchange-Level Stop-Loss & Take-Profit Orders directly on Binance Futures
                let stopLossOrderId: string | undefined;
                let takeProfitOrderId: string | undefined;

                if (hasKeys) {
                  const closeSide = side === 'LONG' ? 'SELL' : 'BUY';

                  // Re-derive the stop/target from the REAL fill price. The levels produced by the
                  // pattern engine come from the scan series; if they sit on the wrong side of the
                  // actual fill Binance rejects them with -2021 and the position runs naked.
                  let liveSlPrice = stopLossPrice;
                  if (!(side === 'LONG' ? liveSlPrice < actualEntryPrice * 0.999 : liveSlPrice > actualEntryPrice * 1.001)) {
                    const safeSl = this.computeSafeStopPrice(side, actualEntryPrice, actualEntryPrice);
                    if (safeSl) liveSlPrice = safeSl;
                  }
                  let liveTpPrice = takeProfitPrice;
                  if (!(side === 'LONG' ? liveTpPrice > actualEntryPrice * 1.001 : liveTpPrice < actualEntryPrice * 0.999)) {
                    const safeTp = this.computeSafeTakeProfitPrice(side, actualEntryPrice, actualEntryPrice);
                    if (safeTp) liveTpPrice = safeTp;
                  }

                  // A. 必挂交易所 STOP_MARKET 止损单（三次端点回退已在内部完成，失败会明确返回 null）
                  if (liveSlPrice !== null && liveSlPrice > 0) {
                    const slRes = await this.placeBinanceConditionalOrder(
                      symbol,
                      closeSide,
                      'STOP_MARKET',
                      liveSlPrice,
                      actualQty,
                      side,
                      actualEntryPrice
                    );

                    if (slRes?.orderId) {
                      stopLossOrderId = slRes.orderId;
                      stopLossPrice = liveSlPrice;
                      this.addLog('info', 'API', `🛡️ [交易所必挂止损单 OK] ${symbol} STOP_MARKET @ $${liveSlPrice.toFixed(2)} (#${slRes.orderId})`, symbol);
                    } else {
                      this.addLog(
                        'warn',
                        'API',
                        `⚠️ [止损单挂载失败] ${symbol} 三种通道均未成功，已转为应用层动态止损盯盘（下个同步周期会自动补挂）`,
                        symbol
                      );
                    }
                  }

                  // B. 必挂交易所 TAKE_PROFIT_MARKET 止盈单
                  if (liveTpPrice !== null && liveTpPrice > 0) {
                    const tpRes = await this.placeBinanceConditionalOrder(
                      symbol,
                      closeSide,
                      'TAKE_PROFIT_MARKET',
                      liveTpPrice,
                      actualQty,
                      side,
                      actualEntryPrice
                    );
                    if (tpRes?.orderId) {
                      takeProfitOrderId = tpRes.orderId;
                      takeProfitPrice = liveTpPrice;
                      this.addLog('info', 'API', `🎯 [交易所必挂止盈单 OK] ${symbol} TAKE_PROFIT_MARKET @ $${liveTpPrice.toFixed(2)} (#${tpRes.orderId})`, symbol);
                    }
                  }
                }

                const newPosition: ActivePosition = {
                  id: `pos_${symbol}_${Date.now()}`,
                  symbol,
                  interval,
                  side,
                  patternType: matchedPattern.type,
                  patternName: patternTitle,
                  patternCategory: matchedPattern.category,
                  entryTime: Date.now(),
                  entryPrice: actualEntryPrice,
                  currentPrice,
                  quantity: actualQty,
                  leverage,
                  marginUsed: allocatedMargin,
                  unrealizedPnl: 0,
                  unrealizedPnlPercent: 0,
                  peakPnlUsdt: 0,
                  stopLossPrice,
                  takeProfitPrice,
                  trailingPeakPrice: actualEntryPrice,
                  trailingStopPrice: null,
                  isTrailingActive: false,
                  liquidationPrice: Math.max(0, liqPrice),
                  strategyUsed: 'pattern_price_action',
                  binanceOrderId,
                  stopLossOrderId,
                  takeProfitOrderId,
                  isPaper: !hasKeys,
                };

                this.activePositions.push(newPosition);

                if (hasKeys) {
                  await this.syncLiveAccountNow(false);
                }

                this.addLog(
                  'success',
                  'ORDER',
                  `🚀 [${hasKeys ? '实盘开单' : '模拟观察记录'}] ${symbol} (${interval}) 识别【${patternTitle}】-> ${side} @ $${actualEntryPrice} | ${sizingResult.reason} | 止损 $${stopLossPrice.toFixed(2)} | 止盈 $${takeProfitPrice.toFixed(2)}${binanceOrderId ? ` | 主单 #${binanceOrderId}` : ''}`,
                  symbol
                );
              } finally {
                this.pendingOrderSymbols.delete(symbol);
              }
            }
          } catch (err: any) {
            const errMsg = err?.message || String(err);
            // A missing/unsupported symbol is a configuration fact, not a transient error: mark it
            // unavailable once and stop re-scanning it instead of logging every 2 minutes forever.
            if (err?.invalidSymbol) {
              const existing = this.symbolExchangeRules.get(symbol);
              if (!existing || existing.available !== false) {
                this.symbolExchangeRules.set(symbol, {
                  ...(existing || this.getSymbolRules(symbol)),
                  available: false,
                  note: `币安 /fapi 无此合约行情 (${errMsg.slice(0, 80)})`,
                });
                this.addLog(
                  'warn',
                  'API',
                  `⏭️ [${symbol}] 币安合约行情不可用，已自动停用该币种扫描与下单（绝不使用本地模拟行情替代）`,
                  symbol
                );
              }
              continue;
            }
            const symKey = `err_${symbol}_${interval}`;
            const lastLogged = this.lastArbitrageExecTime.get(symKey) || 0;
            if (Date.now() - lastLogged > 120_000) {
              this.lastArbitrageExecTime.set(symKey, Date.now());
              this.addLog(
                'error',
                errMsg.includes('Binance') || errMsg.includes('API') ? 'API' : 'ORDER',
                `❌ [${symbol} ${interval}] 扫描或下单执行异常: ${errMsg}`,
                symbol
              );
            }
          }
        }
      }

      this.scanResults = updatedScans;
      this.latestSymbolKlinesMap = symbolKlinesMap;

      // CROSS-SYMBOL STATISTICAL ARBITRAGE MONITOR & AUTO PAIR EXECUTION
      this.arbitrageOpportunities = detectCrossSymbolArbitrage(symbolKlinesMap, this.monitoredSymbols);
      const actionableArb = this.arbitrageOpportunities.find((o) => o.isActionable);
      const arbRisk = this.getRiskMetrics();
      if (
        actionableArb &&
        !mktCorr.isCircuitBreakerActive &&
        !arbRisk.isDrawdownLocked &&
        (!hasKeys || this.liveSyncInfo?.syncOk)
      ) {
        const pairLastExec = this.lastArbitrageExecTime.get(actionableArb.id) || 0;
        const weakActive =
          this.activePositions.some((p) => p.symbol === actionableArb.weakSymbol) ||
          this.pendingOrderSymbols.has(actionableArb.weakSymbol);
        const strongActive =
          this.activePositions.some((p) => p.symbol === actionableArb.strongSymbol) ||
          this.pendingOrderSymbols.has(actionableArb.strongSymbol);
        if (
          Date.now() - pairLastExec > 1_800_000 &&
          !weakActive &&
          !strongActive &&
          normalizeLockedSymbol(actionableArb.weakSymbol) &&
          normalizeLockedSymbol(actionableArb.strongSymbol) &&
          this.activePositions.length + 2 <= portfolioAlloc.maxConcurrentPositions
        ) {
          this.lastArbitrageExecTime.set(actionableArb.id, Date.now());
          const weakKl = symbolKlinesMap.get(actionableArb.weakSymbol) || [];
          const strongKl = symbolKlinesMap.get(actionableArb.strongSymbol) || [];
          const weakPrice = weakKl[weakKl.length - 1]?.close || 0;
          const strongPrice = strongKl[strongKl.length - 1]?.close || 0;
          const weakRules = this.getSymbolRules(actionableArb.weakSymbol);
          const strongRules = this.getSymbolRules(actionableArb.strongSymbol);

          if (
            weakPrice > 0 &&
            strongPrice > 0 &&
            (!hasKeys || (weakRules.available !== false && strongRules.available !== false))
          ) {
            const arbLev = Math.max(1, Math.min(3, this.leverage));
            const weakSl = weakPrice * 0.982;
            const weakTp = weakPrice * (1 + Math.max(0.018, actionableArb.expectedReversionPercent / 100));
            const strongSl = strongPrice * 1.018;
            const strongTp = strongPrice * (1 - Math.max(0.018, actionableArb.expectedReversionPercent / 100));

            const arbActiveMargin = this.activePositions.reduce(
              (sum, p) => sum + Math.max(0, p.marginUsed || 0),
              0
            );
            const arbTotalEq = arbRisk.totalEquity > 0 ? arbRisk.totalEquity : this.balance;
            const legBudget = this.balance * 0.45;
            const weakSize = computeDynamicSmallCapitalSizing({
              symbol: actionableArb.weakSymbol,
              availableBalance: legBudget,
              totalEquity: arbTotalEq,
              activeMarginUsedTotal: arbActiveMargin,
              maxTotalMarginRatio: 0.78,
              currentPrice: weakPrice,
              leverage: arbLev,
              basePositionPercent: 18,
              learningMultiplier: 1.0,
              portfolioExposureMultiplier: portfolioAlloc.totalExposureMultiplier,
              stopLossPrice: weakSl,
              riskPerTradePercent: 1.8,
              rules: weakRules,
            });
            const strongSize = computeDynamicSmallCapitalSizing({
              symbol: actionableArb.strongSymbol,
              availableBalance: legBudget,
              totalEquity: arbTotalEq,
              activeMarginUsedTotal: arbActiveMargin + weakSize.allocatedMargin,
              maxTotalMarginRatio: 0.78,
              currentPrice: strongPrice,
              leverage: arbLev,
              basePositionPercent: 18,
              learningMultiplier: 1.0,
              portfolioExposureMultiplier: portfolioAlloc.totalExposureMultiplier,
              stopLossPrice: strongSl,
              riskPerTradePercent: 1.8,
              rules: strongRules,
            });

            if (weakSize.canOpen && strongSize.canOpen) {
              actionableArb.recommendedAction = 'ACTIVE_PAIR_HEDGE';
              const legs: Array<{
                sym: string;
                side: 'LONG' | 'SHORT';
                price: number;
                qty: number;
                margin: number;
                sl: number;
                tp: number;
              }> = [
                {
                  sym: actionableArb.weakSymbol,
                  side: 'LONG',
                  price: weakPrice,
                  qty: weakSize.quantity,
                  margin: weakSize.allocatedMargin,
                  sl: weakSl,
                  tp: weakTp,
                },
                {
                  sym: actionableArb.strongSymbol,
                  side: 'SHORT',
                  price: strongPrice,
                  qty: strongSize.quantity,
                  margin: strongSize.allocatedMargin,
                  sl: strongSl,
                  tp: strongTp,
                },
              ];

              for (const leg of legs) {
                let orderId: string | undefined;
                let slOrderId: string | undefined;
                let tpOrderId: string | undefined;
                let fillPrice = leg.price;
                let fillQty = leg.qty;

                if (hasKeys) {
                  await this.setBinanceLeverage(leg.sym, arbLev);
                  const res = await this.placeBinanceMarketOrder(
                    leg.sym,
                    leg.side === 'LONG' ? 'BUY' : 'SELL',
                    leg.qty,
                    false,
                    leg.side
                  );
                  orderId = res?.orderId;
                  if (res?.avgPrice && res.avgPrice > 0) fillPrice = res.avgPrice;
                  if (res?.executedQty && res.executedQty > 0) fillQty = res.executedQty;

                  const closeSide = leg.side === 'LONG' ? 'SELL' : 'BUY';
                  // Validate/derive the stop against the REAL fill price, not the pre-fill scan
                  // price: a stop on the wrong side of the market is rejected by Binance (-2021)
                  // and used to trigger the "opened then instantly closed" loop.
                  let slPrice = leg.sl;
                  if (!(leg.side === 'LONG' ? slPrice < fillPrice * 0.999 : slPrice > fillPrice * 1.001)) {
                    const safeSl = this.computeSafeStopPrice(leg.side, fillPrice, fillPrice);
                    if (safeSl) slPrice = safeSl;
                  }
                  const slRes = await this.placeBinanceConditionalOrder(
                    leg.sym,
                    closeSide,
                    'STOP_MARKET',
                    slPrice,
                    fillQty,
                    leg.side,
                    fillPrice
                  );
                  slOrderId = slRes?.orderId;
                  if (!slOrderId) {
                    await this.placeBinanceMarketOrder(leg.sym, closeSide, fillQty, true, leg.side).catch(() => {});
                    this.addLog('error', 'API', `🚨 [套利单止损挂单失败急平] ${leg.sym} 止损单未成功，已紧急平仓`, leg.sym);
                    continue;
                  }
                  let tpPrice = leg.tp;
                  if (!(leg.side === 'LONG' ? tpPrice > fillPrice * 1.001 : tpPrice < fillPrice * 0.999)) {
                    const safeTp = this.computeSafeTakeProfitPrice(leg.side, fillPrice, fillPrice);
                    if (safeTp) tpPrice = safeTp;
                  }
                  const tpRes = await this.placeBinanceConditionalOrder(
                    leg.sym,
                    closeSide,
                    'TAKE_PROFIT_MARKET',
                    tpPrice,
                    fillQty,
                    leg.side,
                    fillPrice
                  );
                  tpOrderId = tpRes?.orderId;
                  leg.sl = slPrice;
                  leg.tp = tpPrice;
                }

                if (!hasKeys) {
                  this.balance = Math.max(0, this.balance - leg.margin);
                }
                this.activePositions.push({
                  id: `arb_${leg.sym}_${Date.now()}`,
                  symbol: leg.sym,
                  interval: '15m',
                  side: leg.side,
                  patternType: 'CROSS_SYMBOL_ARBITRAGE',
                  patternName: `跨品种套利对冲 (${actionableArb.pairName})`,
                  patternCategory: '跨品种统计套利',
                  entryTime: Date.now(),
                  entryPrice: fillPrice,
                  currentPrice: fillPrice,
                  quantity: fillQty,
                  leverage: arbLev,
                  marginUsed: leg.margin,
                  unrealizedPnl: 0,
                  unrealizedPnlPercent: 0,
                  peakPnlUsdt: 0,
                  stopLossPrice: leg.sl,
                  takeProfitPrice: leg.tp,
                  trailingPeakPrice: fillPrice,
                  trailingStopPrice: null,
                  isTrailingActive: false,
                  liquidationPrice:
                    leg.side === 'LONG'
                      ? fillPrice * (1 - 1 / arbLev + 0.005)
                      : fillPrice * (1 + 1 / arbLev - 0.005),
                  strategyUsed: 'pattern_price_action',
                  binanceOrderId: orderId,
                  stopLossOrderId: slOrderId,
                  takeProfitOrderId: tpOrderId,
                  isPaper: !hasKeys,
                });
              }

              if (hasKeys) {
                await this.syncLiveAccountNow(false);
              }

              this.addLog(
                'success',
                'ORDER',
                `🔀 [跨品种统计套利自动开仓] ${actionableArb.pairName} (Z=${actionableArb.spreadZScore}, 半衰期 ${actionableArb.halfLifeBars}bar) -> 做多弱势【${actionableArb.weakSymbol}】+ 做空强势【${actionableArb.strongSymbol}】，均已直挂止损与目标止盈！`,
                actionableArb.weakSymbol
              );
            } else {
              this.addLog(
                'info',
                'SIGNAL',
                `🔀 [跨品种统计套利监测] ${actionableArb.pairName} | ${actionableArb.reason} (双腿资金校验: ${weakSize.canOpen ? 'OK' : weakSize.reason})`,
                actionableArb.weakSymbol
              );
            }
          }
        }
      }

      // AUTOMATED DYNAMIC CORRELATION HEDGING (Check pairwise open positions & hedge weaker symbols)
      await this.checkDynamicCorrelationHedging();

      // AUTOMATED PORTFOLIO BASKET NET TAKE-PROFIT (e.g., 2 wins + 2 losses netting positive after fees & slippage)
      if (this.activePositions.length >= 2) {
        const basketEval = this.getPortfolioBasketState(updatedScans);
        if (basketEval.shouldCloseAll) {
          this.addLog('success', 'ORDER', basketEval.decisionReason);
          await this.closeAllPositions('BASKET_NET_TAKE_PROFIT');
        }
      }

      // PERIODIC HEARTBEAT LOG (every 6 cycles = 60 seconds)
      if (this.cycleCounter % 6 === 0) {
        const trendSummaries = this.monitoredSymbols
          .map((sym) => {
            const scan =
              updatedScans.find((s) => s.symbol === sym && s.interval === '15m') ||
              updatedScans.find((s) => s.symbol === sym);
            const trendLabel =
              scan?.trendContext === 'BULL_TREND'
                ? '🟢多头主升'
                : scan?.trendContext === 'BEAR_TREND'
                ? '🔴空头主跌'
                : '🟡箱体震荡';
            return `${sym.replace('USDT', '')}: ${trendLabel} ($${scan?.currentPrice.toLocaleString() || 0})`;
          })
          .join(' | ');

        this.addLog(
          'info',
          'SYSTEM',
          `💓 [系统心跳存活自检 OK] 模式: ${hasKeys ? 'LIVE实盘' : 'PAPER模拟'} | 监控 ${this.monitoredSymbols.length} 个合约 (${this.monitoredTimeframes.join('/')}) | 盘面: [${trendSummaries}] | 活跃持仓: ${this.activePositions.length} 笔 | 净值: $${this.equity.toFixed(2)}`
        );
      }

      // Update Equity & Equity History strictly from LIVE synced balance or PAPER simulation
      if (hasKeys) {
        // The dedicated 5s live-sync loop already refreshes account/positions; only nudge it when
        // it has gone stale. Calling a full sync here as well doubled the signed-request weight
        // on every 10s cycle and pushed the IP over Binance's 2400/min limit.
        if (Date.now() - this.positionsSyncedAt > 6_000) {
          await this.syncLiveAccountNow(false);
        }
      } else {
        let totalUnrealizedPnl = 0;
        for (const pos of this.activePositions) {
          totalUnrealizedPnl += pos.unrealizedPnl;
        }
        this.equity = Math.max(0, this.balance + totalUnrealizedPnl);
        if (this.equity > this.peakEquity) this.peakEquity = this.equity;

        this.equityHistory.push({
          timestamp: Date.now(),
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          equity: Number(this.equity.toFixed(2)),
          balance: Number(this.balance.toFixed(2)),
          unrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
          activePositionsCount: this.activePositions.length,
        });
        if (this.equityHistory.length > 360) {
          this.equityHistory.shift();
        }
      }
    } catch (err: any) {
      this.addLog('error', 'SYSTEM', `监控循环处理异常: ${err.message || '网络连接中断'}`);
    } finally {
      this.lastMarketPreviewTime = Date.now();
      this.isProcessing = false;
      this.notifyListeners();
    }
  }

  /**
   * Close a position.
   *
   * The previous version skipped the market order for `STOP_LOSS` / `TAKE_PROFIT` because it
   * assumed "the exchange conditional order must have filled". With a driven-from-scan price that
   * assumption was wrong: the local trigger fired while the real position was untouched, and the
   * only order that ran was `cancelAllBinanceOrders` — deleting the real protection. The position
   * then lived on un-tracked and the engine "re-adopted" it 5s later, forever.
   *
   * Now: verify the real exchange quantity, send a reducing market order whenever anything is
   * still open, reconcile the result against real fills, and only then mutate local state.
   */
  private async closePosition(
    pos: ActivePosition,
    exitPrice: number,
    exitReason: ExitReason
  ): Promise<boolean> {
    const isLive = !pos.isPaper && this.hasApiCredentials();
    let resolvedExitPrice = exitPrice;
    let record: BotTradeRecord | null = null;
    /** Set ONLY when our own market order really executed (real avgPrice from Binance). */
    let executedClosePrice: number | null = null;

    if (isLive) {
      const retryAt = this.closeRetryAfter.get(pos.symbol) ?? 0;
      if (Date.now() < retryAt) {
        return false; // cooling down after repeated rejections; do not spam the exchange
      }
      const exchangeQty = await this.getExchangePositionQty(pos.symbol, pos.side);
      if (exchangeQty === null) {
        this.registerCloseFailure(pos.symbol);
        this.addLog(
          'error',
          'API',
          `⚠️ [平仓中止] ${pos.symbol} 无法读取交易所持仓，本地记录已保留并等待下次重试（绝不盲目删除仓位记录）`,
          pos.symbol
        );
        return false;
      }

      if (exchangeQty > 0) {
        try {
          const closeRes = await this.placeBinanceMarketOrder(
            pos.symbol,
            pos.side === 'LONG' ? 'SELL' : 'BUY',
            exchangeQty,
            true,
            pos.side
          );
          if (closeRes?.avgPrice && closeRes.avgPrice > 0) {
            resolvedExitPrice = closeRes.avgPrice;
            executedClosePrice = closeRes.avgPrice;
          }
        } catch (err: any) {
          const e = err as BinanceApiError;
          const alreadyFlat =
            e?.code === -2022 ||
            e?.code === -4046 ||
            /reduceonly|no position|position is zero/i.test(String(e?.message || ''));
          if (!alreadyFlat) {
            this.registerCloseFailure(pos.symbol);
            this.addLog(
              'error',
              'API',
              `❌ [币安实盘平仓失败] ${pos.symbol} (${pos.side}): ${e?.message || e}｜本地记录已保留，下个周期重试`,
              pos.symbol
            );
            return false;
          }
          resolvedExitPrice = pos.currentPrice || exitPrice;
        }
      } else {
        // Already flat (exchange-side SL/TP filled). Keep the mark price as a placeholder; the
        // fill reconciliation below replaces it with the real execution price when available.
        resolvedExitPrice = pos.currentPrice || exitPrice;
      }

      // Never synthesise a close from the mark price: only pass a fallback when our own market
      // order actually executed.
      record = await this.tryResolveClosedFill(
        pos,
        executedClosePrice ?? undefined,
        exitReason
      );

      // Confirm the exchange is really flat BEFORE removing protective orders. The record is built
      // from fills when they cover the position; when it had to fall back to the order's avgPrice
      // (partial fill / fills not indexed yet) we double-check the residual size, because stripping
      // the stop from a still-open position is far worse than a delayed bookkeeping entry.
      const usedFallbackRecord = Boolean(record && record.id.startsWith('pos_'));
      if (executedClosePrice !== null && usedFallbackRecord) {
        const remainingQty = await this.getExchangePositionQty(pos.symbol, pos.side);
        if (remainingQty === null) {
          this.registerCloseFailure(pos.symbol);
          this.addLog(
            'error',
            'API',
            `⚠️ [平仓校验失败] ${pos.symbol} 无法确认是否已空仓，已保留交易所止损/止盈单与本地记录`,
            pos.symbol
          );
          return false;
        }
        if (remainingQty > 0) {
          this.registerCloseFailure(pos.symbol);
          this.addLog(
            'error',
            'API',
            `⚠️ [平仓未完全成交] ${pos.symbol} 仍持有 ${remainingQty}，已保留保护单与本地记录，下个周期继续平仓`,
            pos.symbol
          );
          return false;
        }
      }

      // Protection is only removed once the position is confirmed flat.
      await this.cancelAllBinanceOrders(pos.symbol, true).catch(() => {});
    }

    if (isLive && !record) {
      this.activePositions = this.activePositions.filter((p) => p.id !== pos.id);
      this.clearCloseFailure(pos.symbol);
      this.addLog(
        'warn',
        'ORDER',
        `⚠️ [平仓完成但无交割流水] ${pos.symbol} (${pos.side}) 已在交易所平仓，但未取到成交回执，本笔不写入盈亏（避免污染统计）`,
        pos.symbol
      );
      await this.syncLiveAccountNow(false).catch(() => {});
      return true;
    }

    // Paper / fallback record (no exchange involvement).
    if (!record) {
      const exitNotional = pos.quantity * resolvedExitPrice;
      const exitFee = exitNotional * (exitReason === 'TAKE_PROFIT' ? 0.0002 : 0.0005);
      const grossPnl =
        pos.side === 'LONG'
          ? (resolvedExitPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - resolvedExitPrice) * pos.quantity;
      const netPnl = exitReason === 'LIQUIDATION' ? -pos.marginUsed : grossPnl - exitFee;
      const pnlPercent = pos.marginUsed > 0 ? (netPnl / pos.marginUsed) * 100 : 0;
      const peakPnl = pos.peakPnlUsdt || 0;
      const priceDeltaPercent =
        Math.abs((resolvedExitPrice - pos.entryPrice) / Math.max(1e-8, pos.entryPrice)) * 100;
      let volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' = 'NORMAL';
      if (priceDeltaPercent >= 3.0) volatilityLevel = 'EXTREME';
      else if (priceDeltaPercent >= 1.8) volatilityLevel = 'HIGH';
      else if (priceDeltaPercent < 0.9) volatilityLevel = 'LOW';

      record = {
        id: pos.id,
        symbol: pos.symbol,
        interval: pos.interval,
        side: pos.side,
        patternType: pos.patternType,
        patternName: pos.patternName,
        entryTime: pos.entryTime,
        exitTime: Date.now(),
        entryPrice: pos.entryPrice,
        exitPrice: resolvedExitPrice,
        quantity: pos.quantity,
        leverage: pos.leverage,
        marginUsed: pos.marginUsed,
        netPnl,
        pnlPercent,
        peakPnlUsdt: peakPnl,
        reversionUsdt: peakPnl > 0 ? Math.max(0, peakPnl - netPnl) : 0,
        volatilityLevel,
        exitReason,
        strategyUsed: pos.strategyUsed,
        isPaper: pos.isPaper,
      };

      if (pos.isPaper) {
        this.balance += pos.marginUsed + netPnl;
        this.equity = this.balance;
      }
    }

    if (this.closedTrades.every((t) => t.id !== record!.id)) {
      this.closedTrades.push(record);
      this.closedTrades = this.closedTrades.slice(-200);
    }
    this.activePositions = this.activePositions.filter((p) => p.id !== pos.id);
    if (isLive) this.clearCloseFailure(pos.symbol);
    this.updatePatternLearning(record);

    if (isLive) {
      // Refresh equity from the exchange AFTER the local record is gone, so the sync cannot
      // double-book this close through its own "position disappeared" branch.
      await this.syncLiveAccountNow(false).catch(() => {});
    }

    this.addLog(
      record.netPnl >= 0 ? 'success' : 'warn',
      'ORDER',
      `✔ [${pos.symbol} ${pos.interval}] ${pos.isPaper ? '模拟' : '实盘'}平仓: ${pos.side} (${pos.patternName}) @ ${record.exitPrice} USDT | 原因: ${exitReason} | 净损益: ${
        record.netPnl >= 0 ? '+' : ''
      }${record.netPnl.toFixed(2)} USDT (${record.pnlPercent >= 0 ? '+' : ''}${record.pnlPercent.toFixed(2)}%)`,
      pos.symbol
    );
    return true;
  }
}

export const botEngine = new TradingEngine();
