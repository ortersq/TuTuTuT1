import { MarketTickerSnapshot } from '../types/trading';

export type WsConnectionPhase = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'FALLBACK_POLL';

export interface ParsedWsTicker {
  symbol: string;
  price: number;
  change24hPercent: number;
  eventTime: number;
  source: string;
}

export const BINANCE_WS_ENDPOINTS = [
  'wss://fstream.binance.com/stream',
  'wss://data-stream.binance.vision/stream',
  'wss://stream.binance.com:9443/stream',
] as const;

export function buildBinanceCombinedStreamUrl(
  symbols: string[],
  baseEndpoint: string = BINANCE_WS_ENDPOINTS[0]
): string {
  const normalized = Array.from(
    new Set(
      symbols
        .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter((s) => s.length >= 4)
    )
  );
  const streams = normalized.map((s) => `${s}@ticker`).join('/');
  return `${baseEndpoint}?streams=${streams}`;
}

export function buildServerBotWsUrl(origin: string, token: string): string {
  const wsOrigin = origin
    .replace(/^https:/i, 'wss:')
    .replace(/^http:/i, 'ws:');
  return `${wsOrigin}/ws/bot-status?token=${encodeURIComponent(token)}`;
}

export function computeWsReconnectDelayMs(attempt: number, baseMs: number = 1000, maxMs: number = 15000): number {
  const safeAttempt = Math.max(0, Math.min(10, attempt));
  const exp = Math.min(maxMs, baseMs * Math.pow(1.6, safeAttempt));
  return Math.round(exp);
}

/**
 * Parses raw JSON messages received from Binance Combined Streams (`{ stream, data }`)
 * or direct single `@ticker` / `@miniTicker` / `!ticker@arr` payloads.
 */
export function parseBinanceWsTickerPayload(
  rawText: string,
  endpointLabel: string = 'BINANCE_WS'
): ParsedWsTicker[] {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return [];
  }

  const results: ParsedWsTicker[] = [];
  const unwrap = parsed?.data ? parsed.data : parsed;
  const items = Array.isArray(unwrap) ? unwrap : [unwrap];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const sym = String(item.s || '').toUpperCase();
    const price = parseFloat(String(item.c ?? '0'));
    const changePct = parseFloat(String(item.P ?? '0'));
    if (!sym || !Number.isFinite(price) || price <= 0) continue;

    // For `@miniTicker` (`P` is absent), derive percent change cleanly from open `o` & close `c`
    let resolvedPct = Number.isFinite(changePct) ? changePct : 0;
    if (item.P === undefined && item.o !== undefined) {
      const openPrice = parseFloat(String(item.o));
      if (Number.isFinite(openPrice) && openPrice > 0) {
        resolvedPct = ((price - openPrice) / openPrice) * 100;
      }
    }

    results.push({
      symbol: sym,
      price,
      change24hPercent: Number(resolvedPct.toFixed(2)),
      eventTime: Number(item.E) || Date.now(),
      source: endpointLabel,
    });
  }

  return results;
}

export interface PartialStatusWithTickers {
  marketTickers?: Record<string, MarketTickerSnapshot>;
  lastMarketPreviewTime?: number;
  activePositions?: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    marginUsed: number;
    unrealizedPnl: number;
    unrealizedPnlPercent: number;
    isPaper: boolean;
  }>;
}

/**
 * Immutably merges high-frequency WebSocket ticker updates into existing BotStatus state
 * without dropping backend scan results, equity curves, or exchange risk metrics.
 */
export function mergeWsTickersIntoStatus<T extends PartialStatusWithTickers>(
  prevStatus: T | null,
  ticks: ParsedWsTicker[]
): T | null {
  if (!prevStatus || ticks.length === 0) return prevStatus;

  const tickMap = new Map<string, ParsedWsTicker>();
  for (const t of ticks) {
    tickMap.set(t.symbol, t);
  }

  let changed = false;
  const nextTickers: Record<string, MarketTickerSnapshot> = {
    ...(prevStatus.marketTickers || {}),
  };

  for (const [sym, t] of tickMap.entries()) {
    const prev = nextTickers[sym];
    if (
      !prev ||
      prev.price !== t.price ||
      prev.change24hPercent !== t.change24hPercent ||
      prev.source !== t.source
    ) {
      nextTickers[sym] = {
        symbol: sym,
        price: t.price,
        change24hPercent: t.change24hPercent,
        updatedAt: t.eventTime,
        source: t.source,
      };
      changed = true;
    }
  }

  let nextPositions = prevStatus.activePositions;
  if (Array.isArray(prevStatus.activePositions) && prevStatus.activePositions.length > 0) {
    nextPositions = prevStatus.activePositions.map((pos) => {
      const t = tickMap.get(pos.symbol);
      if (!t || t.price <= 0 || pos.currentPrice === t.price) return pos;
      changed = true;
      // In LIVE mode, let Binance API mark-price & exchange unRealizedProfit stay authoritative unless paper
      if (!pos.isPaper) {
        return {
          ...pos,
          currentPrice: t.price,
        };
      }
      const nextPnl =
        pos.side === 'LONG'
          ? (t.price - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - t.price) * pos.quantity;
      const nextPct = pos.marginUsed > 0 ? (nextPnl / pos.marginUsed) * 100 : 0;
      return {
        ...pos,
        currentPrice: t.price,
        unrealizedPnl: nextPnl,
        unrealizedPnlPercent: nextPct,
      };
    });
  }

  if (!changed) return prevStatus;

  return {
    ...prevStatus,
    marketTickers: nextTickers,
    lastMarketPreviewTime: Math.max(prevStatus.lastMarketPreviewTime || 0, Date.now()),
    ...(nextPositions ? { activePositions: nextPositions } : {}),
  };
}
