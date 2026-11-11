/**
 * Trading types and definitions for Binance Futures multi-strategy lab
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
  | 'ensemble'
  | 'pattern_price_action'
  | 'supertrend'
  | 'dual_thrust'
  | 'bollinger_rsi'
  | 'macd_vpa'
  | 'grid_atr';

export interface StrategyInfo {
  key: StrategyKey;
  name: string;
  authorOrOrigin: string;
  category: '趋势追踪' | '突破策略' | '均值回归' | '动量量价' | '网格对冲' | '综合自适应';
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
  | 'SIGNAL_REVERSAL'
  | 'LIQUIDATION'
  | 'END_OF_DATA';

export type StopLossMode = 'PERCENT' | 'ATR' | 'NONE';
export type TakeProfitMode = 'PERCENT' | 'RISK_REWARD' | 'NONE';
export type PositionSizeMode = 'EQUITY_PERCENT' | 'FIXED_AMOUNT' | 'RISK_PARITY_ATR';

export interface RiskManagementConfig {
  // Stop Loss
  slMode: StopLossMode;
  slPercent: number;          // e.g., 2.5%
  slAtrMultiplier: number;    // e.g., 2.0x ATR

  // Take Profit
  tpMode: TakeProfitMode;
  tpPercent: number;          // e.g., 5.0%
  tpRiskRewardRatio: number;  // e.g., 2.0 (2:1 reward/risk)

  // Trailing Stop
  useTrailingStop: boolean;
  trailingCallbackPercent: number; // e.g., 1.5%

  // Position Sizing
  sizingMode: PositionSizeMode;
  positionSizePercent: number; // e.g., 20% of account equity
  fixedAmountUSDT: number;     // e.g., 2000 USDT
  riskPerTradePercent: number; // e.g., 1.5% capital risked on ATR stop distance

  // Leverage & Safeguard
  leverage: number;            // 1x - 50x
  maxAllowedDrawdownPercent: number; // Circuit breaker, stops trading if drawdown > 25%
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
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

export interface StrategyParams {
  // SuperTrend
  supertrendPeriod: number;
  supertrendMultiplier: number;
  supertrendEmaFilter: number;

  // Dual Thrust
  dualThrustLookback: number;
  dualThrustK1: number;
  dualThrustK2: number;

  // Bollinger + RSI
  bbPeriod: number;
  bbStdDev: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;

  // MACD + VPA
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  volumeMultiplier: number;

  // ATR Grid
  gridLevels: number;
  gridAtrMultiplier: number;

  // Ensemble Weights
  weightSuperTrend: number;
  weightDualThrust: number;
  weightBollingerRsi: number;
  weightMacdVpa: number;
  ensembleThreshold: number;
  enableRegimeFilter: boolean;
}

export interface BacktestConfig {
  symbol: string;
  interval: string;
  initialCapital: number;
  risk: RiskManagementConfig;
  makerFeeRate: number;        // e.g., 0.0002 (0.02%)
  takerFeeRate: number;        // e.g., 0.0005 (0.05%)
  slippageRate: number;        // e.g., 0.0005 (0.05%)
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

  // Risk analytics
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
