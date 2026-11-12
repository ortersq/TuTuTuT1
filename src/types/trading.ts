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
  | 'LIQUIDATION'
  | 'END_OF_DATA';

export type StopLossMode = 'PERCENT' | 'ATR' | 'NONE';
export type TakeProfitMode = 'PERCENT' | 'RISK_REWARD' | 'NONE';
export type PositionSizeMode = 'EQUITY_PERCENT' | 'FIXED_AMOUNT' | 'RISK_PARITY_ATR';

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

  sizingMode: PositionSizeMode;
  positionSizePercent: number;
  fixedAmountUSDT: number;
  riskPerTradePercent: number;

  leverage: number;
  maxAllowedDrawdownPercent: number;
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
