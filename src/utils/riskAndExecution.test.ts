import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCKED_TARGET_SYMBOLS,
  normalizeLockedSymbol,
  countStepDecimals,
  formatToStep,
  computeDynamicSmallCapitalSizing,
  computeNormalizedMarketCorrelation,
  evaluatePortfolioBasketTakeProfit,
} from './riskAndExecution';

test('LOCKED_TARGET_SYMBOLS locks monitoring strictly to BTC, ETH, XAU, NVDA, CL', () => {
  assert.deepEqual([...LOCKED_TARGET_SYMBOLS], ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'NVDAUSDT', 'CLUSDT']);
  assert.equal(normalizeLockedSymbol('btc'), 'BTCUSDT');
  assert.equal(normalizeLockedSymbol('NVDAUSDT'), 'NVDAUSDT');
  assert.equal(normalizeLockedSymbol('DOGEUSDT'), null);
  assert.equal(normalizeLockedSymbol('SOL'), null);
});

test('countStepDecimals and formatToStep respect Binance stepSize precision', () => {
  assert.equal(countStepDecimals(0.1), 1);
  assert.equal(countStepDecimals(0.001), 3);
  assert.equal(countStepDecimals(1e-5), 5);
  assert.equal(formatToStep(1.2349, 0.001, 'floor'), 1.234);
  assert.equal(formatToStep(71234.56, 0.1, 'round'), 71234.6);
});

test('computeNormalizedMarketCorrelation eliminates 5.5x false circuit-breaker across BTC/ETH/XAU/CL price scales', () => {
  const calmScans = [
    { symbol: 'BTCUSDT', currentPrice: 71000, atr: 355, baselineAtrPercent: 0.005, signal: -1 as const },
    { symbol: 'ETHUSDT', currentPrice: 2200, atr: 11, baselineAtrPercent: 0.005, signal: 0 as const },
    { symbol: 'XAUUSDT', currentPrice: 3000, atr: 12, baselineAtrPercent: 0.004, signal: 0 as const },
    { symbol: 'CLUSDT', currentPrice: 70, atr: 0.7, baselineAtrPercent: 0.01, signal: 0 as const },
  ];

  const metrics = computeNormalizedMarketCorrelation(calmScans, 5);
  assert.equal(metrics.isCircuitBreakerActive, false);
  assert.ok(metrics.avgVolatilityRatio >= 0.9 && metrics.avgVolatilityRatio <= 1.2);
});

test('computeNormalizedMarketCorrelation triggers circuit breaker on synchronized 3x volatility spike', () => {
  const crashScans = [
    { symbol: 'BTCUSDT', currentPrice: 68000, atr: 1020, baselineAtrPercent: 0.005, signal: -1 as const },
    { symbol: 'ETHUSDT', currentPrice: 2000, atr: 32, baselineAtrPercent: 0.005, signal: -1 as const },
    { symbol: 'XAUUSDT', currentPrice: 2950, atr: 36, baselineAtrPercent: 0.004, signal: -1 as const },
  ];

  const metrics = computeNormalizedMarketCorrelation(crashScans, 5);
  assert.equal(metrics.isCircuitBreakerActive, true);
  assert.ok(metrics.avgVolatilityRatio >= 2.5);
  assert.ok(metrics.safeLevelLeverage <= 2);
  assert.ok(metrics.maxAllowedAccountPositions <= 2);
});

test('computeDynamicSmallCapitalSizing adapts to limited capital ($70) on ETHUSDT and respects risk cap', () => {
  const res = computeDynamicSmallCapitalSizing({
    symbol: 'ETHUSDT',
    availableBalance: 70,
    totalEquity: 70,
    currentPrice: 2100,
    leverage: 5,
    basePositionPercent: 20,
    learningMultiplier: 1.0,
    portfolioExposureMultiplier: 1.0,
    stopLossPrice: 2060,
    riskPerTradePercent: 2.0,
    rules: {
      symbol: 'ETHUSDT',
      available: true,
      pricePrecision: 2,
      quantityPrecision: 3,
      tickSize: 0.01,
      stepSize: 0.001,
      minQty: 0.001,
      minNotional: 20,
    },
  });

  assert.equal(res.canOpen, true);
  assert.ok(res.quantity >= 0.01);
  assert.ok(res.notional >= 20);
  assert.ok(res.actualRiskPercent <= 4.5);
});

