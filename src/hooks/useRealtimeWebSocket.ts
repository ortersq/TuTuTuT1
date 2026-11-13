import { useEffect, useRef, useState, useCallback } from 'react';
import { BotStatus } from '../server/botEngine';
import {
  BINANCE_WS_ENDPOINTS,
  WsConnectionPhase,
  buildBinanceCombinedStreamUrl,
  buildServerBotWsUrl,
  computeWsReconnectDelayMs,
  mergeWsTickersIntoStatus,
  parseBinanceWsTickerPayload,
} from '../utils/binanceWebSocket';

export interface RealtimeWsDiagnostics {
  serverWsPhase: WsConnectionPhase;
  binanceWsPhase: WsConnectionPhase;
  activeBinanceEndpoint: string;
  lastServerMessageAt: number | null;
  lastBinanceTickAt: number | null;
  binanceTickCount: number;
  reconnectAttempts: number;
}

interface UseRealtimeWebSocketOptions {
  isAuthenticated: boolean;
  authToken: string | null;
  monitoredSymbols: string[];
  preferVisionFallback: boolean;
  onStatusSnapshot: (status: BotStatus) => void;
  onStatusTickerPatch: (updater: (prev: BotStatus | null) => BotStatus | null) => void;
  onAuthExpired: () => void;
  onFallbackHttpFetch: () => Promise<void>;
}

/**
 * Dual-channel Real-Time WebSocket Connection Manager:
 * 1. Backend `/ws/bot-status` WebSocket for instant positions, equity, risk & log push (replacing 3s HTTP polling)
 * 2. Direct Binance Public Market WebSocket (`wss://fstream.binance.com/stream` -> `wss://data-stream.binance.vision/stream` failover)
 *    for sub-second ticker streaming, heartbeat watchdog & exponential-backoff auto-reconnect.
 */
