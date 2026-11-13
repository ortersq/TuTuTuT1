import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLogRootCauses, LogEntryLike } from './logRootCause';

const makeLog = (
  id: string,
  level: LogEntryLike['level'],
  category: LogEntryLike['category'],
  message: string,
  symbol?: string,
  timestamp = 1700000000000
): LogEntryLike => ({
  id,
  time: '12:00:00',
  timestamp,
  level,
  category,
  message,
  symbol,
});

test('analyzeLogRootCauses classifies API limits, risk circuit breakers, liquidity, and balance limits accurately', () => {
  const logs: LogEntryLike[] = [
    makeLog('1', 'error', 'API', '币安实盘账户同步失败: [0] Service unavailable from a restricted location (451)'),
    makeLog('2', 'warn', 'SYSTEM', '🚨 【全自动风险熔断防线触发】: 大盘共振 95%'),
    makeLog('3', 'warn', 'ORDER', '⚠️ [ETHUSDT] 可用保证金不足或已达单笔风控上限，暂缓开单', 'ETHUSDT'),
    makeLog('4', 'info', 'ORDER', '💧 [BTCUSDT] 盘口深度流动性不足，自动切换为冰山单切片执行防止滑点', 'BTCUSDT'),
    makeLog('5', 'warn', 'SIGNAL', '⛔ [BTCUSDT 15m] 全平冷却期内暂缓开新单', 'BTCUSDT'),
  ];

  const report = analyzeLogRootCauses(logs);
  assert.equal(report.totalAnalyzedLogs, 5);
  assert.equal(report.blockingEventsCount, 5);
  assert.ok(report.items.length >= 4);

  const ids = report.items.map((i) => i.id);
  assert.ok(ids.includes('API_CIRCUIT_OR_GEO'));
  assert.ok(ids.includes('RISK_CIRCUIT_BREAKER'));
  assert.ok(ids.includes('BALANCE_OR_MIN_NOTIONAL'));
  assert.ok(ids.includes('LIQUIDITY_SLIPPAGE'));
  assert.ok(ids.includes('STRATEGY_FILTER_OR_COOLDOWN'));

  // Critical issues should rank before medium ones
  assert.equal(report.items[0].severity, 'CRITICAL');
});

test('analyzeLogRootCauses synthesizes active runtime blockers even when logs are clean', () => {
  const report = analyzeLogRootCauses([], {
    hasBinanceKeys: true,
    syncOk: false,
    lastSyncError: 'Timestamp for this request was 1000ms ahead (-1021)',
    isDrawdownLocked: true,
  });

  assert.equal(report.items.length, 2);
  assert.equal(report.items[0].fixAction.type, 'SYNC_ACCOUNT');
  assert.equal(report.items[1].fixAction.type, 'RESET_DRAWDOWN_LOCK');
});

test('analyzeLogRootCauses reports healthy pipeline when zero blocking logs exist', () => {
  const logs: LogEntryLike[] = [
    makeLog('1', 'info', 'SYSTEM', '💓 [系统心跳存活自检 OK]'),
    makeLog('2', 'success', 'ORDER', '✔ 平仓盈利 +12.50 USDT', 'BTCUSDT'),
  ];

  const report = analyzeLogRootCauses(logs);
  assert.equal(report.items.length, 0);
  assert.equal(report.blockingEventsCount, 0);
  assert.match(report.primaryBlockerTitle, /未检出阻塞型异常/);
});
