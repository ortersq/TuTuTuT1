import {
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  DataSourceAudit,
  Kline,
  StrategyKey,
  SymbolExchangeRules,
} from '../types/trading';
import { runFuturesBacktest } from './backtest';
import { STRATEGY_CATALOG } from './strategies';

export interface BinanceFetchOptions {
  symbol: string;
  interval: string;
  limit?: number; // 100 to 1000
}

export interface BinanceFetchResult {
  klines: Kline[];
  audit: DataSourceAudit;
}

// Official Binance Futures & public market endpoints in priority order
const BINANCE_OFFICIAL_ENDPOINTS = [
  'https://fapi.binance.com/fapi/v1/klines',       // Binance USDT-M Futures API (supports Crypto & TradFi perps like XAUUSDT)
  'https://data-api.binance.vision/api/v3/klines', // Binance official market data API (CORS *, no geo-block fallback)
  'https://api.binance.com/api/v3/klines',         // Binance global Spot API fallback
  'https://api.binance.us/api/v3/klines',          // Binance US fallback
];

export const DEFAULT_SYMBOL_EXCHANGE_RULES: Record<string, SymbolExchangeRules> = {
  BTCUSDT: { symbol: 'BTCUSDT', available: true, pricePrecision: 1, quantityPrecision: 3, tickSize: 0.1, stepSize: 0.001, minQty: 0.001, minNotional: 100 },
  ETHUSDT: { symbol: 'ETHUSDT', available: true, pricePrecision: 2, quantityPrecision: 3, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, minNotional: 20 },
  XAUUSDT: { symbol: 'XAUUSDT', available: true, pricePrecision: 2, quantityPrecision: 3, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, minNotional: 5 },
  NVDAUSDT: { symbol: 'NVDAUSDT', available: true, pricePrecision: 2, quantityPrecision: 2, tickSize: 0.01, stepSize: 0.01, minQty: 0.01, minNotional: 5 },
  CLUSDT: { symbol: 'CLUSDT', available: true, pricePrecision: 2, quantityPrecision: 1, tickSize: 0.01, stepSize: 0.1, minQty: 0.1, minNotional: 5 },
};

