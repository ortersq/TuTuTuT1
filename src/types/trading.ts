/**
 * Trading types and definitions for Binance Futures Chart Pattern Quant System
 */

export interface Kline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  tradesCount: number;
}

export interface DataSourceAudit {
  isRealData: true;
  endpointUrl: string;
  symbol: string;
  interval: string;
  candleCount: number;
  latencyMs: number;
  fetchTime: number;
  firstCandleIso: string;
  lastCandleIso: string;
  firstPrice: number;
  lastPrice: number;
  highestPrice: number;
  lowestPrice: number;
  totalTradesRecorded: number;
  rawSample: any[];
}

export type StrategyKey =
  | 'pattern_price_action'
  | 'wyckoff_spring_utad'
  | 'brooks_h2_l2'
  | 'flag_breakout'
  | 'double_top_bottom';

export interface StrategyInfo {
  key: StrategyKey;
  name: string;
  authorOrOrigin: string;
  category: '全形态自优' | '流动性猎杀' | '回踩二次确认' | '顺势突破' | '经典几何反转';
  summary: string;
  description: string;
  pros: string[];
  cons: string[];
  bestMarketCondition: string;
}

export type PositionSide = 'LONG' | 'SHORT' | 'NONE';

export type ExitReason =
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'TRAILING_STOP'
  | 'PROFIT_PROTECT_EXIT'
  | 'SIGNAL_REVERSAL'
  | 'PATTERN_INVALIDATED'
  | 'MOMENTUM_DECAY_TIMEOUT'
  | 'BREAKEVEN_STOP'
  | 'BASKET_NET_TAKE_PROFIT'
  | 'MANUAL_CLOSE_ALL'
  | 'LIQUIDATION'
  | 'END_OF_DATA';

export type StopLossMode = 'PERCENT' | 'ATR' | 'NONE';
export type TakeProfitMode = 'PERCENT' | 'RISK_REWARD' | 'NONE';
export type PositionSizeMode = 'EQUITY_PERCENT' | 'FIXED_AMOUNT' | 'RISK_PARITY_ATR';

export interface NotificationConfig {
  enableEmergencyAlerts: boolean;
  /** Master switch for the Telegram transport (emergency + trade alerts). */
  telegramEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  /** Push every open/close fill to Telegram. */
  tradeAlertsEnabled?: boolean;
  /** Push stop-loss / take-profit changes (breakeven, trailing ratchet, re-attach). */
  protectionAlertsEnabled?: boolean;
  webhookUrl?: string;
  lastAlertTimestamp?: number;
}

/** Secret-free view of the notification config, safe to expose to the browser. */
export interface NotificationStatus {
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  tradeAlertsEnabled: boolean;
  protectionAlertsEnabled: boolean;
  emergencyAlertsEnabled: boolean;
  /** Masked token, e.g. `1234••••abcd`. Never the raw secret. */
  botTokenHint: string;
  chatId: string;
  webhookConfigured: boolean;
  lastAlertTimestamp?: number;
}

export interface RiskManagementConfig {
  slMode: StopLossMode;
  slPercent: number;
  slAtrMultiplier: number;

  tpMode: TakeProfitMode;
  tpPercent: number;
  tpRiskRewardRatio: number;

  useTrailingStop: boolean;
  trailingActivationPercent?: number;
  trailingCallbackPercent: number;
  trailingStepPercent?: number;
  trailingActivationUsdt?: number;

  autoBreakevenEnabled?: boolean;
  autoBreakevenDynamicPercent?: number;
  autoBreakevenUsdt?: number;
  notification?: NotificationConfig;
  portfolioBasket?: PortfolioBasketConfig;

  sizingMode: PositionSizeMode;
  positionSizePercent: number;
  fixedAmountUSDT: number;
  riskPerTradePercent: number;

  leverage: number;
  maxAllowedDrawdownPercent: number;

  /**
   * Minutes to wait before the same symbol may be re-opened after a close.
   * Prevents "close → same signal re-fires on the next scan → re-open" churn.
   */
  symbolReentryCooldownMinutes?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  patternName?: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  initialSlPrice: number;
  initialTpPrice: number;
  grossPnl: number;
  netPnl: number;
  pnlPercent: number;
  totalFee: number;
  exitReason: ExitReason;
  holdingBars: number;
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  cash: number;
  benchmarkEquity: number;
  drawdown: number;
  positionSide: PositionSide;
  unrealizedPnl: number;
  price: number;
}

