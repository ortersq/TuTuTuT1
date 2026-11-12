import test from 'node:test';
import assert from 'node:assert';
import {
  aggregateHeatmapData,
  calculateHeatmapSummary,
  getOptimalStopLossPrescription,
  VOLATILITY_LEVELS,
} from './heatmapAggregator';
import { BotTradeRecord } from '../server/botEngine';

test('PnL Volatility Heatmap: Matrix Dimensions & Cell Structure', () => {
  const dummyTrades: BotTradeRecord[] = [
    {
      id: 'trade-1',
      symbol: 'BTCUSDT',
      interval: '15m',
      side: 'LONG',
      patternType: 'BROOKS_H2_LONG',
      patternName: 'Al Brooks H2',
      entryTime: new Date('2026-11-11T14:30:00Z').getTime(),
      exitTime: new Date('2026-11-11T15:15:00Z').getTime(),
      entryPrice: 68000,
      exitPrice: 67700,
      quantity: 0.1,
      leverage: 5,
      marginUsed: 1360,
      netPnl: -30,
      pnlPercent: -2.2,
      peakPnlUsdt: 50,
      reversionUsdt: 80,
      volatilityLevel: 'EXTREME',
      exitReason: 'STOP_LOSS',
      strategyUsed: 'pattern_price_action',
      isPaper: false,
    },
  ];

  const matrix = aggregateHeatmapData(dummyTrades, { timezoneOffsetHours: 0 });

  // 4 rows corresponding to 4 Volatility levels
  assert.strictEqual(matrix.length, 4);
  // Each row has 24 hour columns (0 to 23)
  for (const row of matrix) {
    assert.strictEqual(row.length, 24);
  }

  // Row 0 is EXTREME
  assert.strictEqual(matrix[0][0].volatilityLevel, 'EXTREME');
  // Check cell at hour 14
  const cell14Extreme = matrix[0][14];
  assert.strictEqual(cell14Extreme.hour, 14);
  assert.strictEqual(cell14Extreme.volatilityLevel, 'EXTREME');
  assert.strictEqual(cell14Extreme.tradesCount, 1);
  assert.ok(cell14Extreme.reversionSeverityScore > 60, 'Reversion severity score should be high for extreme NY hours');
  assert.ok(cell14Extreme.optimalStopLossPattern.includes('阶梯式保本锁定'));
});

test('PnL Volatility Heatmap: Empty Real Trades Summary Calculation', () => {
  const matrix = aggregateHeatmapData([]);
  const summary = calculateHeatmapSummary(matrix);

  assert.strictEqual(summary.totalAnalyzedTrades, 0);
  assert.strictEqual(summary.totalNetPnl, 0);
  assert.strictEqual(summary.totalReversionUsdt, 0);
  assert.strictEqual(summary.estimatedSalvagedPnlWithBreakevenLock, 0);
});

test('Optimal Stop-Loss Prescriptions: Logic for Extreme vs Low Volatility', () => {
  const extremePrescription = getOptimalStopLossPrescription(14, 'EXTREME', 60);
  assert.ok(extremePrescription.pattern.includes('阶梯式保本锁定'));

  const lowPrescription = getOptimalStopLossPrescription(3, 'LOW', 5);
  assert.ok(lowPrescription.pattern.includes('动能衰竭'));
});
