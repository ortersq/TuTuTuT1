import type { ActivePosition, BotTradeRecord, LiveEquityPoint } from '../server/botEngine';
import { LiveAccountSyncInfo, StrategyKey } from '../types/trading';

export interface ParsedBinanceAccount {
  walletBalance: number;
  availableBalance: number;
  marginBalance: number;
  unrealizedProfit: number;
  positionInitialMargin: number;
}

export function parseBinanceAccountResponse(acctData: any): ParsedBinanceAccount {
  const walletBalance =
    parseFloat(acctData?.totalWalletBalance ?? acctData?.totalCrossWalletBalance ?? '0') || 0;
  const availableBalance =
    parseFloat(acctData?.availableBalance ?? acctData?.maxWithdrawAmount ?? '0') || 0;
  const unrealizedProfit = parseFloat(acctData?.totalUnrealizedProfit ?? '0') || 0;
  const rawMarginBalance = parseFloat(acctData?.totalMarginBalance ?? '0') || 0;
  const marginBalance =
    rawMarginBalance > 0 ? rawMarginBalance : Math.max(0, walletBalance + unrealizedProfit);
  const positionInitialMargin = parseFloat(acctData?.totalPositionInitialMargin ?? '0') || 0;

  return {
    walletBalance: Number(walletBalance.toFixed(4)),
    availableBalance: Number(availableBalance.toFixed(4)),
    marginBalance: Number(marginBalance.toFixed(4)),
    unrealizedProfit: Number(unrealizedProfit.toFixed(4)),
    positionInitialMargin: Number(positionInitialMargin.toFixed(4)),
  };
}

export function formatShortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * Reconstruct real historical wallet equity points from Binance /fapi/v1/income records
 * anchored cleanly to the current live Binance wallet balance and unrealized PnL.
 * Never fabricates artificial returns when no income history exists.
 */
export function reconstructLiveEquityHistoryFromIncome(
  incomes: any[],
  account: ParsedBinanceAccount,
  activePositionsCount: number,
  now: number = Date.now()
): LiveEquityPoint[] {
  const safeIncomes = Array.isArray(incomes)
    ? incomes
        .map((item) => ({
          time: Number(item?.time) || 0,
          income: parseFloat(item?.income ?? '0') || 0,
        }))
        .filter((item) => item.time > 0 && Number.isFinite(item.income))
        .sort((a, b) => a.time - b.time)
    : [];

  const points: LiveEquityPoint[] = [];

  if (safeIncomes.length > 0) {
    // Anchor at current real walletBalance and step backward across real cashflows
    const historicalWalletBalances: number[] = new Array(safeIncomes.length);
    let runningWallet = account.walletBalance;
    for (let i = safeIncomes.length - 1; i >= 0; i--) {
      historicalWalletBalances[i] = Math.max(0, Number(runningWallet.toFixed(2)));
      runningWallet -= safeIncomes[i].income;
    }

    // Group events that share almost identical timestamps (e.g. fill commission + realized pnl)
    for (let i = 0; i < safeIncomes.length; i++) {
      const ts = safeIncomes[i].time;
      const eq = historicalWalletBalances[i];
      const pt: LiveEquityPoint = {
        timestamp: ts,
        time: formatShortTime(ts),
        equity: eq,
        balance: eq,
        unrealizedPnl: 0,
        activePositionsCount: 0,
      };
      const prev = points[points.length - 1];
      if (prev && Math.abs(ts - prev.timestamp) < 2000) {
        points[points.length - 1] = pt;
      } else {
        points.push(pt);
      }
    }
  }

  // Always append the authoritative live snapshot at `now`
  const livePoint: LiveEquityPoint = {
    timestamp: now,
    time: formatShortTime(now),
    equity: Number(account.marginBalance.toFixed(2)),
    balance: Number(account.availableBalance.toFixed(2)),
    unrealizedPnl: Number(account.unrealizedProfit.toFixed(2)),
    activePositionsCount,
  };

  const lastPoint = points[points.length - 1];
  if (lastPoint && Math.abs(now - lastPoint.timestamp) < 1500) {
    points[points.length - 1] = livePoint;
  } else {
    points.push(livePoint);
  }

  return points.slice(-180);
}

/**
 * Parse real Binance Futures /fapi/v2/positionRisk & open orders into ActivePosition[].
 */
