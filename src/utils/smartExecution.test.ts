import test from 'node:test';
import assert from 'node:assert';
import { SmartExecutionResult, CorrelationHedgingState, Kline } from '../types/trading';

test('Smart Execution Algorithm Evaluation (Volume & Volatility Depth Slicing)', () => {
  const evaluateSmartExecution = (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    currentPrice: number,
    volRatio: number
  ): SmartExecutionResult => {
    const notionalUsdt = quantity * currentPrice;

    let executionAlgorithm: SmartExecutionResult['executionAlgorithm'] = 'MARKET_DIRECT';
    let slicesCount = 1;
    let estimatedSlippageBps = 2.5;
    let executionReason = '🟢 市场深度充沛';

    if (volRatio < 0.65 || notionalUsdt >= 2500) {
      executionAlgorithm = 'ICEBERG_LIMIT_SLICING';
      slicesCount = 4;
      estimatedSlippageBps = 0.8;
      executionReason = '📉 深度预警: 低成交量或大单面值，自动采用冰山分片限价单';
    } else if (volRatio >= 1.8) {
      executionAlgorithm = 'TWAP_HEDGING';
      slicesCount = 3;
      estimatedSlippageBps = 1.2;
      executionReason = '⚡ 高波插针期预警: 开启 TWAP 溢价分片单';
    }

    return {
      symbol,
      side,
      executionAlgorithm,
      volumeRatio: volRatio,
      estimatedSlippageBps,
      slicesCount,
      executionReason,
      timestamp: Date.now(),
    };
  };

  // Low volume / large order -> ICEBERG
  const icebergRes = evaluateSmartExecution('BTCUSDT', 'BUY', 0.1, 65000, 0.45);
  assert.strictEqual(icebergRes.executionAlgorithm, 'ICEBERG_LIMIT_SLICING');
  assert.strictEqual(icebergRes.slicesCount, 4);

  // High volatility -> TWAP
  const twapRes = evaluateSmartExecution('ETHUSDT', 'SELL', 0.2, 3500, 2.1);
  assert.strictEqual(twapRes.executionAlgorithm, 'TWAP_HEDGING');
  assert.strictEqual(twapRes.slicesCount, 3);
});

test('Dynamic Correlation Hedging (Portfolio Exposure Reduction)', () => {
  const evaluateCorrelationHedging = (
    p1Symbol: string,
    p1Pnl: number,
    p2Symbol: string,
    p2Pnl: number,
    correlation: number
  ): CorrelationHedgingState | null => {
    if (correlation >= 0.80) {
      const weakerSymbol = p1Pnl < p2Pnl ? p1Symbol : p2Symbol;
      return {
        pairName: `${p1Symbol} / ${p2Symbol}`,
        correlationCoefficient: correlation,
        symbolA: p1Symbol,
        symbolB: p2Symbol,
        weakerSymbol,
        actionTaken: `下调 ${weakerSymbol} 持仓 40%`,
        hedgedQuantityPercent: 40,
        timestamp: Date.now(),
      };
    }
    return null;
  };

  // Highly correlated BTC / ETH pair -> Hedge weaker ETH position
  const hedgeResult = evaluateCorrelationHedging('BTCUSDT', 85, 'ETHUSDT', -12, 0.89);
  assert.ok(hedgeResult);
  assert.strictEqual(hedgeResult?.weakerSymbol, 'ETHUSDT');
  assert.strictEqual(hedgeResult?.hedgedQuantityPercent, 40);
});
