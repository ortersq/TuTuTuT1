import test from 'node:test';
import assert from 'node:assert/strict';
import { Kline, BacktestConfig } from '../types/trading';
import {
  calculateSMA,
  calculateEMA,
  calculateATR,
  calculateRSI,
  calculateBollingerBands,
  calculateSuperTrend,
  calculateDualThrust,
} from './indicators';
import { DEFAULT_STRATEGY_PARAMS, generateAllSignals } from './strategies';
import { runFuturesBacktest } from './backtest';

// Deterministic mock K-line generator for testing
function generateMockKlines(count: number, startPrice: number = 50000): Kline[] {
  const klines: Kline[] = [];
  let price = startPrice;
  const baseTime = 1704067200000; // 2024-01-01 00:00:00 UTC

  for (let i = 0; i < count; i++) {
    // Generate trending and fluctuating wave
    const trend = Math.sin(i / 15) * 500 + Math.cos(i / 5) * 200;
    const open = price;
    const change = (i % 2 === 0 ? 1 : -1) * 80 + trend * 0.1;
    const close = Math.max(100, open + change);
    const high = Math.max(open, close) + Math.abs(change) * 0.5 + 30;
    const low = Math.min(open, close) - Math.abs(change) * 0.5 - 30;
    const volume = 100 + (i % 7) * 30;

    klines.push({
      timestamp: baseTime + i * 3600000,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume: volume * close,
      tradesCount: 1000 + i * 10,
    });
    price = close;
  }
  return klines;
}

test('Indicators: SMA and EMA calculations', () => {
  const values = [10, 20, 30, 40, 50];
  const sma3 = calculateSMA(values, 3);
  assert.equal(sma3[0], null);
  assert.equal(sma3[1], null);
  assert.equal(sma3[2], 20); // (10+20+30)/3
  assert.equal(sma3[3], 30); // (20+30+40)/3
  assert.equal(sma3[4], 40); // (30+40+50)/3

  const ema3 = calculateEMA(values, 3);
  assert.equal(ema3[2], 20);
  assert.ok(ema3[4] !== null && ema3[4] > 35);
});

test('Indicators: ATR and RSI calculations', () => {
  const klines = generateMockKlines(50);
  const atr = calculateATR(klines, 14);
  assert.equal(atr[0], null);
  assert.ok(atr[13] !== null && atr[13]! > 0);

  const closes = klines.map((k) => k.close);
  const rsi = calculateRSI(closes, 14);
  assert.ok(rsi[14] !== null);
  assert.ok(rsi[14]! >= 0 && rsi[14]! <= 100);
});

test('Indicators: Bollinger Bands & SuperTrend', () => {
  const klines = generateMockKlines(60);
  const closes = klines.map((k) => k.close);
  const bb = calculateBollingerBands(closes, 20, 2);
  assert.ok(bb.middle[19] !== null);
  assert.ok(bb.upper[19]! > bb.middle[19]!);
  assert.ok(bb.lower[19]! < bb.middle[19]!);

  const st = calculateSuperTrend(klines, 10, 3);
  assert.ok(st.trend[20] === 1 || st.trend[20] === -1);
  assert.ok(st.supertrend[20] !== null);
});

test('Strategies: generate signals across strategies', () => {
  const klines = generateMockKlines(80);
  const signals = generateAllSignals(klines, DEFAULT_STRATEGY_PARAMS);
  assert.equal(signals.ensemble.length, 80);
  assert.equal(signals.regimes.length, 80);
  assert.ok(signals.ensembleScore.length === 80);
});

test('Backtest Engine: Risk Management with Stop Loss & Take Profit', () => {
  const klines = generateMockKlines(100);
  const config: BacktestConfig = {
    symbol: 'BTCUSDT',
    interval: '1h',
    initialCapital: 10000,
    risk: {
      slMode: 'PERCENT',
      slPercent: 1.5,
      slAtrMultiplier: 2.0,
      tpMode: 'PERCENT',
      tpPercent: 3.0,
      tpRiskRewardRatio: 2.0,
      useTrailingStop: true,
      trailingCallbackPercent: 1.0,
      sizingMode: 'EQUITY_PERCENT',
      positionSizePercent: 20,
      fixedAmountUSDT: 2000,
      riskPerTradePercent: 1.5,
      leverage: 5,
      maxAllowedDrawdownPercent: 30,
    },
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    slippageRate: 0.0005,
    strategy: 'ensemble',
    params: DEFAULT_STRATEGY_PARAMS,
  };

  const result = runFuturesBacktest(klines, config);
  assert.ok(result.metrics.initialCapital === 10000);
  assert.ok(result.equityCurve.length === 100);
  assert.ok(typeof result.metrics.finalEquity === 'number');
  assert.ok(typeof result.metrics.winRatePercent === 'number');
  assert.ok(result.marketRegimeStats.trendingBarsPercent >= 0);
  assert.ok(result.marketRegimeStats.consolidationBarsPercent >= 0);
});

test('Backtest Engine: ATR-based Risk Parity Position Sizing', () => {
  const klines = generateMockKlines(80);
  const config: BacktestConfig = {
    symbol: 'ETHUSDT',
    interval: '1h',
    initialCapital: 5000,
    risk: {
      slMode: 'ATR',
      slPercent: 2.0,
      slAtrMultiplier: 2.5,
      tpMode: 'RISK_REWARD',
      tpPercent: 4.0,
      tpRiskRewardRatio: 2.0,
      useTrailingStop: false,
      trailingCallbackPercent: 1.0,
      sizingMode: 'RISK_PARITY_ATR',
      positionSizePercent: 25,
      fixedAmountUSDT: 1000,
      riskPerTradePercent: 2.0,
      leverage: 10,
      maxAllowedDrawdownPercent: 25,
    },
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    slippageRate: 0.0005,
    strategy: 'supertrend',
    params: DEFAULT_STRATEGY_PARAMS,
  };

  const result = runFuturesBacktest(klines, config);
  assert.ok(result.metrics.finalEquity > 0);
  assert.ok(result.metrics.maxDrawdownPercent >= 0);
});

test('Price Action & Chart Pattern Engine: Pattern recognition & backtesting', () => {
  const klines = generateMockKlines(120);
  const config: BacktestConfig = {
    symbol: 'BTCUSDT',
    interval: '1h',
    initialCapital: 10000,
    risk: {
      slMode: 'ATR',
      slPercent: 2.0,
      slAtrMultiplier: 2.0,
      tpMode: 'RISK_REWARD',
      tpPercent: 4.0,
      tpRiskRewardRatio: 2.5,
      useTrailingStop: true,
      trailingCallbackPercent: 1.5,
      sizingMode: 'EQUITY_PERCENT',
      positionSizePercent: 25,
      fixedAmountUSDT: 2000,
      riskPerTradePercent: 2.0,
      leverage: 5,
      maxAllowedDrawdownPercent: 25,
    },
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    slippageRate: 0.0005,
    strategy: 'pattern_price_action',
    params: DEFAULT_STRATEGY_PARAMS,
  };

  const result = runFuturesBacktest(klines, config);
  assert.ok(result.metrics.initialCapital === 10000);
  assert.ok(typeof result.metrics.finalEquity === 'number');
  assert.ok(result.equityCurve.length === 120);
});

