import test from 'node:test';
import assert from 'node:assert';
import { MarketCorrelationMetrics, SymbolSensitivityRLState } from '../types/trading';

test('Market Volatility Correlation & Circuit Breaker Logic Evaluation', () => {
  // Test Circuit Breaker Evaluation Function
  const evaluateCircuitBreaker = (atrs: number[], signals: number[]): MarketCorrelationMetrics => {
    let avgVolRatio = 1.0;
    let correlationScore = 0.45;

    if (atrs.length > 0) {
      const meanAtr = atrs.reduce((a, b) => a + b, 0) / atrs.length;
      const maxAtr = Math.max(...atrs);
      avgVolRatio = Number((maxAtr / (meanAtr || 1)).toFixed(2));
    }

    const nonZero = signals.filter((s) => s !== 0);
    if (nonZero.length >= 2) {
      const longs = nonZero.filter((s) => s === 1).length;
      const shorts = nonZero.filter((s) => s === -1).length;
      correlationScore = Number((Math.max(longs, shorts) / nonZero.length).toFixed(2));
    } else if (avgVolRatio >= 2.0) {
      correlationScore = 0.88;
    }

    const isCircuitBreakerActive = avgVolRatio >= 2.2 || (correlationScore >= 0.85 && avgVolRatio >= 1.6);

    return {
      avgVolatilityRatio: avgVolRatio,
      correlationScore,
      isCircuitBreakerActive,
      circuitBreakerReason: isCircuitBreakerActive ? 'CIRCUIT_BREAKER_ACTIVE' : 'NORMAL',
      safeLevelLeverage: isCircuitBreakerActive ? 1 : 5,
      maxAllowedAccountPositions: isCircuitBreakerActive ? 1 : 4,
      recommendedAction: 'TEST',
      lastEvaluatedTime: Date.now(),
    };
  };

  // Normal market condition
  const normalRes = evaluateCircuitBreaker([10, 11, 10.5, 9.8], [1, -1, 1, 0]);
  assert.strictEqual(normalRes.isCircuitBreakerActive, false);
  assert.strictEqual(normalRes.safeLevelLeverage, 5);

  // Synchronized Volatility Spike & High Correlation (3 baseline ATR = 10, 1 spike ATR = 32)
  const spikeRes = evaluateCircuitBreaker([10, 10, 10, 32], [1, 1, 1, 1]);
  assert.strictEqual(spikeRes.isCircuitBreakerActive, true);
  assert.strictEqual(spikeRes.safeLevelLeverage, 1);
  assert.strictEqual(spikeRes.maxAllowedAccountPositions, 1);
});

test('Symbol Reinforcement Learning Sensitivity Action Iteration', () => {
  const computeRLState = (
    symbol: string,
    sharpeRatio: number,
    winRate: number,
    maxDrawdownPercent: number
  ): SymbolSensitivityRLState => {
    const reward = sharpeRatio * 0.4 + (winRate - 50) * 0.3 - maxDrawdownPercent * 0.3;

    let rlAction: 'ELEVATE_SENSITIVITY' | 'MAINTAIN' | 'RESTRICT_SENSITIVITY' = 'MAINTAIN';
    let sensitivityScore = 75;
    let qualityScoreThreshold = 85;
    let atrMultiplier = 1.8;

    if (reward >= 1.2 || (sharpeRatio >= 1.8 && winRate >= 65)) {
      rlAction = 'ELEVATE_SENSITIVITY';
      sensitivityScore = 95;
      qualityScoreThreshold = 78;
      atrMultiplier = 1.5;
    } else if (reward <= -0.5 || sharpeRatio < 0.6 || maxDrawdownPercent > 12) {
      rlAction = 'RESTRICT_SENSITIVITY';
      sensitivityScore = 40;
      qualityScoreThreshold = 92;
      atrMultiplier = 2.2;
    }

    return {
      symbol,
      sensitivityScore,
      qualityScoreThreshold,
      atrMultiplier,
      rlGeneration: 1,
      sharpeRatio,
      winRate,
      maxDrawdown: maxDrawdownPercent,
      rlAction,
      statusDescription: 'RL TEST',
      lastUpdated: Date.now(),
    };
  };

  // High performance symbol -> ELEVATE_SENSITIVITY (looser threshold = 78)
  const highPerf = computeRLState('BTCUSDT', 2.4, 75, 4.2);
  assert.strictEqual(highPerf.rlAction, 'ELEVATE_SENSITIVITY');
  assert.strictEqual(highPerf.qualityScoreThreshold, 78);

  // Poor performance symbol -> RESTRICT_SENSITIVITY (strict threshold = 92)
  const poorPerf = computeRLState('SOLUSDT', 0.2, 40, 18.5);
  assert.strictEqual(poorPerf.rlAction, 'RESTRICT_SENSITIVITY');
  assert.strictEqual(poorPerf.qualityScoreThreshold, 92);
});
