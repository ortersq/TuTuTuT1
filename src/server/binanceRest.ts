/**
 * Binance USDT-M Futures REST client with real request-weight accounting.
 *
 * Why this file exists:
 *  - The previous code called `fetch` directly from the engine and treated ANY failure
 *    (429 / -1003 / timeout / HTML error page) as an empty result set. For `/fapi/v2/positionRisk`
 *    that meant "the exchange says you have no positions", which the engine interpreted as
 *    "all my positions were closed on the exchange" and booked fabricated trades.
 *  - It also polled `openOrders` / `openAlgoOrders` without a symbol (weight 40 each) every 5s,
 *    which alone is ~1000 weight/min against a 2400/min IP cap.
 *
 * Rules enforced here:
 *  1. A failed request throws `BinanceApiError`. Callers must NEVER substitute `[]`.
 *  2. Every request is weight-budgeted against a rolling 60s window before it is sent.
 *  3. 429 / 418 / -1003 set an absolute cool-down (`rateLimitedUntil`); no request is sent
 *     until it expires, so the IP ban cannot be extended by our own polling.
 *  4. Signed requests use a server-time offset (fixes -1021 on drifting VPS clocks).
 *  5. Hard 12s timeout on every call, so `syncInFlight` can never wedge forever.
 */

import crypto from 'crypto';

export class BinanceApiError extends Error {
  code?: number;
  status?: number;
  retryAfterMs?: number;
  isRateLimit: boolean;

  constructor(
    message: string,
    opts: { code?: number; status?: number; retryAfterMs?: number; isRateLimit?: boolean } = {}
  ) {
    super(message);
    this.name = 'BinanceApiError';
    this.code = opts.code;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.isRateLimit = Boolean(opts.isRateLimit);
  }
}

export interface BinanceRestStats {
  usedWeight1m: number;
  budgetedWeight1m: number;
  requestsLastMinute: number;
  rateLimitedUntil: number;
  lastRequestAt: number;
  algoOrdersSupported: boolean | null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
  params?: Record<string, string | number | boolean | undefined>;
  signed?: boolean;
  weight: number;
  /** Skip the pre-flight budget check (only for the time-sync probe). */
  ignoreBudget?: boolean;
}

const WEIGHT_WINDOW_MS = 60_000;
const SOFT_BUDGET_LIMIT = 1900; // stop adding load well before the hard 2400/min cap
const HARD_TIMEOUT_MS = 12_000;

export class BinanceFuturesRest {
  private weightLog: Array<{ at: number; weight: number }> = [];
  private serverTimeOffsetMs = 0;
  private lastTimeSyncAt = 0;
  private serverReportedUsedWeight = 0;
  private lastServerWeightAt = 0;
  private rateLimitedUntil = 0;
  private lastRequestAt = 0;
  private algoOrdersSupported: boolean | null = null;

  constructor(
    private readonly getBaseUrl: () => string,
    private readonly getApiKey: () => string,
    private readonly getApiSecret: () => string,
    private readonly onNotice?: (level: 'warn' | 'error' | 'info', message: string) => void
  ) {}

  // ------------------------------------------------------------------ public helpers

  public isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  public getRateLimitRemainingMs(): number {
    return Math.max(0, this.rateLimitedUntil - Date.now());
  }

  public getStats(): BinanceRestStats {
    this.pruneWeights();
    return {
      usedWeight1m: this.currentUsedWeight(),
      budgetedWeight1m: this.budgetedWeight(),
      requestsLastMinute: this.weightLog.length,
      rateLimitedUntil: this.rateLimitedUntil,
      lastRequestAt: this.lastRequestAt,
      algoOrdersSupported: this.algoOrdersSupported,
    };
  }

  /**
   * Estimated headroom before we would cross the soft budget. Used by the engine to decide
   * whether an optional (history) sync is affordable right now.
   */
  public canAfford(weight: number): boolean {
    if (this.isRateLimited()) return false;
    return this.currentUsedWeight() + this.budgetedWeight() + weight <= SOFT_BUDGET_LIMIT;
  }

  // ------------------------------------------------------------------ core request

  private pruneWeights(): void {
    const cutoff = Date.now() - WEIGHT_WINDOW_MS;
    while (this.weightLog.length > 0 && this.weightLog[0].at < cutoff) this.weightLog.shift();
  }

  private budgetedWeight(): number {
    const cutoff = Date.now() - WEIGHT_WINDOW_MS;
    return this.weightLog.reduce((s, w) => (w.at >= cutoff ? s + w.weight : s), 0);
  }

  private currentUsedWeight(): number {
    // Binance's own counter is authoritative when available and recent.
    if (this.lastServerWeightAt > 0 && Date.now() - this.lastServerWeightAt < WEIGHT_WINDOW_MS) {
      return Math.max(this.serverReportedUsedWeight, this.budgetedWeight());
    }
    return this.budgetedWeight();
  }