export function parseBinanceOpenPositions(
  posList: any[],
  openOrders: any[],
  openAlgoOrders: any[],
  existingPositions: ActivePosition[],
  fallbackLeverage: number,
  now: number = Date.now()
): ActivePosition[] {
  if (!Array.isArray(posList)) return [];
  const realOpen = posList.filter((p) => Math.abs(parseFloat(p?.positionAmt || '0')) > 0);
  const combinedOrders = [
    ...(Array.isArray(openOrders) ? openOrders : []),
    ...(Array.isArray(openAlgoOrders) ? openAlgoOrders : []),
  ];

  return realOpen.map((rp) => {
    const amt = parseFloat(rp.positionAmt || '0');
    const qty = Math.abs(amt);
    const side: 'LONG' | 'SHORT' = amt > 0 ? 'LONG' : 'SHORT';
    const entryPrice = parseFloat(rp.entryPrice || '0') || 0;
    const markPrice = parseFloat(rp.markPrice || rp.entryPrice || '0') || entryPrice;
    const unRealizedProfit = parseFloat(rp.unRealizedProfit || '0') || 0;
    const lev = parseInt(rp.leverage || String(fallbackLeverage), 10) || fallbackLeverage;
    const liqPrice = parseFloat(rp.liquidationPrice || '0') || 0;
    const rawMargin =
      parseFloat(rp.isolatedMargin || rp.initialMargin || '0') ||
      (entryPrice * qty) / Math.max(1, lev);

    const symOrders = combinedOrders.filter(
      (o) => o && o.symbol === rp.symbol && (!o.positionSide || o.positionSide === 'BOTH' || o.positionSide === side)
    );
    const slOrder = symOrders.find(
      (o) => o.type === 'STOP_MARKET' || o.type === 'STOP' || o.orderType === 'STOP_MARKET'
    );
    const tpOrder = symOrders.find(
      (o) =>
        o.type === 'TAKE_PROFIT_MARKET' ||
        o.type === 'TAKE_PROFIT' ||
        o.orderType === 'TAKE_PROFIT_MARKET'
    );

    const existingLocal = existingPositions.find(
      (p) => p.symbol === rp.symbol && p.side === side && !p.isPaper
    );
    const parsedSlPrice = slOrder ? parseFloat(slOrder.stopPrice || slOrder.triggerPrice || '0') : NaN;
    const parsedTpPrice = tpOrder ? parseFloat(tpOrder.stopPrice || tpOrder.triggerPrice || '0') : NaN;

    const stopLossPrice =
      Number.isFinite(parsedSlPrice) && parsedSlPrice > 0
        ? parsedSlPrice
        : existingLocal?.stopLossPrice ?? null;
    const takeProfitPrice =
      Number.isFinite(parsedTpPrice) && parsedTpPrice > 0
        ? parsedTpPrice
        : existingLocal?.takeProfitPrice ?? null;

    const stopLossOrderId = slOrder
      ? String(slOrder.orderId || slOrder.algoId || '')
      : existingLocal?.stopLossOrderId;
    const takeProfitOrderId = tpOrder
      ? String(tpOrder.orderId || tpOrder.algoId || '')
      : existingLocal?.takeProfitOrderId;

    const pnlPct = rawMargin > 0 ? (unRealizedProfit / rawMargin) * 100 : 0;
    const prevPeak = existingLocal?.peakPnlUsdt ?? unRealizedProfit;

    return {
      id: existingLocal?.id || `live_${rp.symbol}_${rp.updateTime || now}`,
      symbol: rp.symbol,
      interval: existingLocal?.interval || 'LIVE',
      side,
      patternType: existingLocal?.patternType || 'LIVE_EXCHANGE_SYNC',
      patternName: existingLocal?.patternName || '币安实盘真实持仓',
      patternCategory: existingLocal?.patternCategory || '交易所实盘同步',
      entryTime: existingLocal?.entryTime || Number(rp.updateTime) || now,
      entryPrice,
      currentPrice: markPrice,
      quantity: qty,
      leverage: lev,
      marginUsed: Number(rawMargin.toFixed(4)),
      unrealizedPnl: Number(unRealizedProfit.toFixed(4)),
      unrealizedPnlPercent: Number(pnlPct.toFixed(2)),
      peakPnlUsdt: Math.max(prevPeak, unRealizedProfit),
      stopLossPrice,
      takeProfitPrice,
      trailingPeakPrice:
        existingLocal?.trailingPeakPrice ||
        (side === 'LONG' ? Math.max(entryPrice, markPrice) : Math.min(entryPrice, markPrice)),
      trailingStopPrice: existingLocal?.trailingStopPrice ?? null,
      isTrailingActive: existingLocal?.isTrailingActive ?? false,
      liquidationPrice: liqPrice,
      strategyUsed: existingLocal?.strategyUsed || ('pattern_price_action' as StrategyKey),
      binanceOrderId: existingLocal?.binanceOrderId,
      stopLossOrderId: stopLossOrderId || undefined,
      takeProfitOrderId: takeProfitOrderId || undefined,
      isPaper: false,
    };
  });
}

/**
 * Parse real Binance /fapi/v1/userTrades and /fapi/v1/income into genuine closed trade history.
 * Avoids synthetic hardcoded % returns (like fake 2.5% / -1.5%).
 */
