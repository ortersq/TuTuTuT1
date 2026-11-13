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

test('resetJournal clears logs, journal and learning, and records a cut-off timestamp', () => {
  const before = botEngine.getStatus();
  assert.ok(before.logs.length > 0, 'engine should have boot logs before reset');

  const result = botEngine.resetJournal({
    clearLogs: true,
    clearTrades: true,
    resetLearning: true,
  });

  assert.ok(result.clearedLogs > 0);
  assert.ok(result.cutoverAt > 0);

  const after = botEngine.getStatus();
  assert.equal(after.closedTrades.length, 0);
  assert.equal(after.smartExecutionLogs.length, 0);
  assert.equal(after.correlationHedgingLogs.length, 0);
  assert.equal(after.learningGeneration, 1);
  assert.equal(after.equityHistory.length, 1);
  // Only the confirmation line remains in the console.
  assert.equal(after.logs.length, 1);
  assert.match(after.logs[0].message, /账本重置完成/);
  // Paper equity basis is re-anchored instead of being reported as a 99% drawdown.
  assert.equal(after.peakEquity, after.equity);
});

test('clearing only the log console keeps trades and learning untouched', () => {
  const genBefore = botEngine.getStatus().learningGeneration;
  const res = botEngine.resetJournal({
    clearLogs: true,
    clearTrades: false,
    resetLearning: false,
    silent: true,
  });
  assert.ok(res.clearedTrades === 0);
  assert.equal(botEngine.getStatus().learningGeneration, genBefore);
  // Silent mode must leave a completely empty console.
  assert.equal(botEngine.getStatus().logs.length, 0);
});