export async function fetchFuturesExchangeRules(
  baseUrl: string = 'https://fapi.binance.com'
): Promise<Map<string, SymbolExchangeRules>> {
  const map = new Map<string, SymbolExchangeRules>();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${baseUrl}/fapi/v1/exchangeInfo`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) return map;
    const data = await resp.json();
    const symbols: any[] = Array.isArray(data?.symbols) ? data.symbols : [];
    for (const s of symbols) {
      if (!s?.symbol) continue;
      const filters: any[] = Array.isArray(s.filters) ? s.filters : [];
      const priceFilter = filters.find((f) => f.filterType === 'PRICE_FILTER');
      const lotFilter = filters.find((f) => f.filterType === 'LOT_SIZE');
      const notionalFilter = filters.find((f) => f.filterType === 'MIN_NOTIONAL');

      const tickSize = parseFloat(priceFilter?.tickSize || '0.01') || 0.01;
      const stepSize = parseFloat(lotFilter?.stepSize || '0.001') || 0.001;
      const minQty = parseFloat(lotFilter?.minQty || String(stepSize)) || stepSize;
      const minNotional = parseFloat(notionalFilter?.notional || '5') || 5;

      map.set(String(s.symbol).toUpperCase(), {
        symbol: String(s.symbol).toUpperCase(),
        available: s.status === 'TRADING',
        pricePrecision: Number(s.pricePrecision ?? 2),
        quantityPrecision: Number(s.quantityPrecision ?? 3),
        tickSize,
        stepSize,
        minQty,
        minNotional,
        note: s.status === 'TRADING' ? undefined : `合约状态: ${s.status}`,
      });
    }
  } catch {
    // caller falls back cleanly to cached/default rules
  }
  return map;
}

/**
 * Fetch 100% real historical K-lines directly from Binance official API.
 * NO fake or synthetic fallback data.
 */
export async function fetchBinanceKlines(options: BinanceFetchOptions): Promise<BinanceFetchResult> {
  const { symbol, interval, limit = 500 } = options;
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');

  let lastError: Error | null = null;
  const startTime = Date.now();

  for (const endpoint of BINANCE_OFFICIAL_ENDPOINTS) {
    try {
      const url = `${endpoint}?symbol=${cleanSymbol}&interval=${interval}&limit=${Math.min(1000, limit)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        let errDetail = '';
        try {
          const errJson = await resp.json();
          if (errJson?.msg) errDetail = ` (${errJson.msg})`;
        } catch {
          // ignore
        }
        throw new Error(`币安接口 HTTP ${resp.status}${errDetail}`);
      }

      const rawData = await resp.json();

      if (!Array.isArray(rawData) || rawData.length === 0) {
        throw new Error('币安返回数据格式异常 (非数组或为空)');
      }

      // Check if Binance returned an error payload: { code: ..., msg: ... }
      if (rawData.length > 0 && !Array.isArray(rawData[0])) {
        const errMsg = (rawData as any).msg || JSON.stringify(rawData);
        throw new Error(`币安服务返回错误: ${errMsg}`);
      }

      const latencyMs = Date.now() - startTime;

      const klines: Kline[] = rawData.map((item: any[]) => ({
        timestamp: Number(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),
        quoteVolume: parseFloat(item[7]),
        tradesCount: Number(item[8]),
      }));

      // Gather audit data
      let highestPrice = -Infinity;
      let lowestPrice = Infinity;
      let totalTrades = 0;

      for (const k of klines) {
        if (k.high > highestPrice) highestPrice = k.high;
        if (k.low < lowestPrice) lowestPrice = k.low;
        totalTrades += k.tradesCount;
      }

      const audit: DataSourceAudit = {
        isRealData: true,
        endpointUrl: url,
        symbol: cleanSymbol,
        interval,
        candleCount: klines.length,
        latencyMs,
        fetchTime: Date.now(),
        firstCandleIso: new Date(klines[0].timestamp).toISOString(),
        lastCandleIso: new Date(klines[klines.length - 1].timestamp).toISOString(),
        firstPrice: klines[0].open,
        lastPrice: klines[klines.length - 1].close,
        highestPrice,
        lowestPrice,
        totalTradesRecorded: totalTrades,
        rawSample: [rawData[0], rawData[1], rawData[rawData.length - 1]],
      };

      return { klines, audit };
    } catch (err: any) {
      lastError = err;
      // Try next official endpoint in cascade
      continue;
    }
  }

  // If all live Binance endpoints failed, throw error directly. Zero fake data!
  throw new Error(
    `无法从币安官方接口拉取真实数据: ${lastError?.message || '网络连接超时'}。请检查网络连接或交易对名称是否有效。`
  );
}

export interface MultiStrategyComparison {
  symbol: string;
  interval: string;
  candleCount: number;
  championStrategy: StrategyKey;
  championName: string;
  results: {
    key: StrategyKey;
    name: string;
    category: string;
    metrics: BacktestMetrics;
    result: BacktestResult;
    rankScore: number;
  }[];
}

/**
 * Benchmark all 6 mature strategies in parallel using 100% real historical data
 */
export function runMultiStrategyBenchmark(
  klines: Kline[],
  baseConfig: BacktestConfig,
  audit?: DataSourceAudit
): MultiStrategyComparison {
  const allStrategies: StrategyKey[] = [
    'pattern_price_action',
    'wyckoff_spring_utad',
    'brooks_h2_l2',
    'flag_breakout',
    'double_top_bottom',
  ];

  const results = allStrategies.map((stratKey) => {
    const config: BacktestConfig = {
      ...baseConfig,
      strategy: stratKey,
    };
    const res = runFuturesBacktest(klines, config);
    if (audit) res.audit = audit;
    const info = STRATEGY_CATALOG.find((s) => s.key === stratKey);

    const ret = res.metrics.totalReturnPercent;
    const winRate = res.metrics.winRatePercent;
    const pf = Math.min(5, res.metrics.profitFactor);
    const dd = Math.max(1, res.metrics.maxDrawdownPercent);
    const sharpe = Math.max(0, res.metrics.sharpeRatio);

    const rankScore = ret * 0.4 + winRate * 0.2 + pf * 10 + sharpe * 15 - dd * 0.5;

    return {
      key: stratKey,
      name: info?.name ?? stratKey,
      category: info?.category ?? '策略',
      metrics: res.metrics,
      result: res,
      rankScore,
    };
  });

  results.sort((a, b) => b.rankScore - a.rankScore);

  return {
    symbol: baseConfig.symbol,
    interval: baseConfig.interval,
    candleCount: klines.length,
    championStrategy: results[0].key,
    championName: results[0].name,
    results,
  };
}
