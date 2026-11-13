import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBinanceCombinedStreamUrl,
  buildServerBotWsUrl,
  computeWsReconnectDelayMs,
  mergeWsTickersIntoStatus,
  parseBinanceWsTickerPayload,
  PartialStatusWithTickers,
} from './binanceWebSocket';

test('buildBinanceCombinedStreamUrl normalizes symbols into combined @ticker stream URL', () => {
  const url = buildBinanceCombinedStreamUrl(['BTCUSDT', 'ethusdt', 'BTCUSDT', 'NVDAUSDT']);
  assert.equal(
    url,
    'wss://fstream.binance.com/stream?streams=btcusdt@ticker/ethusdt@ticker/nvdausdt@ticker'
  );
});

test('buildServerBotWsUrl upgrades http/https origin to ws/wss with encoded token', () => {
  assert.equal(
    buildServerBotWsUrl('https://quant.example.com', 'tok 123'),
    'wss://quant.example.com/ws/bot-status?token=tok%20123'
  );
  assert.equal(
    buildServerBotWsUrl('http://localhost:3000', 'abc'),
    'ws://localhost:3000/ws/bot-status?token=abc'
  );
});

test('computeWsReconnectDelayMs applies bounded exponential backoff', () => {
  assert.equal(computeWsReconnectDelayMs(0, 1000, 15000), 1000);
  assert.equal(computeWsReconnectDelayMs(1, 1000, 15000), 1600);
  assert.equal(computeWsReconnectDelayMs(10, 1000, 15000), 15000);
});

test('parseBinanceWsTickerPayload parses Futures combined stream & miniTicker payloads accurately', () => {
  const combined = JSON.stringify({
    stream: 'btcusdt@ticker',
    data: { e: '24hrTicker', E: 1700000005000, s: 'BTCUSDT', c: '71234.50', P: '-1.85' },
  });
  const parsed = parseBinanceWsTickerPayload(combined, 'BINANCE_FAPI_WS');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].symbol, 'BTCUSDT');
  assert.equal(parsed[0].price, 71234.5);
  assert.equal(parsed[0].change24hPercent, -1.85);
  assert.equal(parsed[0].source, 'BINANCE_FAPI_WS');

  const mini = JSON.stringify({ s: 'ETHUSDT', c: '2200', o: '2000', E: 1700000006000 });
  const parsedMini = parseBinanceWsTickerPayload(mini, 'BINANCE_VISION_WS');
  assert.equal(parsedMini[0].change24hPercent, 10);
});

test('mergeWsTickersIntoStatus updates marketTickers and paper PnL while preserving live exchange PnL', () => {
  const baseStatus: Required<PartialStatusWithTickers> = {
    marketTickers: {
      BTCUSDT: { symbol: 'BTCUSDT', price: 70000, change24hPercent: 0, updatedAt: 1000, source: 'REST' },
    },
    lastMarketPreviewTime: 1000,
    activePositions: [
      {
        symbol: 'BTCUSDT',
        side: 'LONG' as const,
        entryPrice: 70000,
        currentPrice: 70000,
        quantity: 0.1,
        marginUsed: 1400,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        isPaper: true,
      },
      {
        symbol: 'ETHUSDT',
        side: 'LONG' as const,
        entryPrice: 2000,
        currentPrice: 2000,
        quantity: 1,
        marginUsed: 400,
        unrealizedPnl: 42.5,
        unrealizedPnlPercent: 10.625,
        isPaper: false,
      },
    ],
  };

  const merged = mergeWsTickersIntoStatus(baseStatus, [
    { symbol: 'BTCUSDT', price: 71000, change24hPercent: 1.43, eventTime: 2000, source: 'BINANCE_WS' },
    { symbol: 'ETHUSDT', price: 2050, change24hPercent: 2.5, eventTime: 2000, source: 'BINANCE_WS' },
  ]);

  assert.ok(merged);
  assert.equal(merged.marketTickers.BTCUSDT.price, 71000);
  assert.equal(merged.marketTickers.ETHUSDT.price, 2050);
  // Paper position updates unrealizedPnl dynamically
  assert.equal(merged.activePositions[0].unrealizedPnl, 100);
  // Live position keeps exchange-authoritative unrealizedPnl while updating live tick price
  assert.equal(merged.activePositions[1].currentPrice, 2050);
  assert.equal(merged.activePositions[1].unrealizedPnl, 42.5);
});
