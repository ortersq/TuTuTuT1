import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { BinanceApiError, BinanceFuturesRest } from './binanceRest';

function startStubServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ url: string; close: () => Promise<void>; hits: () => number }> {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        hits: () => hits,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test('a failed request throws instead of returning an empty array (the "positions vanished" bug)', async () => {
  const rest = new BinanceFuturesRest(
    () => 'http://127.0.0.1:1',
    () => 'key',
    () => 'secret'
  );

  await assert.rejects(
    () => rest.positionRisk(),
    (err: unknown) => {
      assert.ok(err instanceof BinanceApiError, 'must be a BinanceApiError');
      assert.equal((err as BinanceApiError).status, 0);
      return true;
    }
  );
});

test('429 sets a cool-down and blocks further requests without touching the network', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' });
    res.end(JSON.stringify({ code: -1003, msg: 'Too many requests.' }));
  });

  try {
    const rest = new BinanceFuturesRest(
      () => stub.url,
      () => 'key',
      () => 'secret'
    );

    await assert.rejects(
      () => rest.account(),
      (err: unknown) => {
        assert.ok(err instanceof BinanceApiError);
        assert.equal((err as BinanceApiError).isRateLimit, true);
        return true;
      }
    );

    assert.equal(rest.isRateLimited(), true);
    const remaining = rest.getRateLimitRemainingMs();
    assert.ok(remaining > 0 && remaining <= 2_100, `cool-down should honour Retry-After, got ${remaining}ms`);

    const hitsAfterFirst = stub.hits();
    await assert.rejects(() => rest.positionRisk(), /限频冷却中/);
    assert.equal(stub.hits(), hitsAfterFirst, 'no HTTP request may be sent while cooling down');
    assert.equal(rest.canAfford(1), false);
  } finally {
    await stub.close();
  }
});

test('request weight is accumulated into a rolling 60s budget', async () => {
  const rest = new BinanceFuturesRest(
    () => 'http://127.0.0.1:1',
    () => 'key',
    () => 'secret'
  );

  assert.equal(rest.canAfford(100), true);
  await assert.rejects(() => rest.request('/fapi/v2/account', { signed: true, weight: 1500 }));
  assert.ok(rest.getStats().budgetedWeight1m >= 1500);
  // 1500 + 500 would exceed the 1900 soft budget
  assert.equal(rest.canAfford(500), false);
});

test('a normal response is parsed and used-weight header is recorded', async () => {
  const stub = await startStubServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-mbx-used-weight-1m': '321' });
    res.end(JSON.stringify([{ symbol: 'BTCUSDT', positionAmt: '0' }]));
  });
  try {
    const rest = new BinanceFuturesRest(
      () => stub.url,
      () => 'key',
      () => 'secret'
    );
    const data = await rest.positionRisk();
    assert.equal(Array.isArray(data), true);
    assert.equal(data.length, 1);
    assert.equal(rest.getStats().usedWeight1m, 321);
  } finally {
    await stub.close();
  }
});
