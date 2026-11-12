import test from 'node:test';
import assert from 'node:assert/strict';
import { botEngine, BotTradeRecord } from '../server/botEngine';

test('Self-Learning Reinforcement Engine updates weights on trade closure', () => {
  const initialStatus = botEngine.getStatus();
  const initialGen = initialStatus.learningGeneration;
  assert.ok(initialGen >= 1, 'Initial learning generation should be at least 1');
  assert.ok(initialStatus.patternLearningStats.length >= 8, 'Should initialize at least 8 default pattern weights');

  // Simulate a winning trade for WYCKOFF_SPRING
  const winTrade: BotTradeRecord = {
    id: 'test_trade_1',
    symbol: 'BTCUSDT',
    interval: '15m',
    side: 'LONG',
    patternType: 'WYCKOFF_SPRING',
    patternName: 'Wyckoff 弹簧破底洗盘 (Spring)',
    entryTime: Date.now() - 3600000,
    exitTime: Date.now(),
    entryPrice: 90000,
    exitPrice: 92000,
    quantity: 0.5,
    leverage: 5,
    marginUsed: 500,
    netPnl: 100,
    pnlPercent: 20,
    exitReason: 'TAKE_PROFIT',
    strategyUsed: 'pattern_price_action',
    isPaper: true,
  };

  botEngine.updatePatternLearning(winTrade);

  const updatedStatus = botEngine.getStatus();
  assert.equal(updatedStatus.learningGeneration, initialGen + 1, 'Generation counter should increment by 1');

  const springStat = updatedStatus.patternLearningStats.find((s) => s.patternType === 'WYCKOFF_SPRING');
  assert.ok(springStat, 'WYCKOFF_SPRING stat should exist');
  assert.ok(springStat.weight > 1.0, `Weight should increase above 1.0 after profit, got ${springStat.weight}`);
  assert.equal(springStat.wins, 1, 'Wins count should be 1');
  assert.equal(springStat.totalTrades, 1, 'Total trades should be 1');
  assert.equal(springStat.winRate, 100, 'Win rate should be 100%');
});

test('Self-Learning Engine penalizes bad trades and calculates quality score boost', () => {
  const losingTrade: BotTradeRecord = {
    id: 'test_trade_loss',
    symbol: 'ETHUSDT',
    interval: '5m',
    side: 'SHORT',
    patternType: 'M_TOP',
    patternName: 'M头颈线放量破位 (Double Top)',
    entryTime: Date.now() - 1800000,
    exitTime: Date.now(),
    entryPrice: 3000,
    exitPrice: 3100,
    quantity: 2,
    leverage: 5,
    marginUsed: 400,
    netPnl: -100,
    pnlPercent: -25,
    exitReason: 'STOP_LOSS',
    strategyUsed: 'pattern_price_action',
    isPaper: true,
  };

  // Simulate multiple losses to trigger decay pruning
  botEngine.updatePatternLearning(losingTrade);
  botEngine.updatePatternLearning(losingTrade);
  botEngine.updatePatternLearning(losingTrade);

  const updatedStatus = botEngine.getStatus();
  const mTopStat = updatedStatus.patternLearningStats.find((s) => s.patternType === 'M_TOP');

  assert.ok(mTopStat, 'M_TOP stat should exist');
  assert.ok(mTopStat.weight < 1.0, `Weight should decrease below 1.0 after consecutive losses, got ${mTopStat.weight}`);
  assert.equal(mTopStat.losses, 3, 'Losses count should be 3');
  assert.ok(mTopStat.adaptiveSizingMultiplier <= 0.8, 'Position sizing multiplier should shrink for low conviction patterns');
});

test('Multi-dimensional time and trading session slicing updates correctly', () => {
  // Simulate a US session trade on 30m
  const usUtcTimestamp = new Date('2026-11-11T16:00:00Z').getTime(); // 16:00 UTC is US Session (14..21)
  const usTrade: BotTradeRecord = {
    id: 'us_trade_1',
    symbol: 'SOLUSDT',
    interval: '30m',
    side: 'LONG',
    patternType: 'BULL_FLAG',
    patternName: '经典牛旗中继爆发 (Bull Flag)',
    entryTime: usUtcTimestamp,
    exitTime: usUtcTimestamp + 3600000,
    entryPrice: 200,
    exitPrice: 215,
    quantity: 10,
    leverage: 5,
    marginUsed: 400,
    netPnl: 150,
    pnlPercent: 37.5,
    exitReason: 'TAKE_PROFIT',
    strategyUsed: 'pattern_price_action',
    isPaper: true,
  };

  botEngine.updatePatternLearning(usTrade);

  const status = botEngine.getStatus();
  const bullFlagStat = status.patternLearningStats.find((s) => s.patternType === 'BULL_FLAG');
  assert.ok(bullFlagStat, 'BULL_FLAG stat should exist');

  const tf30m = bullFlagStat.timeframeStats.find((t) => t.timeframe === '30m');
  assert.ok(tf30m, '30m timeframe stat should exist');
  assert.equal(tf30m.wins, 1, '30m timeframe should have 1 win');

  const usSession = bullFlagStat.sessionStats.find((s) => s.sessionKey === 'US');
  assert.ok(usSession, 'US session stat should exist');
  assert.equal(usSession.wins, 1, 'US session should have 1 win');
  assert.ok(bullFlagStat.bestTimeframe.includes('30m'), 'Best timeframe should include 30m');
});