test('computeDynamicSmallCapitalSizing enforces HARD max single-trade risk ceiling on wide stop-loss ($1000 equity, 2% max risk)', () => {
  const res = computeDynamicSmallCapitalSizing({
    symbol: 'ETHUSDT',
    availableBalance: 1000,
    totalEquity: 1000,
    currentPrice: 2000,
    leverage: 10,
    basePositionPercent: 25, // wants $250 margin = $2500 notional
    learningMultiplier: 1.0,
    portfolioExposureMultiplier: 1.0,
    stopLossPrice: 1920, // 4% stop distance -> $2500 notional would lose $100 (10%)! Must be capped to $500 notional = $20 (2%)!
    riskPerTradePercent: 2.0,
    rules: {
      symbol: 'ETHUSDT',
      available: true,
      pricePrecision: 2,
      quantityPrecision: 3,
      tickSize: 0.01,
      stepSize: 0.001,
      minQty: 0.001,
      minNotional: 20,
    },
  });

  assert.equal(res.canOpen, true);
  assert.ok(res.actualRiskUsd <= 20.5);
  assert.ok(res.actualRiskPercent <= 2.05);
  assert.ok(res.notional <= 505);
});

test('computeDynamicSmallCapitalSizing blocks entry when portfolio margin utilization hits >=78% buffer reserve', () => {
  const res = computeDynamicSmallCapitalSizing({
    symbol: 'ETHUSDT',
    availableBalance: 120,
    totalEquity: 500,
    activeMarginUsedTotal: 389, // 77.8% already used -> remaining budget < $2.50
    maxTotalMarginRatio: 0.78,
    currentPrice: 2000,
    leverage: 5,
    basePositionPercent: 20,
    learningMultiplier: 1.0,
    portfolioExposureMultiplier: 1.0,
    stopLossPrice: 1970,
    riskPerTradePercent: 2.0,
  });

  assert.equal(res.canOpen, false);
  assert.match(res.reason, /保证金占用已接近安全上限/);
});

test('computeDynamicSmallCapitalSizing safely blocks BTCUSDT when $15 capital cannot meet $100 minNotional safely', () => {
  const res = computeDynamicSmallCapitalSizing({
    symbol: 'BTCUSDT',
    availableBalance: 15,
    totalEquity: 15,
    currentPrice: 71000,
    leverage: 1,
    basePositionPercent: 20,
    learningMultiplier: 1.0,
    portfolioExposureMultiplier: 1.0,
    stopLossPrice: 69500,
    rules: {
      symbol: 'BTCUSDT',
      available: true,
      pricePrecision: 1,
      quantityPrecision: 3,
      tickSize: 0.1,
      stepSize: 0.001,
      minQty: 0.001,
      minNotional: 100,
    },
  });

  assert.equal(res.canOpen, false);
});

const calmCorrelation = {
  avgVolatilityRatio: 1.05,
  correlationScore: 0.5,
  isCircuitBreakerActive: false,
  circuitBreakerReason: '正常',
  safeLevelLeverage: 5,
  maxAllowedAccountPositions: 5,
  recommendedAction: '正常',
  lastEvaluatedTime: Date.now(),
};

