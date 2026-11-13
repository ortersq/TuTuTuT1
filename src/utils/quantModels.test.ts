import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate7dStrategyScreener,
  predict24hPnlModel,
  detectCrossSymbolArbitrage,
  computeDynamicPortfolioWeights,
} from './quantModels';
import { runGeneticOptimizer } from './geneticOptimizer';
import { aggregateHeatmapData } from './heatmapAggregator';
import { Kline } from '../types/trading';

test('evaluate7dStrategyScreener scores strategies A-F and eliminates < C strategies automatically', () => {
  const now = Date.now();
  const trades = [
    // 4 winning wyckoff trades -> should pass A/B
    ...[1, 2, 3, 4].map((i) => ({
      id: `w_${i}`,
      symbol: 'BTCUSDT',
      interval: '15m',
      side: 'LONG' as const,
      patternType: 'WYCKOFF_SPRING',
      patternName: 'Wyckoff Spring',
      entryTime: now - i * 3600_000 - 600_000,
      exitTime: now - i * 3600_000,
      entryPrice: 70000,
      exitPrice: 71000,
      marginUsed: 100,
      netPnl: 28,
      pnlPercent: 28,
      strategyUsed: 'wyckoff_spring_utad',
      isPaper: false,
    })),
    // 4 losing flag_breakout trades -> should get D/F and ELIMINATED_BELOW_C
    ...[1, 2, 3, 4].map((i) => ({
      id: `f_${i}`,
      symbol: 'ETHUSDT',
      interval: '15m',
      side: 'SHORT' as const,
      patternType: 'BEAR_FLAG',
      patternName: 'Bear Flag',
      entryTime: now - i * 3600_000 - 600_000,
      exitTime: now - i * 3600_000,
      entryPrice: 2200,
      exitPrice: 2240,
      marginUsed: 100,
      netPnl: -25,
      pnlPercent: -25,
      strategyUsed: 'flag_breakout',
      isPaper: false,
    })),
  ];

  const screener = evaluate7dStrategyScreener(trades, now);
  const wyckoff = screener.find((s) => s.strategyKey === 'wyckoff_spring_utad');
  const flag = screener.find((s) => s.strategyKey === 'flag_breakout');

  assert.ok(wyckoff);
  assert.ok(['A', 'B'].includes(wyckoff.grade));
  assert.notEqual(wyckoff.status, 'ELIMINATED_BELOW_C');

  assert.ok(flag);
  assert.ok(['D', 'F'].includes(flag.grade));
  assert.equal(flag.status, 'ELIMINATED_BELOW_C');
});

test('predict24hPnlModel builds 7 horizons with confidence bands and actionable suggestions', () => {
  const now = Date.now();
  const trades = [12, 18, -5, 15, 22].map((pnl, idx) => ({
    id: `t_${idx}`,
    symbol: 'ETHUSDT',
    interval: '15m',
    side: 'LONG' as const,
    patternType: 'BROOKS_H2_LONG',
    patternName: 'Brooks H2',
    entryTime: now - (idx + 2) * 3600_000,
    exitTime: now - (idx + 1) * 3600_000,
    entryPrice: 2100,
    exitPrice: 2130,
    marginUsed: 100,
    netPnl: pnl,
    pnlPercent: pnl,
    strategyUsed: 'brooks_h2_l2',
    isPaper: false,
  }));

  const forecast = predict24hPnlModel(trades, [], 150, 2, now);
  assert.equal(forecast.trajectoryPoints.length, 7);
  for (const pt of forecast.trajectoryPoints) {
    assert.ok(pt.optimisticPnl >= pt.predictedCumulativePnl);
    assert.ok(pt.predictedCumulativePnl >= pt.pessimisticPnl);
  }
  assert.ok(forecast.adjustmentSuggestions.length >= 1);
});

test('detectCrossSymbolArbitrage detects correlated divergence Z-score and AR(1) half-life', () => {
  const klA: Kline[] = [];
  const klB: Kline[] = [];
  for (let i = 0; i < 48; i++) {
    const baseTime = 1700000000000 + i * 900_000;
    const wave = Math.sin(i * 0.35) * 0.015;
    // Both co-move tightly until last 2 bars where symbol A spikes +6% vs symbol B -2%
    const pA = 70000 * (1 + wave + (i >= 46 ? 0.06 : 0));
    const pB = 2100 * (1 + wave + (i >= 46 ? -0.02 : 0));
    klA.push({ timestamp: baseTime, open: pA, high: pA * 1.003, low: pA * 0.997, close: pA, volume: 100, quoteVolume: 100, tradesCount: 10 });
    klB.push({ timestamp: baseTime, open: pB, high: pB * 1.003, low: pB * 0.997, close: pB, volume: 100, quoteVolume: 100, tradesCount: 10 });
  }
  const map = new Map<string, Kline[]>([
    ['BTCUSDT', klA],
    ['ETHUSDT', klB],
  ]);

  const opps = detectCrossSymbolArbitrage(map, ['BTCUSDT', 'ETHUSDT']);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].strongSymbol, 'BTCUSDT');
  assert.equal(opps[0].weakSymbol, 'ETHUSDT');
  assert.equal(opps[0].isActionable, true);
  assert.equal(opps[0].recommendedAction, 'LONG_WEAK_SHORT_STRONG');
});

test('computeDynamicPortfolioWeights scales down exposure in high VIX and widens in low VIX', () => {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'NVDAUSDT', 'CLUSDT'];
  const highVolScans = symbols.map((sym) => ({
    symbol: sym,
    interval: '15m',
    currentPrice: 1000,
    atr: 9.5, // ~0.95% 15m ATR -> high VIX > 75
    trendContext: 'BEAR_TREND' as const,
  }));
  const extremeState = computeDynamicPortfolioWeights(highVolScans, symbols);
  assert.equal(extremeState.volatilityRegime, 'EXTREME_DEFENSE');
  assert.equal(extremeState.totalExposureMultiplier, 0.45);
  const weightSum = extremeState.weights.reduce((s, w) => s + w.targetWeightPercent, 0);
  assert.ok(Math.abs(weightSum - 100) <= 1.0);

  const lowVolScans = symbols.map((sym) => ({
    symbol: sym,
    interval: '15m',
    currentPrice: 1000,
    atr: 2.0, // low VIX < 30
    trendContext: 'RANGE_BOUND' as const,
  }));
  const lowState = computeDynamicPortfolioWeights(lowVolScans, symbols);
  assert.equal(lowState.volatilityRegime, 'LOW_VOL_EXPANSION');
  assert.equal(lowState.totalExposureMultiplier, 1.15);
});

test('runGeneticOptimizer([]) and aggregateHeatmapData([]) never crash (Heatmap black-screen regression test)', () => {
  const ga = runGeneticOptimizer([]);
  assert.ok(ga.bestGenome);
  assert.equal(ga.parameterHeatmap.length, 25);

  const grid = aggregateHeatmapData([], { symbol: 'ALL', interval: 'ALL', timezoneOffsetHours: 0 });
  assert.equal(grid.length, 4);
  assert.equal(grid[0].length, 24);
});
