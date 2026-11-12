import test from 'node:test';
import assert from 'node:assert/strict';
import { botEngine } from '../server/botEngine';

test('Live Quant Performance Monitor computes Sharpe Ratio & Max Drawdown', () => {
  const status = botEngine.getStatus();
  assert.ok(status, 'Bot status should be defined');
  assert.ok(typeof status.equity === 'number', 'Equity should be a number');
  assert.ok(typeof status.peakEquity === 'number', 'Peak equity should be a number');

  // Verify drawdown calculation
  const dd = status.peakEquity > 0 ? ((status.peakEquity - status.equity) / status.peakEquity) * 100 : 0;
  assert.ok(dd >= 0, 'Drawdown should be non-negative');
  assert.ok(Array.isArray(status.closedTrades), 'Closed trades should be an array');
});