export interface LiveEquityPoint {
  timestamp: number;
  time: string;
  equity: number;
  balance: number;
  unrealizedPnl: number;
  activePositionsCount: number;
}

export interface ServerSystemMetrics {
  cpuUsagePercent: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  usedMemoryMb: number;
  memoryUsagePercent: number;
  processHeapUsedMb: number;
  uptimeSeconds: number;
}

export interface PatternTimeframeStat {
  timeframe: string;
  weight: number;
  winRate: number;
  totalTrades: number;
  wins: number;
}

export interface PatternSessionStat {
  sessionKey: 'ASIA' | 'EUROPE' | 'US' | 'OVERNIGHT';
  sessionName: string;
  weight: number;
  winRate: number;
  totalTrades: number;
  wins: number;
}

export type MarketVolatilityRegime =
  | 'LOW_VOLATILITY_CHOP'
  | 'NORMAL_TRENDING'
  | 'HIGH_VOLATILITY_BREAKOUT'
  | 'EXTREME_VOLATILITY_SPIKE';

export interface TimeframeRankingItem {
  timeframe: string;
  rank: number;
  totalTrades: number;
  wins: number;
  winRate: number;
  avgPnlUsdt: number;
  totalNetPnlUsdt: number;
  volatilitySuitabilityScore: number;
  isRecommended: boolean;
  regimeFitDescription: string;
}

export interface TimeframeDiagnosticReport {
  currentRegime: MarketVolatilityRegime;
  regimeName: string;
  regimeDescription: string;
  volatilityIndexRatio: number;
  recommendedTimeframe: string;
  recommendationReason: string;
  rankings: TimeframeRankingItem[];
}

export interface PatternLearningItem {
  patternType: string;
  patternName: string;
  weight: number;
  confidenceScore: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnlUsdt: number;
  totalNetPnlUsdt: number;
  qualityScoreBoost: number;
  adaptiveSizingMultiplier: number;
  timeframeStats: PatternTimeframeStat[];
  sessionStats: PatternSessionStat[];
  bestTimeframe: string;
  bestSession: string;
  status: 'OPTIMAL_HIGH_CONVICTION' | 'LEARNING_ACTIVE' | 'DECAY_PRUNED';
  lastUpdated: number;
}

export interface SymbolRiskControlItem {
  symbol: string;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winRate: number;
  riskLevel: 'SAFE_NORMAL' | 'WARNING_REDUCE_LEVERAGE' | 'CRITICAL_CAP_POSITIONS';
  effectiveLeverage: number;
  maxAllowedPositions: number;
  actionDescription: string;
}

export interface ParameterContributionCell {
  emaFast: number;
  emaSlow: number;
  winRate: number;
  profitFactor: number;
  simulatedTradesCount: number;
  sharpeRatio: number;
  isOptimal: boolean;
}

