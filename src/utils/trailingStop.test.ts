import test from 'node:test';
import assert from 'node:assert';
import { RiskManagementConfig } from '../types/trading';

interface PositionState {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  trailingPeakPrice: number;
  trailingStopPrice: number | null;
  isTrailingActive: boolean;
  peakPnlUsdt: number;
  unrealizedPnl: number;
}

/**
 * Pure helper function implementing the engine's trailing stop-loss logic
 */
function evaluateTrailingStop(
  pos: PositionState,
  currentPrice: number,
  riskConfig: Pick<
    RiskManagementConfig,
    'useTrailingStop' | 'trailingActivationPercent' | 'trailingCallbackPercent' | 'trailingActivationUsdt'
  >
): { exitTriggered: boolean; exitPrice: number; reason: string } {
  if (!riskConfig.useTrailingStop) {
    return { exitTriggered: false, exitPrice: currentPrice, reason: '' };
  }

  // Update current and peak
  if (pos.side === 'LONG') {
    pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
    if (currentPrice > pos.trailingPeakPrice) {
      pos.trailingPeakPrice = currentPrice;
    }
  } else {
    pos.unrealizedPnl = (pos.entryPrice - currentPrice) * pos.quantity;
    if (currentPrice < pos.trailingPeakPrice) {
      pos.trailingPeakPrice = currentPrice;
    }
  }

  if (pos.unrealizedPnl > pos.peakPnlUsdt) {
    pos.peakPnlUsdt = pos.unrealizedPnl;
  }

  const activationRate = (riskConfig.trailingActivationPercent ?? 0.8) / 100;
  const callbackRate = (riskConfig.trailingCallbackPercent ?? 0.45) / 100;
  const activationUsdt = riskConfig.trailingActivationUsdt ?? 25;

  let gainRate = 0;
  if (pos.side === 'LONG') {
    gainRate = (pos.trailingPeakPrice - pos.entryPrice) / pos.entryPrice;
  } else {
    gainRate = (pos.entryPrice - pos.trailingPeakPrice) / pos.entryPrice;
  }

  // Check activation
  if (gainRate >= activationRate || pos.peakPnlUsdt >= activationUsdt) {
    if (!pos.isTrailingActive) {
      pos.isTrailingActive = true;
      pos.trailingStopPrice = pos.side === 'LONG' ? pos.entryPrice * 1.0015 : pos.entryPrice * 0.9985;
    }

    if (pos.side === 'LONG') {
      const candidateStop = pos.trailingPeakPrice * (1 - callbackRate);
      if (pos.trailingStopPrice === null || candidateStop > pos.trailingStopPrice) {
        pos.trailingStopPrice = candidateStop;
      }
      if (currentPrice <= pos.trailingStopPrice) {
        return { exitTriggered: true, exitPrice: pos.trailingStopPrice, reason: 'TRAILING_STOP' };
      }
    } else {
      const candidateStop = pos.trailingPeakPrice * (1 + callbackRate);
      if (pos.trailingStopPrice === null || candidateStop < pos.trailingStopPrice) {
        pos.trailingStopPrice = candidateStop;
      }
      if (currentPrice >= pos.trailingStopPrice) {
        return { exitTriggered: true, exitPrice: pos.trailingStopPrice, reason: 'TRAILING_STOP' };
      }
    }
  }

  return { exitTriggered: false, exitPrice: currentPrice, reason: '' };
}

test('Trailing Stop-Loss: Activation when price moves in favor', () => {
  const pos: PositionState = {
    side: 'LONG',
    entryPrice: 68000,
    quantity: 0.1,
    trailingPeakPrice: 68000,
    trailingStopPrice: null,
    isTrailingActive: false,
    peakPnlUsdt: 0,
    unrealizedPnl: 0,
  };

  const risk = {
    useTrailingStop: true,
    trailingActivationPercent: 0.8, // 0.8% gain = 68544
    trailingCallbackPercent: 0.45,
    trailingActivationUsdt: 50,
  };

  // 1. Price moves up +0.5% (68340) -> Not activated yet
  let res = evaluateTrailingStop(pos, 68340, risk);
  assert.strictEqual(pos.isTrailingActive, false);
  assert.strictEqual(res.exitTriggered, false);

  // 2. Price moves up +1.0% (68680) -> Exceeds 0.8% -> Trailing activates!
  res = evaluateTrailingStop(pos, 68680, risk);
  assert.strictEqual(pos.isTrailingActive, true);
  assert.ok(pos.trailingStopPrice !== null && pos.trailingStopPrice >= pos.entryPrice);
  assert.strictEqual(res.exitTriggered, false);
});

test('Trailing Stop-Loss: Ratchets upward and locks profit on reversion', () => {
  const pos: PositionState = {
    side: 'LONG',
    entryPrice: 68000,
    quantity: 0.1,
    trailingPeakPrice: 68000,
    trailingStopPrice: null,
    isTrailingActive: false,
    peakPnlUsdt: 0,
    unrealizedPnl: 0,
  };

  const risk = {
    useTrailingStop: true,
    trailingActivationPercent: 0.8,
    trailingCallbackPercent: 0.45, // 0.45% callback
    trailingActivationUsdt: 25,
  };

  // Price surges to 69200 (+1.76% gain, floating profit ~$120)
  evaluateTrailingStop(pos, 69200, risk);
  assert.strictEqual(pos.isTrailingActive, true);
  // Trailing stop should be at least 69200 * (1 - 0.0045) = 68888.6
  const lockedStop = pos.trailingStopPrice!;
  assert.ok(lockedStop >= 68880);

  // Market starts reverting: Price drops from 69200 down to 68800 (reversion!)
  const exitRes = evaluateTrailingStop(pos, 68800, risk);
  assert.strictEqual(exitRes.exitTriggered, true);
  assert.strictEqual(exitRes.reason, 'TRAILING_STOP');

  // Profit secured is (68888.6 - 68000) * 0.1 = +$88.8 USDT profit! Prevented reverting to loss!
  const lockedProfit = (exitRes.exitPrice - pos.entryPrice) * pos.quantity;
  assert.ok(lockedProfit > 80, `Locked profit should be > $80, got ${lockedProfit}`);
});

test('Trailing Stop-Loss: Short position activation and lock', () => {
  const pos: PositionState = {
    side: 'SHORT',
    entryPrice: 68000,
    quantity: 0.1,
    trailingPeakPrice: 68000,
    trailingStopPrice: null,
    isTrailingActive: false,
    peakPnlUsdt: 0,
    unrealizedPnl: 0,
  };

  const risk = {
    useTrailingStop: true,
    trailingActivationPercent: 0.8,
    trailingCallbackPercent: 0.45,
    trailingActivationUsdt: 25,
  };

  // Price drops in favor to 67200
  evaluateTrailingStop(pos, 67200, risk);
  assert.strictEqual(pos.isTrailingActive, true);
  // Trailing stop for short is racheted down
  assert.ok(pos.trailingStopPrice! < pos.entryPrice);

  // Price bounces up to 67600
  const exitRes = evaluateTrailingStop(pos, 67600, risk);
  assert.strictEqual(exitRes.exitTriggered, true);
  assert.strictEqual(exitRes.reason, 'TRAILING_STOP');
});