export function useRealtimeWebSocket({
  isAuthenticated,
  authToken,
  monitoredSymbols,
  preferVisionFallback,
  onStatusSnapshot,
  onStatusTickerPatch,
  onAuthExpired,
  onFallbackHttpFetch,
}: UseRealtimeWebSocketOptions) {
  const [diagnostics, setDiagnostics] = useState<RealtimeWsDiagnostics>({
    serverWsPhase: 'DISCONNECTED',
    binanceWsPhase: 'DISCONNECTED',
    activeBinanceEndpoint: BINANCE_WS_ENDPOINTS[0],
    lastServerMessageAt: null,
    lastBinanceTickAt: null,
    binanceTickCount: 0,
    reconnectAttempts: 0,
  });

  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const serverCbRef = useRef(onStatusSnapshot);
  const patchCbRef = useRef(onStatusTickerPatch);
  const authExpiredRef = useRef(onAuthExpired);
  const fallbackFetchRef = useRef(onFallbackHttpFetch);
  serverCbRef.current = onStatusSnapshot;
  patchCbRef.current = onStatusTickerPatch;
  authExpiredRef.current = onAuthExpired;
  fallbackFetchRef.current = onFallbackHttpFetch;

  const reconnectAll = useCallback(() => {
    setReconnectTrigger((n) => n + 1);
  }, []);

  // Channel 1: Authoritative Backend WebSocket (/ws/bot-status) replacing 3s REST polling
  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      setDiagnostics((prev) => ({ ...prev, serverWsPhase: 'DISCONNECTED' }));
      return;
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

    const stopFallbackPoll = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const startFallbackPoll = () => {
      if (fallbackPollTimer) return;
      // Emergency degraded HTTP fallback ONLY while WS is down
      fallbackPollTimer = setInterval(() => {
        fallbackFetchRef.current().catch(() => {});
      }, 6000);
    };

    const connectServerWs = () => {
      if (disposed) return;
      const url = buildServerBotWsUrl(window.location.origin, authToken);
      setDiagnostics((prev) => ({
        ...prev,
        serverWsPhase: attempt === 0 ? 'CONNECTING' : 'RECONNECTING',
      }));

      try {
        ws = new WebSocket(url);
      } catch {
        startFallbackPoll();
        const delay = computeWsReconnectDelayMs(attempt++);
        reconnectTimer = setTimeout(connectServerWs, delay);
        return;
      }

      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        stopFallbackPoll();
        setDiagnostics((prev) => ({
          ...prev,
          serverWsPhase: 'CONNECTED',
        }));
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(String(event.data));
          if (payload?.status) {
            serverCbRef.current(payload.status as BotStatus);
            setDiagnostics((prev) => ({
              ...prev,
              serverWsPhase: 'CONNECTED',
              lastServerMessageAt: Date.now(),
            }));
          }
        } catch {
          // ignore malformed packet
        }
      };

      ws.onclose = (ev) => {
        if (disposed) return;
        if (ev.code === 1008 || ev.code === 4401) {
          authExpiredRef.current();
          return;
        }
        startFallbackPoll();
        const delay = computeWsReconnectDelayMs(attempt++);
        setDiagnostics((prev) => ({
          ...prev,
          serverWsPhase: 'RECONNECTING',
          reconnectAttempts: prev.reconnectAttempts + 1,
        }));
        reconnectTimer = setTimeout(connectServerWs, delay);
      };

      ws.onerror = () => {
        // Close handler manages reconnect & degraded fallback
      };
    };

    // Hydrate immediately via HTTP once on mount so zero frame delay while WS upgrades
    fallbackFetchRef.current().catch(() => {});
    connectServerWs();

    return () => {
      disposed = true;
      stopFallbackPoll();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [isAuthenticated, authToken, reconnectTrigger]);

  // Channel 2: Direct Binance Public Market WebSocket Stream with Failover & Stale Watchdog
  const symbolsKey = monitoredSymbols.join(',');

  useEffect(() => {
    if (!isAuthenticated || monitoredSymbols.length === 0) {
      setDiagnostics((prev) => ({ ...prev, binanceWsPhase: 'DISCONNECTED' }));
      return;
    }

    let disposed = false;
    let ws: WebSocket | null = null;
    let endpointIdx = preferVisionFallback ? 1 : 0;
    let attempt = 0;
    let lastTickMs = Date.now();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let pendingBatch: ReturnType<typeof parseBinanceWsTickerPayload> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPendingTicks = () => {
      flushTimer = null;
      if (disposed || pendingBatch.length === 0) return;
      const batch = pendingBatch;
      pendingBatch = [];
      patchCbRef.current((prev) => mergeWsTickersIntoStatus(prev, batch));
    };

    const connectBinanceWs = () => {
      if (disposed) return;
      const endpoint = BINANCE_WS_ENDPOINTS[endpointIdx % BINANCE_WS_ENDPOINTS.length];
      // Spot fallback endpoints (vision / stream.binance.com) only accept spot symbols
      const streamSymbols =
        endpointIdx === 0
          ? monitoredSymbols
          : monitoredSymbols.filter((s) => ['BTCUSDT', 'ETHUSDT'].includes(s.toUpperCase()));

      if (streamSymbols.length === 0) {
        setDiagnostics((prev) => ({
          ...prev,
          binanceWsPhase: 'FALLBACK_POLL',
          activeBinanceEndpoint: endpoint,
        }));
        return;
      }

      const url = buildBinanceCombinedStreamUrl(streamSymbols, endpoint);
      let receivedAnyTick = false;

      setDiagnostics((prev) => ({
        ...prev,
        binanceWsPhase: attempt === 0 ? 'CONNECTING' : 'RECONNECTING',
        activeBinanceEndpoint: endpoint,
      }));

      try {
        ws = new WebSocket(url);
      } catch {
        endpointIdx = (endpointIdx + 1) % BINANCE_WS_ENDPOINTS.length;
        const delay = computeWsReconnectDelayMs(attempt++, 1500, 20000);
        reconnectTimer = setTimeout(connectBinanceWs, delay);
        return;
      }

      ws.onopen = () => {
        if (disposed) return;
        lastTickMs = Date.now();
        attempt = 0;
        setDiagnostics((prev) => ({
          ...prev,
          binanceWsPhase: 'CONNECTED',
          activeBinanceEndpoint: endpoint,
        }));
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        const label =
          endpoint.includes('fstream')
            ? 'BINANCE_FAPI_WS'
            : endpoint.includes('vision')
            ? 'BINANCE_VISION_WS'
            : 'BINANCE_SPOT_WS';
        const parsed = parseBinanceWsTickerPayload(String(event.data), label);
        if (parsed.length === 0) return;

        receivedAnyTick = true;
        lastTickMs = Date.now();
        pendingBatch.push(...parsed);
        if (!flushTimer) {
          flushTimer = setTimeout(flushPendingTicks, 200);
        }

        setDiagnostics((prev) => ({
          ...prev,
          binanceWsPhase: 'CONNECTED',
          lastBinanceTickAt: lastTickMs,
          binanceTickCount: prev.binanceTickCount + parsed.length,
        }));
      };

      ws.onclose = () => {
        if (disposed) return;
        // If connection closed without ever streaming ticks, rotate to fallback endpoint (e.g. fstream 451 -> vision)
        if (!receivedAnyTick) {
          endpointIdx = (endpointIdx + 1) % BINANCE_WS_ENDPOINTS.length;
        }
        const delay = computeWsReconnectDelayMs(attempt++, 1500, 20000);
        setDiagnostics((prev) => ({
          ...prev,
          binanceWsPhase: 'RECONNECTING',
          reconnectAttempts: prev.reconnectAttempts + 1,
        }));
        reconnectTimer = setTimeout(connectBinanceWs, delay);
      };

      ws.onerror = () => {
        // Close handler manages clean failover & backoff reconnect
      };
    };

    connectBinanceWs();

    // Watchdog: recycle stale Binance stream if no ticks arrive for 30s
    watchdogTimer = setInterval(() => {
      if (disposed || !ws) return;
      if (ws.readyState === WebSocket.OPEN && Date.now() - lastTickMs > 30_000) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }, 10_000);

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (flushTimer) clearTimeout(flushTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [isAuthenticated, symbolsKey, preferVisionFallback, reconnectTrigger]);

  return {
    wsDiagnostics: diagnostics,
    reconnectAllWs: reconnectAll,
  };
}