export interface GeneticGenome {
  id: string;
  emaFast: number;
  emaSlow: number;
  atrMult: number;
  qualityThreshold: number;
  trailingCallback: number;
  fitnessScore: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface GeneticOptimizerResult {
  generationCount: number;
  bestGenome: GeneticGenome;
  population: GeneticGenome[];
  parameterHeatmap: ParameterContributionCell[];
  evolutionProgressLog: string[];
  lastOptimizedTime: number;
}

export interface MarketCorrelationMetrics {
  avgVolatilityRatio: number;
  correlationScore: number;
  isCircuitBreakerActive: boolean;
  circuitBreakerReason: string;
  safeLevelLeverage: number;
  maxAllowedAccountPositions: number;
  recommendedAction: string;
  lastEvaluatedTime: number;
}

export interface SymbolSensitivityRLState {
  symbol: string;
  sensitivityScore: number;
  qualityScoreThreshold: number;
  atrMultiplier: number;
  rlGeneration: number;
  sharpeRatio: number;
  winRate: number;
  maxDrawdown: number;
  rlAction: 'ELEVATE_SENSITIVITY' | 'MAINTAIN' | 'RESTRICT_SENSITIVITY';
  statusDescription: string;
  lastUpdated: number;
}

export interface SmartExecutionResult {
  symbol: string;
  side: 'BUY' | 'SELL';
  executionAlgorithm: 'MARKET_DIRECT' | 'ICEBERG_LIMIT_SLICING' | 'TWAP_HEDGING';
  volumeRatio: number;
  estimatedSlippageBps: number;
  slicesCount: number;
  executionReason: string;
  timestamp: number;
}

export interface CorrelationHedgingState {
  pairName: string;
  correlationCoefficient: number;
  symbolA: string;
  symbolB: string;
  weakerSymbol: string;
  actionTaken: string;
  hedgedQuantityPercent: number;
  timestamp: number;
}

export type VolatilityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

export interface HeatmapSampleTrade {
  id: string;
  symbol: string;
  interval: string;
  side: 'LONG' | 'SHORT';
  patternName: string;
  entryPrice: number;
  exitPrice: number;
  netPnl: number;
  peakPnl: number;
  reversionUsdt: number;
  exitReason: string;
  exitTime: number;
}

export interface HeatmapCellData {
  hour: number;
  volatilityLevel: VolatilityLevel;
  tradesCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalNetPnl: number;
  avgNetPnl: number;
  avgPeakPnl: number;
  avgReversion: number;
  reversionSeverityScore: number;
  optimalStopLossPattern: string;
  optimalStopLossDetails: string;
  dominantExitReason: string;
  sampleTrades: HeatmapSampleTrade[];
}

export interface StrategyParams {
  minPatternQuality: number;
  minHistoricalWinRate: number;
  usePatternStructuralSlTp: boolean;
}

export interface BacktestConfig {
  symbol: string;
  interval: string;
  initialCapital: number;
  risk: RiskManagementConfig;
  makerFeeRate: number;
  takerFeeRate: number;
  slippageRate: number;
  strategy: StrategyKey;
  params: StrategyParams;
}

export interface BacktestMetrics {
  initialCapital: number;
  finalEquity: number;
  netProfit: number;
  totalReturnPercent: number;
  cagrPercent: number;
  benchmarkReturnPercent: number;
  alphaPercent: number;

  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  profitFactor: number;

  longTrades: number;
  longWinRatePercent: number;
  shortTrades: number;
  shortWinRatePercent: number;

  avgTradeReturnPercent: number;
  avgWin: number;
  avgLoss: number;
  winLossRatio: number;
  maxConsecutiveLosses: number;

  maxDrawdownPercent: number;
  maxDrawdownDurationDays: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;

  totalFeesPaid: number;
  liquidationsCount: number;

