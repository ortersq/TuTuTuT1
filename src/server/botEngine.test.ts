import test from 'node:test';
import assert from 'node:assert/strict';
import { botEngine } from './botEngine';

test('engine boots in PAPER mode without API keys and exposes a complete status snapshot', () => {
  const status = botEngine.getStatus();
  assert.equal(status.mode, 'PAPER');
  assert.equal(status.hasBinanceKeys, false);
  assert.equal(typeof status.equity, 'number');
  assert.ok(Array.isArray(status.activePositions));
  assert.ok(Array.isArray(status.closedTrades));
  assert.ok(Array.isArray(status.patternLearningStats));
  assert.ok(status.patternLearningStats.length > 0);
  assert.ok(status.riskMetrics && typeof status.riskMetrics.totalEquity === 'number');
});

test('close-all on an empty book is a no-op and does not throw', async () => {
  const res = await botEngine.closeAllPositions('MANUAL_CLOSE_ALL', 0);
  assert.equal(res.closedCount, 0);
  assert.equal(res.netRealizedBeforeClose, 0);
});

test('emergency close of a non-existent symbol reports zero closed / zero failed', async () => {
  const res = await botEngine.emergencyClosePosition('END_OF_DATA', 'BTCUSDT');
  assert.deepEqual(res, { closed: 0, failed: 0 });
});

test('cooldown / drawdown resets do not corrupt risk state', () => {
  botEngine.clearCooldowns();
  botEngine.resetDrawdownLock();
  const metrics = botEngine.getRiskMetrics();
  assert.equal(metrics.isDrawdownLocked, false);
  assert.ok(metrics.drawdownPercent >= 0);
});
