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

test('telegram config is masked: the raw bot token never reaches the browser payload', () => {
  const rawToken = '123456789:AAHabcdefghijklmnopqrstuvwxyz012345';
  botEngine.setNotificationConfig({
    telegramBotToken: rawToken,
    telegramChatId: '-1001234567890',
    telegramEnabled: true,
    tradeAlertsEnabled: true,
  });

  const status = botEngine.getStatus();
  assert.equal(status.notificationStatus.telegramConfigured, true);
  assert.equal(status.notificationStatus.chatId, '-1001234567890');
  assert.ok(status.notificationStatus.botTokenHint.includes('••••'));
  // Neither the status field nor riskConfig may contain the secret.
  assert.equal(JSON.stringify(status).includes('AAHabcdefghijklmnop'), false);
  assert.equal(String(status.riskConfig.notification?.telegramBotToken || '').includes('AAHabcdefghij'), false);

  // Re-submitting the masked hint must not overwrite the stored token.
  botEngine.setNotificationConfig({ telegramBotToken: status.notificationStatus.botTokenHint });
  assert.equal(botEngine.getStatus().notificationStatus.telegramConfigured, true);
});

test('telegram test without credentials fails fast with an actionable message', async () => {
  botEngine.setNotificationConfig({ telegramBotToken: '', telegramChatId: '' });
  const result = await botEngine.sendTelegramTest();
  assert.equal(result.success, false);
  assert.match(result.message, /请先填写/);
});

test('stop-loss / take-profit alert toggle is persisted in the public status', () => {
  botEngine.setNotificationConfig({
    telegramBotToken: '123456789:AAHabcdefghijklmnopqrstuvwxyz012345',
    telegramChatId: '123456789',
    protectionAlertsEnabled: false,
  });
  assert.equal(botEngine.getStatus().notificationStatus.protectionAlertsEnabled, false);

  botEngine.setNotificationConfig({ protectionAlertsEnabled: true });
  assert.equal(botEngine.getStatus().notificationStatus.protectionAlertsEnabled, true);

  // Default is ON so existing installs keep receiving SL/TP changes without re-configuring.
  botEngine.setNotificationConfig({ telegramBotToken: '', telegramChatId: '' });
});

test('protection-change message shows original → new level, and marks a fresh attach', () => {
  const format = (botEngine as any).formatProtectionChange.bind(botEngine);
  const pos = {
    symbol: 'CLUSDT',
    interval: '5m',
    side: 'LONG',
    entryPrice: 79.12,
    stopLossPrice: 79.2,
    takeProfitPrice: 81.73,
    currentPrice: 79.35,
    unrealizedPnl: 0.31,
    unrealizedPnlPercent: 2.1,
  };

  const moved = format(pos, 77.93, 81.73, ['自动保本上移']);
  assert.match(moved, /止损: \$77\.93 → <b>\$79\.20<\/b>/);
  assert.match(moved, /止盈: \$81\.73（未变）/);
  assert.match(moved, /原因: 自动保本上移/);
  assert.match(moved, /浮盈 \+\$0\.31/);

  const attached = format({ ...pos }, null, 81.73, ['交易所补挂止损']);
  assert.match(attached, /止损: 未挂 → <b>\$79\.20<\/b>/);
  assert.match(attached, /（新挂）/);
});
