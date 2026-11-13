import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBinanceAccountResponse,
  reconstructLiveEquityHistoryFromIncome,
  parseBinanceOpenPositions,
  parseBinanceRealClosedTrades,
} from './binanceSync';

test('parseBinanceAccountResponse extracts exact real Binance margin & unrealized profit without 10000 fallback', () => {
  const parsed = parseBinanceAccountResponse({
    totalWalletBalance: '245.50',
    availableBalance: '180.25',
    totalMarginBalance: '263.85',
    totalUnrealizedProfit: '18.35',
    totalPositionInitialMargin: '65.25',
  });

  assert.equal(parsed.walletBalance, 245.5);
  assert.equal(parsed.availableBalance, 180.25);
  assert.equal(parsed.marginBalance, 263.85);
  assert.equal(parsed.unrealizedProfit, 18.35);
  assert.equal(parsed.positionInitialMargin, 65.25);

  const empty = parseBinanceAccountResponse({});
  assert.equal(empty.walletBalance, 0);
  assert.equal(empty.marginBalance, 0);
});

test('reconstructLiveEquityHistoryFromIncome steps backward from live walletBalance using real cashflows', () => {
  const now = 1_700_005_000_000;
  const incomes = [
    { time: 1_700_001_000_000, income: '20.00' },
    { time: 1_700_003_000_000, income: '-5.00' },
  ];
  const account = parseBinanceAccountResponse({
    totalWalletBalance: '215.00',
    availableBalance: '190.00',
    totalMarginBalance: '227.50',
    totalUnrealizedProfit: '12.50',
  });

  const history = reconstructLiveEquityHistoryFromIncome(incomes, account, 1, now);
  assert.equal(history.length, 3);
  // Second historical event wallet balance = current 215.00
  assert.equal(history[1].equity, 215);
  // First historical event wallet balance = 215 - (-5) = 220
  assert.equal(history[0].equity, 220);
  // Final live snapshot includes real unrealizedProfit & open positions count
  assert.equal(history[2].equity, 227.5);
  assert.equal(history[2].balance, 190);
  assert.equal(history[2].unrealizedPnl, 12.5);
  assert.equal(history[2].activePositionsCount, 1);
});

test('parseBinanceOpenPositions maps live Binance positions and exchange SL/TP orders accurately', () => {
  const posList = [
    {
      symbol: 'ETHUSDT',
      positionAmt: '-0.500',
      entryPrice: '2100.0',
      markPrice: '2060.0',
      unRealizedProfit: '20.0',
      leverage: '5',
      isolatedMargin: '210.0',
      liquidationPrice: '2510.0',
      updateTime: 1700000000000,
    },
    {
      symbol: 'BTCUSDT',
      positionAmt: '0',
      entryPrice: '0',
      markPrice: '70000',
      unRealizedProfit: '0',
    },
  ];
  const openOrders = [
    { symbol: 'ETHUSDT', type: 'STOP_MARKET', stopPrice: '2145.50', orderId: 99123 },
    { symbol: 'ETHUSDT', type: 'TAKE_PROFIT_MARKET', stopPrice: '2010.00', orderId: 99124 },
  ];

  const mapped = parseBinanceOpenPositions(posList, openOrders, [], [], 5);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].symbol, 'ETHUSDT');
  assert.equal(mapped[0].side, 'SHORT');
  assert.equal(mapped[0].quantity, 0.5);
  assert.equal(mapped[0].unrealizedPnl, 20);
  assert.equal(mapped[0].stopLossPrice, 2145.5);
  assert.equal(mapped[0].stopLossOrderId, '99123');
  assert.equal(mapped[0].takeProfitOrderId, '99124');
  assert.equal(mapped[0].isPaper, false);
});

test('parseBinanceRealClosedTrades uses real fill prices/PnL instead of hardcoded 2.5% fallback', () => {
  const userTrades = [
    {
      symbol: 'ETHUSDT',
      orderId: 55501,
      side: 'SELL',
      price: '2150.00',
      qty: '0.200',
      quoteQty: '430.00',
      realizedPnl: '14.40',
      commission: '0.20',
      commissionAsset: 'USDT',
      time: 1700002000000,
    },
  ];

  const closed = parseBinanceRealClosedTrades([], userTrades, 5);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].side, 'LONG');
  assert.equal(closed[0].exitPrice, 2150);
  assert.equal(closed[0].netPnl, 14.2);
  assert.equal(closed[0].isPaper, false);
  // Real margin ~ 430 / 5 = 86 -> ~16.51% (not hardcoded 2.5%)
  assert.ok(Math.abs(closed[0].pnlPercent - 16.51) < 0.2);
});