test('evaluatePortfolioBasketTakeProfit blocks close-all when gross PnL does not cover round-trip fees + slippage', () => {
  // 4 positions (2 wins, 2 losses), total notional ~2000 -> roundTripFees + slippage ~$3.00
  // Gross PnL = +$1.80 -> Net realizable PnL is negative! Must NOT close all!
  const state = evaluatePortfolioBasketTakeProfit({
    positions: [
      { symbol: 'BTCUSDT', interval: '15m', side: 'LONG', entryPrice: 70000, currentPrice: 70250, quantity: 0.01, leverage: 5, marginUsed: 140, unrealizedPnl: 2.5 },
      { symbol: 'ETHUSDT', interval: '15m', side: 'LONG', entryPrice: 2000, currentPrice: 2020, quantity: 0.2, leverage: 5, marginUsed: 80, unrealizedPnl: 4.0 },
      { symbol: 'XAUUSDT', interval: '15m', side: 'LONG', entryPrice: 3000, currentPrice: 2985, quantity: 0.15, leverage: 5, marginUsed: 90, unrealizedPnl: -2.25 },
      { symbol: 'CLUSDT', interval: '15m', side: 'SHORT', entryPrice: 70, currentPrice: 70.49, quantity: 5, leverage: 5, marginUsed: 70, unrealizedPnl: -2.45 },
    ],
    scans: [
      { symbol: 'BTCUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
      { symbol: 'ETHUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
      { symbol: 'XAUUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
      { symbol: 'CLUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
    ],
    marketCorrelation: calmCorrelation,
  });

  assert.equal(state.winningCount, 2);
  assert.equal(state.losingCount, 2);
  assert.ok(state.grossUnrealizedPnl > 0);
  assert.ok(state.netRealizablePnl < 0);
  assert.equal(state.shouldCloseAll, false);
  assert.match(state.decisionReason, /不足覆盖双边手续费/);
});

test('evaluatePortfolioBasketTakeProfit auto-closes all in RANGE_BOUND when 2W/2L basket net profit clears fees & target', () => {
  const state = evaluatePortfolioBasketTakeProfit({
    positions: [
      { symbol: 'BTCUSDT', interval: '15m', side: 'LONG', entryPrice: 70000, currentPrice: 71000, quantity: 0.01, leverage: 5, marginUsed: 140, unrealizedPnl: 10.0 },
      { symbol: 'ETHUSDT', interval: '15m', side: 'LONG', entryPrice: 2000, currentPrice: 2040, quantity: 0.25, leverage: 5, marginUsed: 100, unrealizedPnl: 10.0 },
      { symbol: 'XAUUSDT', interval: '15m', side: 'LONG', entryPrice: 3000, currentPrice: 2980, quantity: 0.15, leverage: 5, marginUsed: 90, unrealizedPnl: -3.0 },
      { symbol: 'CLUSDT', interval: '15m', side: 'SHORT', entryPrice: 70, currentPrice: 70.5, quantity: 4, leverage: 5, marginUsed: 56, unrealizedPnl: -2.0 },
    ],
    scans: [
      { symbol: 'BTCUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
      { symbol: 'ETHUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
      { symbol: 'XAUUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
      { symbol: 'CLUSDT', interval: '15m', trendContext: 'RANGE_BOUND', signal: 0 },
    ],
    marketCorrelation: calmCorrelation,
  });

  assert.equal(state.shouldCloseAll, true);
  assert.equal(state.regimeAssessment, 'RANGE_LOCK');
  assert.ok(state.netRealizablePnl > 10);
});

test('evaluatePortfolioBasketTakeProfit holds winners in BULL_TREND and triggers TREND_TRAILING_EXIT on 30% pullback', () => {
  const positions = [
    { symbol: 'BTCUSDT', interval: '15m', side: 'LONG' as const, entryPrice: 70000, currentPrice: 71500, quantity: 0.01, leverage: 5, marginUsed: 140, unrealizedPnl: 15.0 },
    { symbol: 'ETHUSDT', interval: '15m', side: 'LONG' as const, entryPrice: 2000, currentPrice: 2050, quantity: 0.25, leverage: 5, marginUsed: 100, unrealizedPnl: 12.5 },
    { symbol: 'XAUUSDT', interval: '15m', side: 'LONG' as const, entryPrice: 3000, currentPrice: 2980, quantity: 0.15, leverage: 5, marginUsed: 90, unrealizedPnl: -3.0 },
    { symbol: 'CLUSDT', interval: '15m', side: 'SHORT' as const, entryPrice: 70, currentPrice: 70.5, quantity: 4, leverage: 5, marginUsed: 56, unrealizedPnl: -2.0 },
  ];
  const bullScans = [
    { symbol: 'BTCUSDT', interval: '15m', trendContext: 'BULL_TREND' as const, signal: 0 as const },
    { symbol: 'ETHUSDT', interval: '15m', trendContext: 'BULL_TREND' as const, signal: 0 as const },
    { symbol: 'XAUUSDT', interval: '15m', trendContext: 'RANGE_BOUND' as const, signal: 0 as const },
    { symbol: 'CLUSDT', interval: '15m', trendContext: 'RANGE_BOUND' as const, signal: 0 as const },
  ];

  const holdState = evaluatePortfolioBasketTakeProfit({
    positions,
    scans: bullScans,
    marketCorrelation: calmCorrelation,
    previousPeakNetPnl: 0,
  });
  assert.equal(holdState.shouldCloseAll, false);
  assert.equal(holdState.regimeAssessment, 'TREND_HOLD');
  assert.equal(holdState.isTrailingActive, true);

  // Now simulate basket net profit pulled back >= 30% from a peak of $35 down to ~$19.6
  const exitState = evaluatePortfolioBasketTakeProfit({
    positions,
    scans: bullScans,
    marketCorrelation: calmCorrelation,
    previousPeakNetPnl: 35,
  });
  assert.equal(exitState.shouldCloseAll, true);
  assert.equal(exitState.regimeAssessment, 'TREND_TRAILING_EXIT');
});