  slTriggersCount: number;
  tpTriggersCount: number;
  trailingTriggersCount: number;
  avgHoldingBars: number;
  largestWinningTradePercent: number;
  largestLosingTradePercent: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  metrics: BacktestMetrics;
  trades: Trade[];
  equityCurve: EquityPoint[];
  klines: Kline[];
  marketRegimeStats: {
    trendingBarsPercent: number;
    consolidationBarsPercent: number;
  };
  audit?: DataSourceAudit;
}

export type StrategyScreenerGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface StrategyScreenerItem {
  strategyKey: StrategyKey | string;
  strategyName: string;
  category: string;
  tradesCount7d: number;
  wins7d: number;
  losses7d: number;
  winRatePercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  totalNetPnlUsdt: number;
  score: number;
  grade: StrategyScreenerGrade;
  status: 'ACTIVE_ELITE' | 'ACTIVE_PASS' | 'ELIMINATED_BELOW_C';
  reason: string;
}

export interface AiPnlForecastPoint {
  hourOffset: number;
  timeLabel: string;
  predictedCumulativePnl: number;
  optimisticPnl: number;
  pessimisticPnl: number;
}

export interface AiPnlForecastResult {
  generatedAt: number;
  expected24hPnlUsdt: number;
  expected24hReturnPercent: number;
  confidencePercent: number;
  projectedWinRatePercent: number;
  regimeLabel: string;
  trajectoryPoints: AiPnlForecastPoint[];
  adjustmentSuggestions: {
    title: string;
    detail: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
}

export interface ArbitrageOpportunity {
  id: string;
  pairName: string;
  symbolA: string;
  symbolB: string;
  strongSymbol: string;
  weakSymbol: string;
  correlation: number;
  spreadZScore: number;
  halfLifeBars: number;
  reversionSpeedLabel: string;
  optimalEntryZScore: number;
  expectedReversionPercent: number;
  recommendedAction: 'LONG_WEAK_SHORT_STRONG' | 'MONITORING' | 'ACTIVE_PAIR_HEDGE';
  reason: string;
  isActionable: boolean;
  timestamp: number;
}

export interface PortfolioWeightItem {
  symbol: string;
  targetWeightPercent: number;
  volatilityPct: number;
  regimeRole: 'CORE_LEADER' | 'DEFENSIVE_HEDGE' | 'ALPHA_SATELLITE';
  sizingMultiplier: number;
}

export interface PortfolioAllocationState {
  vixLikeIndex: number;
  volatilityRegime: 'EXTREME_DEFENSE' | 'HIGH_CAUTION' | 'NORMAL_BALANCED' | 'LOW_VOL_EXPANSION';
  totalExposureMultiplier: number;
  maxConcurrentPositions: number;
  coverageDescription: string;
  weights: PortfolioWeightItem[];
  lastUpdated: number;
}

export interface SymbolExchangeRules {
  symbol: string;
  available: boolean;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
  note?: string;
}

export interface LiveAccountSyncInfo {
  syncedAt: number;
  syncOk: boolean;
  errorMessage?: string;
  walletBalance: number;
  availableBalance: number;
  marginBalance: number;
  unrealizedProfit: number;
  positionInitialMargin?: number;
  openPositionsCount?: number;
  equitySource?: 'BINANCE_LIVE_API' | 'PAPER_SIMULATION';
  /** True only when the last /fapi/v2/positionRisk snapshot was authoritative. */
  positionsOk?: boolean;
  /** Timestamp of the last authoritative position snapshot (may be older than syncedAt). */
  positionsSyncedAt?: number;
  /** Binance-reported IP request weight used in the current minute (X-MBX-USED-WEIGHT-1M). */
  usedWeight1m?: number;
  /** Epoch ms until which all exchange requests are paused after a 429/418/-1003. */
  rateLimitedUntil?: number;
}

export interface PortfolioBasketConfig {
  enabled: boolean;
  minNetProfitPercent: number;
  minNetProfitUsdt: number;
  takerFeeRate: number;
  slippageBufferRate: number;
  trailingRetracePercent: number;
  cooldownMinutes: number;
}

export interface PortfolioBasketState {
  enabled: boolean;
  positionsCount: number;
  winningCount: number;
  losingCount: number;
  totalMarginUsed: number;
  totalNotional: number;
  grossUnrealizedPnl: number;
  estimatedRoundTripFees: number;
  estimatedSlippageBuffer: number;
  netRealizablePnl: number;
  netReturnOnMarginPercent: number;
  peakNetRealizablePnl: number;
  isTrailingActive: boolean;
  regimeAssessment: 'RANGE_LOCK' | 'TREND_HOLD' | 'TREND_TRAILING_EXIT' | 'RISK_DEFENSE_EXIT' | 'NO_ACTION';
  shouldCloseAll: boolean;
  decisionReason: string;
  cooldownActiveUntil: number | null;
  lastEvaluatedAt: number;
}

export interface LiveAccountRiskMetrics {
  totalEquity: number;
  walletBalance: number;
  availableBalance: number;
  totalMarginUsed: number;
  marginUtilizationPercent: number;
  freeMarginBufferPercent: number;
  totalUnrealizedPnl: number;
  drawdownPercent: number;
  maxAllowedDrawdownPercent: number;
  isDrawdownLocked: boolean;
  isHedgeMode: boolean;
  riskPerTradePercent: number;
  maxSingleTradeRiskUsdt: number;
  lockedSymbols: string[];
  dataSource: 'BINANCE_LIVE_API' | 'PAPER_SIMULATION';
}

export interface MarketTickerSnapshot {
  symbol: string;
  price: number;
  change24hPercent: number;
  updatedAt: number;
  source?: string;
}



