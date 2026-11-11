import {
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  DataSourceAudit,
  Kline,
  StrategyKey,
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

// Official Binance public endpoints in order of reliability and open CORS support
const BINANCE_OFFICIAL_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3/klines', // Binance official market data API (CORS *, no geo-block)
  'https://api.binance.us/api/v3/klines',          // Binance US public API (CORS *, no geo-block)
  'https://api.binance.com/api/v3/klines',         // Binance global API
  'https://fapi.binance.com/fapi/v1/klines',       // Binance Futures API
];

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
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`币安接口 HTTP ${resp.status} ${resp.statusText}`);
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