  private async ensureServerTime(): Promise<void> {
    if (Date.now() - this.lastTimeSyncAt < 300_000) return;
    this.lastTimeSyncAt = Date.now();
    try {
      const resp = await fetch(`${this.getBaseUrl()}/fapi/v1/time`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!resp.ok) return;
      const data: any = await resp.json().catch(() => ({}));
      const serverTime = Number(data?.serverTime);
      if (Number.isFinite(serverTime) && serverTime > 0) {
        this.serverTimeOffsetMs = serverTime - Date.now();
      }
    } catch {
      // keep previous offset; a wrong offset only costs one -1021 retry
    }
  }

  private async waitForBudget(weight: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const used = this.currentUsedWeight();
      if (used + weight <= SOFT_BUDGET_LIMIT) return;
      // Wait until enough of the rolling window has expired.
      const oldest = this.weightLog[0];
      const waitMs = oldest ? Math.max(200, Math.min(2_000, oldest.at + WEIGHT_WINDOW_MS - Date.now())) : 500;
      await new Promise((r) => setTimeout(r, waitMs));
      this.pruneWeights();
    }
    throw new BinanceApiError(
      `本地请求权重预算已用尽 (${this.currentUsedWeight()}/${SOFT_BUDGET_LIMIT} per min)，已主动跳过本次请求以保护 IP 配额`,
      { isRateLimit: true, retryAfterMs: 15_000 }
    );
  }

  private registerWeight(weight: number): void {
    this.weightLog.push({ at: Date.now(), weight });
    if (this.weightLog.length > 600) this.weightLog.shift();
  }

  private applyRateLimitFromResponse(resp: Response, body: any): void {
    const usedWeight = Number(resp.headers.get('x-mbx-used-weight-1m'));
    if (Number.isFinite(usedWeight) && usedWeight > 0) {
      this.serverReportedUsedWeight = usedWeight;
      this.lastServerWeightAt = Date.now();
    }
    const status = resp.status;
    const code = Number(body?.code);
    const isRateLimited = status === 429 || status === 418 || code === -1003;
    if (!isRateLimited) return;

    const retryAfterHeader = resp.headers.get('retry-after');
    const parsedRetry = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    // 418 = IP already banned by Binance: back off hard, otherwise the ban escalates.
    const fallback = status === 418 ? 180_000 : 45_000;
    const retryAfterMs = Number.isFinite(parsedRetry) && parsedRetry > 0 ? parsedRetry : fallback;
    const until = Date.now() + retryAfterMs;
    const extended = until > this.rateLimitedUntil;
    this.rateLimitedUntil = Math.max(this.rateLimitedUntil, until);

    if (extended && this.onNotice) {
      this.onNotice(
        'warn',
        `⏳ [币安限频熔断] 触发 IP 权重上限 (${status}${code ? ` / ${code}` : ''})，已暂停所有交易所请求 ${Math.ceil(
          retryAfterMs / 1000
        )} 秒，避免 IP 被封禁`
      );
    }
  }

  public async request<T = any>(path: string, options: RequestOptions): Promise<T> {
    const { method = 'GET', params = {}, signed = false, weight } = options;

    if (this.isRateLimited()) {
      const remainSec = Math.ceil(this.getRateLimitRemainingMs() / 1000);
      throw new BinanceApiError(`币安接口处于限频冷却中，还需等待 ${remainSec} 秒`, {
        isRateLimit: true,
        retryAfterMs: this.getRateLimitRemainingMs(),
      });
    }
    if (!options.ignoreBudget) await this.waitForBudget(weight);

    let query = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');

    if (signed) {
      await this.ensureServerTime();
      const timestamp = Date.now() + this.serverTimeOffsetMs;
      query = `${query ? `${query}&` : ''}timestamp=${timestamp}&recvWindow=10000`;
      const signature = crypto.createHmac('sha256', this.getApiSecret()).update(query).digest('hex');
      query = `${query}&signature=${signature}`;
    }

    const url = `${this.getBaseUrl()}${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (signed) headers['X-MBX-APIKEY'] = this.getApiKey();

    this.registerWeight(weight);
    this.lastRequestAt = Date.now();

    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(HARD_TIMEOUT_MS),
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new BinanceApiError(
        isTimeout ? `币安接口请求超时 (${method} ${path})` : `币安接口网络异常 (${method} ${path}): ${err?.message || err}`,
        { status: 0 }
      );
    }

    const text = await resp.text().catch(() => '');
    let body: any = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    this.applyRateLimitFromResponse(resp, body);

    if (!resp.ok) {
      const code = Number(body?.code);
      const msg = body?.msg || text.slice(0, 180) || `HTTP ${resp.status}`;
      const rateLimited = body?.code === -1003 || resp.status === 429 || resp.status === 418;
      throw new BinanceApiError(`币安接口返回错误 [${Number.isFinite(code) ? code : resp.status}] ${msg}`, {
        code: Number.isFinite(code) ? code : undefined,
        status: resp.status,
        isRateLimit: rateLimited,
        retryAfterMs: rateLimited ? this.getRateLimitRemainingMs() : undefined,
      });
    }

    if (body === null) {
      throw new BinanceApiError(`币安接口返回了无法解析的内容 (${method} ${path})`, { status: resp.status });
    }
    return body as T;
  }

  // ------------------------------------------------------------------ account & positions

  public account(): Promise<any> {
    return this.request('/fapi/v2/account', { signed: true, weight: 5 });
  }

  public positionRisk(): Promise<any[]> {
    return this.request<any[]>('/fapi/v2/positionRisk', { signed: true, weight: 5 });
  }

  public openOrders(symbol: string): Promise<any[]> {
    return this.request<any[]>('/fapi/v1/openOrders', {
      signed: true,
      params: { symbol },
      weight: 1,
    });
  }

  /**
   * Conditional orders may live in the Algo book on newer Binance deployments.
   * A 404 / "not supported" simply disables this probe for the rest of the process.
   */
  public async openAlgoOrders(symbol: string): Promise<any[]> {
    if (this.algoOrdersSupported === false) return [];
    try {
      const data = await this.request<any[]>('/fapi/v1/openAlgoOrders', {
        signed: true,
        params: { symbol },
        weight: 1,
      });
      this.algoOrdersSupported = true;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      const e = err as BinanceApiError;
      if (e.status === 404 || e.code === -1121 || e.code === -4120 || /not supported|Invalid request/i.test(e.message)) {
        this.algoOrdersSupported = false;
        return [];
      }
      throw err;
    }
  }

  public positionMode(): Promise<any> {
    return this.request('/fapi/v1/positionSide/dual', { signed: true, weight: 30 });
  }

  public income(limit: number = 100): Promise<any[]> {
    return this.request<any[]>('/fapi/v1/income', { signed: true, params: { limit }, weight: 30 });
  }

  public userTrades(symbol: string, limit: number = 50): Promise<any[]> {
    return this.request<any[]>('/fapi/v1/userTrades', {
      signed: true,
      params: { symbol, limit },
      weight: 5,
    });
  }

  public setLeverage(symbol: string, leverage: number): Promise<any> {
    return this.request('/fapi/v1/leverage', {
      method: 'POST',
      signed: true,
      params: { symbol, leverage },
      weight: 1,
    });
  }

  // ------------------------------------------------------------------ trading

  public placeOrder(params: Record<string, string | number | boolean | undefined>): Promise<any> {
    return this.request('/fapi/v1/order', { method: 'POST', signed: true, params, weight: 1 });
  }

  /**
   * Conditional (TP/SL) orders are placed through the Algo service on current Binance builds.
   * IP weight is 0 for this endpoint, which is why it is the preferred path.
   */
  public placeAlgoOrder(params: Record<string, string | number | boolean | undefined>): Promise<any> {
    return this.request('/fapi/v1/algoOrder', { method: 'POST', signed: true, params, weight: 0 });
  }

  public cancelOrder(symbol: string, orderId: string): Promise<any> {
    return this.request('/fapi/v1/order', {
      method: 'DELETE',
      signed: true,
      params: { symbol, orderId },
      weight: 1,
    });
  }

  /**
   * Cancel one Algo conditional order.
   * Binance's signature is `DELETE /fapi/v1/algoOrder` with **algoId only** — sending `symbol`
   * as well is rejected with `-1106 Parameter 'symbol' sent when not required`, which silently
   * left every stale stop alive. Do not add symbol here.
   */
  public cancelAlgoOrder(algoId: string): Promise<any> {
    return this.request('/fapi/v1/algoOrder', {
      method: 'DELETE',
      signed: true,
      params: { algoId },
      weight: 1,
    });
  }

  /** Cancel every open Algo conditional order for a symbol in one call. */
  public cancelAllAlgoOpenOrders(symbol: string): Promise<any> {
    return this.request('/fapi/v1/algoOpenOrders', {
      method: 'DELETE',
      signed: true,
      params: { symbol },
      weight: 1,
    });
  }

  public cancelAllOpenOrders(symbol: string): Promise<any> {
    return this.request('/fapi/v1/allOpenOrders', {
      method: 'DELETE',
      signed: true,
      params: { symbol },
      weight: 1,
    });
  }

  /** Cheap liveness probe used by the UI sync after an explicit user action. */
  public ping(): Promise<any> {
    return this.request('/fapi/v1/ping', { weight: 1, ignoreBudget: true });
  }
}