export function parseBinanceRealClosedTrades(
  incomes: any[],
  userTrades: any[],
  fallbackLeverage: number
): BotTradeRecord[] {
  const safeTrades = Array.isArray(userTrades) ? userTrades : [];
  const closingTrades = safeTrades.filter((t) => {
    const rp = parseFloat(t?.realizedPnl ?? '0');
    return Number.isFinite(rp) && Math.abs(rp) > 1e-8 && t?.symbol;
  });

  if (closingTrades.length > 0) {
    // Group fills occurring within 2s on the same symbol & orderId
    const byOrder = new Map<string, any[]>();
    for (const t of closingTrades) {
      const key = `${t.symbol}_${t.orderId || t.time}`;
      const list = byOrder.get(key) || [];
      list.push(t);
      byOrder.set(key, list);
    }

    const records: BotTradeRecord[] = [];
    for (const [key, fills] of byOrder.entries()) {
      const first = fills[0];
      const qty = fills.reduce((s, f) => s + (parseFloat(f.qty || '0') || 0), 0);
      const quoteQty = fills.reduce((s, f) => s + (parseFloat(f.quoteQty || '0') || 0), 0);
      const avgExit = qty > 0 ? quoteQty / qty : parseFloat(first.price || '0') || 0;
      const realized = fills.reduce((s, f) => s + (parseFloat(f.realizedPnl || '0') || 0), 0);
      const commission = fills.reduce(
        (s, f) => s + (f.commissionAsset === 'USDT' ? parseFloat(f.commission || '0') || 0 : 0),
        0
      );
      const netPnl = realized - commission;
      const marginUsed =
        quoteQty > 0 ? quoteQty / Math.max(1, fallbackLeverage) : Math.abs(netPnl);
      const pnlPercent = marginUsed > 0 ? (netPnl / marginUsed) * 100 : 0;
      const exitTime = Math.max(...fills.map((f) => Number(f.time) || 0)) || Date.now();
      // If closing fill side is SELL -> position closed was LONG; if BUY -> SHORT
      const side: 'LONG' | 'SHORT' = first.side === 'SELL' ? 'LONG' : 'SHORT';

      records.push({
        id: `binance_fill_${key}`,
        symbol: String(first.symbol),
        interval: 'LIVE',
        side,
        patternType: 'LIVE_EXCHANGE_HISTORY',
        patternName: '币安实盘真实成交',
        entryTime: exitTime,
        exitTime,
        entryPrice: 0,
        exitPrice: Number(avgExit.toFixed(4)),
        quantity: Number(qty.toFixed(6)),
        leverage: fallbackLeverage,
        marginUsed: Number(marginUsed.toFixed(2)),
        netPnl: Number(netPnl.toFixed(4)),
        pnlPercent: Number(pnlPercent.toFixed(2)),
        peakPnlUsdt: Math.max(0, Number(netPnl.toFixed(2))),
        reversionUsdt: 0,
        volatilityLevel: 'NORMAL',
        exitReason: netPnl >= 0 ? 'TAKE_PROFIT' : 'STOP_LOSS',
        strategyUsed: 'pattern_price_action',
        isPaper: false,
      });
    }

    return records.sort((a, b) => a.exitTime - b.exitTime).slice(-50);
  }

  // Fallback to REALIZED_PNL income events if userTrades wasn't available
  if (!Array.isArray(incomes)) return [];
  return incomes
    .filter((item) => item && item.symbol && item.incomeType === 'REALIZED_PNL')
    .map((item, idx) => {
      const pnl = parseFloat(item.income || '0') || 0;
      const tTime = Number(item.time) || Date.now();
      return {
        id: `binance_inc_${item.tranId || idx}_${tTime}`,
        symbol: String(item.symbol),
        interval: 'LIVE',
        side: 'LONG' as const,
        patternType: 'LIVE_EXCHANGE_HISTORY',
        patternName: '币安实盘已实现盈亏',
        entryTime: tTime,
        exitTime: tTime,
        entryPrice: 0,
        exitPrice: 0,
        quantity: 0,
        leverage: fallbackLeverage,
        marginUsed: 0,
        netPnl: Number(pnl.toFixed(4)),
        pnlPercent: 0,
        peakPnlUsdt: Math.max(0, Number(pnl.toFixed(2))),
        reversionUsdt: 0,
        volatilityLevel: 'NORMAL' as const,
        exitReason: (pnl >= 0 ? 'TAKE_PROFIT' : 'STOP_LOSS') as BotTradeRecord['exitReason'],
        strategyUsed: 'pattern_price_action' as StrategyKey,
        isPaper: false,
      };
    })
    .slice(-50);
}

export function buildLiveSyncInfo(
  parsed: ParsedBinanceAccount,
  openPositionsCount: number,
  now: number = Date.now()
): LiveAccountSyncInfo {
  return {
    syncedAt: now,
    syncOk: true,
    walletBalance: parsed.walletBalance,
    availableBalance: parsed.availableBalance,
    marginBalance: parsed.marginBalance,
    unrealizedProfit: parsed.unrealizedProfit,
    positionInitialMargin: parsed.positionInitialMargin,
    openPositionsCount,
    equitySource: 'BINANCE_LIVE_API',
  };
}
