import test from 'node:test';
import assert from 'node:assert/strict';
import { Kline, BacktestConfig } from '../types/trading';
import { calculateSMA, calculateEMA, calculateATR } from './indicators';
import { DEFAULT_STRATEGY_PARAMS, generateAllSignals } from './strategies';
import { runFuturesBacktest } from './backtest';
import { detectAllChartPatterns } from './chartPatterns';

function generateMockKlines(count: number, startPrice: number = 50000): Kline[] {
  const klines: Kline[] = [];
  let price = startPrice;
  const baseTime = 1704067200000;

  for (let i = 0; i < count; i++) {
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

test('Indicators: SMA, EMA & ATR calculations', () => {
  const values = [10, 20, 30, 40, 50];
  const sma3 = calculateSMA(values, 3);
  assert.equal(sma3[2], 20);

  const ema3 = calculateEMA(values, 3);
  assert.equal(ema3[2], 20);

  const klines = generateMockKlines(50);
  const atr = calculateATR(klines, 14);
  assert.ok(atr[13]! > 0);
});

test('Chart Pattern Recognition & Pattern Signals', () => {
  const klines = generateMockKlines(100);
  const patterns = detectAllChartPatterns(klines);
  assert.ok(Array.isArray(patterns));

  const { signals, patternMap } = generateAllSignals(klines, DEFAULT_STRATEGY_PARAMS, 'pattern_price_action');
  assert.equal(signals.length, 100);
  assert.ok(patternMap instanceof Map);
});

test('Price Action & Chart Pattern Engine: Backtest Execution', () => {
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
  assert.equal(result.metrics.initialCapital, 10000);
  assert.equal(typeof result.metrics.finalEquity, 'number');
  assert.equal(result.equityCurve.length, 120);
});
