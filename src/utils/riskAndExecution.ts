import {
  MarketCorrelationMetrics,
  PortfolioBasketConfig,
  PortfolioBasketState,
  SymbolExchangeRules,
} from '../types/trading';

export interface ScanVolatilitySnapshot {
  symbol: string;
  currentPrice: number;
  atr: number;
  baselineAtrPercent?: number;
  signal: 1 | -1 | 0;
}

export const LOCKED_TARGET_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'XAUUSDT',
  'NVDAUSDT',
  'CLUSDT',
] as const;

export function normalizeLockedSymbol(rawSymbol: string): string | null {
  const clean = String(rawSymbol || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  const normalized = clean.endsWith('USDT') ? clean : `${clean}USDT`;
  return (LOCKED_TARGET_SYMBOLS as readonly string[]).includes(normalized) ? normalized : null;
}

export interface DynamicSizingInput {
  symbol: string;
  availableBalance: number;
  totalEquity: number;
  activeMarginUsedTotal?: number;
  maxTotalMarginRatio?: number;
  currentPrice: number;
  leverage: number;
  basePositionPercent: number;
  learningMultiplier: number;
  portfolioExposureMultiplier: number;
  symbolWeightMultiplier?: number;
  stopLossPrice: number | null;
  riskPerTradePercent?: number;
  rules?: SymbolExchangeRules;
}

export interface DynamicSizingResult {
  canOpen: boolean;
  quantity: number;
  allocatedMargin: number;
  allocatedEquityPercent: number;
  notional: number;
  estimatedFee: number;
  effectiveLeverage: number;
  actualRiskUsd: number;
  actualRiskPercent: number;
  reason: string;
}

export function countStepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 3;
  const s = step.toString();
  if (s.includes('e-')) {
    const exp = parseInt(s.split('e-')[1], 10);
    return Number.isFinite(exp) ? exp : 3;
  }
  const parts = s.split('.');
  return parts.length > 1 ? parts[1].length : 0;
}

export function formatToStep(
  value: number,
  stepSize: number,
  mode: 'floor' | 'round' | 'ceil' = 'floor'
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(stepSize) || stepSize <= 0) return value;
  const decimals = countStepDecimals(stepSize);
  const ratio = value / stepSize;
  let steps = 0;
  if (mode === 'ceil') steps = Math.ceil(ratio - 1e-12);
  else if (mode === 'round') steps = Math.round(ratio);
  else steps = Math.floor(ratio + 1e-12);
  return Number((steps * stepSize).toFixed(decimals));
}

/**
 * Rewritten live-equity-anchored dynamic position sizing:
 * 1. Allocates dynamic % of real totalEquity (totalMarginBalance) instead of shrinking availableBalance.
 * 2. Reserves >=22% of totalEquity as free margin buffer (respecting activeMarginUsedTotal) to avoid liquidation cascades.
 * 3. Enforces a HARD single-trade max loss ceiling (riskPerTradePercent of totalEquity) derived from stopLossPrice distance.
 * 4. Strictly aligns to exchange minQty / stepSize / minNotional without ever breaching risk caps.
 */
export function computeDynamicSmallCapitalSizing(
  input: DynamicSizingInput
): DynamicSizingResult {
  const {
    symbol,
    availableBalance,
    totalEquity,
    activeMarginUsedTotal = 0,
    maxTotalMarginRatio = 0.78,
    currentPrice,
    leverage,
    basePositionPercent,
    learningMultiplier,
    portfolioExposureMultiplier,
    symbolWeightMultiplier = 1.0,
    stopLossPrice,
    riskPerTradePercent = 2.0,
    rules,
  } = input;

  const reject = (reason: string, lev: number = leverage): DynamicSizingResult => ({
    canOpen: false,
    quantity: 0,
    allocatedMargin: 0,
    allocatedEquityPercent: 0,
    notional: 0,
    estimatedFee: 0,
    effectiveLeverage: lev,
    actualRiskUsd: 0,
    actualRiskPercent: 0,
    reason,
  });

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return reject(`${symbol} 当前行情价格无效`);
  }

  const effectiveEquity =
    Number.isFinite(totalEquity) && totalEquity > 0 ? totalEquity : Math.max(0, availableBalance);

  if (effectiveEquity < 5 || !Number.isFinite(availableBalance) || availableBalance < 3) {
    return reject(
      `实盘总资产 ($${effectiveEquity.toFixed(2)}) 或可用保证金 ($${availableBalance.toFixed(
        2
      )}) 低于安全交易底线`
    );
  }

  const effectiveLev = Math.max(1, Math.min(20, Math.round(leverage)));
  const minQty =
    rules?.minQty ?? (symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 0.001 : 0.1);
  const stepSize = rules?.stepSize ?? minQty;
  const minNotional =
    rules?.minNotional ?? (symbol.startsWith('BTC') ? 100 : symbol.startsWith('ETH') ? 20 : 5);

  // Portfolio-wide margin utilization guard: keep >=22% equity unallocated buffer
  const maxPortfolioMargin = effectiveEquity * Math.min(0.85, Math.max(0.4, maxTotalMarginRatio));
  const remainingMarginBudget = Math.max(0, maxPortfolioMargin - Math.max(0, activeMarginUsedTotal));
  const usableMargin = Math.min(availableBalance * 0.88, remainingMarginBudget);

  if (usableMargin < 2.5) {
    return reject(
      `账户总保证金占用已接近安全上限 (已用 $${activeMarginUsedTotal.toFixed(
        2
      )} / 总净值 $${effectiveEquity.toFixed(2)})，保留流动性防爆仓`,
      effectiveLev
    );
  }

  // Step 1: Dynamic equity % allocation (totalEquity-anchored)
  const clampedPct = Math.min(30, Math.max(5, basePositionPercent));
  const combinedMult = Math.max(
    0.35,
    Math.min(1.4, learningMultiplier * portfolioExposureMultiplier * symbolWeightMultiplier)
  );
  const isSmallCapital = effectiveEquity <= 500;
  const singlePosCapRatio = isSmallCapital ? 0.42 : 0.28;
  const equityAllocatedMargin = effectiveEquity * (clampedPct / 100) * combinedMult;

  // Step 2: HARD single-trade max risk ceiling based on real Stop-Loss distance
  const clampedRiskPct = Math.min(5.0, Math.max(0.5, riskPerTradePercent));
  let slDistPct = 0.015; // conservative default 1.5% if SL not explicitly set
  if (stopLossPrice && stopLossPrice > 0) {
    slDistPct = Math.abs(currentPrice - stopLossPrice) / currentPrice;
  }
  const effectiveSlDist = Math.max(0.004, slDistPct);
  const maxRiskUsdt = effectiveEquity * (clampedRiskPct / 100);
  const maxNotionalByRisk = maxRiskUsdt / effectiveSlDist;
  const riskCapMargin = maxNotionalByRisk / effectiveLev;

  // Strict min across equity allocation, per-position concentration cap, hard SL risk cap, and remaining free budget
  let targetMargin = Math.min(
    equityAllocatedMargin,
    effectiveEquity * singlePosCapRatio,
    riskCapMargin,
    usableMargin
  );
  let targetNotional = targetMargin * effectiveLev;

  // Step 3: Check exchange minNotional without violating hard risk ceiling
  const requiredMinNotional = Math.max(minNotional * 1.05, minQty * currentPrice);
  const hardSlRiskFloorPct = isSmallCapital ? Math.max(clampedRiskPct * 1.75, 4.5) : clampedRiskPct * 1.35;
  const hardMaxRiskUsdt = effectiveEquity * (hardSlRiskFloorPct / 100);

  if (targetNotional < requiredMinNotional) {
    const neededMargin = requiredMinNotional / effectiveLev;
    const neededFee = requiredMinNotional * 0.0006;
    const minNotionalSlLossUsdt = requiredMinNotional * effectiveSlDist;

    if (neededMargin + neededFee > usableMargin) {
      return reject(
        `可用安全预算 ($${usableMargin.toFixed(2)} USDT) 不足 ${symbol} 最低交易所门槛 $${minNotional} (${effectiveLev}x 需 $${neededMargin.toFixed(2)})`,
        effectiveLev
      );
    }

    if (minNotionalSlLossUsdt > hardMaxRiskUsdt) {
      return reject(
        `单笔风险拦截: ${symbol} 最小仓位止损预期亏损 $${minNotionalSlLossUsdt.toFixed(
          2
        )} (${((minNotionalSlLossUsdt / effectiveEquity) * 100).toFixed(
          1
        )}%) 超出总资产风险红线 (${hardSlRiskFloorPct.toFixed(1)}%)`,
        effectiveLev
      );
    }

    targetNotional = requiredMinNotional;
    targetMargin = neededMargin;
  }

  let quantity = formatToStep(targetNotional / currentPrice, stepSize, 'floor');
  if (quantity < minQty || quantity * currentPrice < minNotional) {
    quantity = formatToStep(Math.max(minQty, (minNotional * 1.04) / currentPrice), stepSize, 'ceil');
  }

  const finalNotional = quantity * currentPrice;
  const finalMargin = finalNotional / effectiveLev;
  const estimatedFee = finalNotional * 0.0005;
  const actualRiskUsd = finalNotional * effectiveSlDist;
  const actualRiskPercent = (actualRiskUsd / effectiveEquity) * 100;
  const allocatedEquityPercent = (finalMargin / effectiveEquity) * 100;

  if (quantity <= 0 || finalMargin + estimatedFee > usableMargin * 1.02) {
    return reject(
      `${symbol} 对齐步长后所需保证金 ($${finalMargin.toFixed(2)}) 超出剩余安全可用额度 ($${usableMargin.toFixed(2)})`,
      effectiveLev
    );
  }

  if (actualRiskUsd > hardMaxRiskUsdt * 1.05) {
    return reject(
      `${symbol} 对齐步长后止损预期亏损 $${actualRiskUsd.toFixed(2)} (${actualRiskPercent.toFixed(
        1
      )}%) 超出单笔最大风控上限`,
      effectiveLev
    );
  }

  return {
    canOpen: true,
    quantity,
    allocatedMargin: Number(finalMargin.toFixed(4)),
    allocatedEquityPercent: Number(allocatedEquityPercent.toFixed(2)),
    notional: Number(finalNotional.toFixed(2)),
    estimatedFee: Number(estimatedFee.toFixed(4)),
    effectiveLeverage: effectiveLev,
    actualRiskUsd: Number(actualRiskUsd.toFixed(2)),
    actualRiskPercent: Number(actualRiskPercent.toFixed(2)),
    reason: `总资产 $${effectiveEquity.toFixed(1)} 动态配仓 ${allocatedEquityPercent.toFixed(
      1
    )}% ($${finalMargin.toFixed(2)} @ ${effectiveLev}x) | 单笔止损最大风险 $${actualRiskUsd.toFixed(
      2
    )} (${actualRiskPercent.toFixed(2)}%)`,
  };
}

/**
 * Computes price-normalized market volatility & directional correlation.
 * Eliminates the bug where raw USD ATR of BTC (~$300) divided by SOL (~$0.40) caused constant 5.5x false circuit-breakers.
 */
export function computeNormalizedMarketCorrelation(
  scans: ScanVolatilitySnapshot[],
  baseLeverage: number
): MarketCorrelationMetrics {
  let avgVolRatio = 1.0;
  let correlationScore = 0.45;

  if (scans.length > 0) {
    // Compare each scan's percentage ATR (atr / currentPrice) against its own baseline ATR%
    const normalizedRatios: number[] = [];
    for (const s of scans) {
      if (s.currentPrice > 0 && s.atr > 0) {
        const atrPct = s.atr / s.currentPrice;
        const basePct =
          s.baselineAtrPercent && s.baselineAtrPercent > 0 ? s.baselineAtrPercent : atrPct;
        const ratio = Math.min(6.0, Math.max(0.25, atrPct / basePct));
        normalizedRatios.push(ratio);
      }
    }

    if (normalizedRatios.length > 0) {
      const meanRatio =
        normalizedRatios.reduce((a, b) => a + b, 0) / normalizedRatios.length;
      avgVolRatio = Number(meanRatio.toFixed(2));
    }

    const nonZeroSignals = scans.map((s) => s.signal).filter((sig) => sig !== 0);
    if (nonZeroSignals.length >= 2) {
      const longs = nonZeroSignals.filter((s) => s === 1).length;
      const shorts = nonZeroSignals.filter((s) => s === -1).length;
      const majorityCount = Math.max(longs, shorts);
      correlationScore = Number((majorityCount / nonZeroSignals.length).toFixed(2));
    } else if (avgVolRatio >= 2.0) {
      correlationScore = 0.85;
    }
  }

  // Trigger circuit breaker ONLY when normalized volatility spikes genuinely across the market
  const isCircuitBreakerActive =
    avgVolRatio >= 2.5 || (correlationScore >= 0.85 && avgVolRatio >= 1.9);

  let circuitBreakerReason =
    '🟢 各品种归一化波动率与市场关联度平稳，允许策略顺势捕捉趋势机会';
  let safeLevelLeverage = baseLeverage;
  let maxAllowedAccountPositions = 5;
  let recommendedAction = '正常按动态权重与止盈止损开仓运行';

  if (isCircuitBreakerActive) {
    safeLevelLeverage = Math.max(1, Math.min(2, Math.floor(baseLeverage * 0.4)));
    maxAllowedAccountPositions = 2;
    circuitBreakerReason = `🚨 [全局市场异常共振熔断] 全品种归一化波幅较历史基线同步暴涨 ${avgVolRatio.toFixed(
      2
    )}x (方向共振度 ${(correlationScore * 100).toFixed(
      0
    )}%)！系统自动将杠杆压缩至 ${safeLevelLeverage}x 并收紧最大持仓至 ${maxAllowedAccountPositions} 笔，防范极端插针洗盘。`;
    recommendedAction = `⚠️ 降杠杆至 ${safeLevelLeverage}x 保护本金，仅放行高分顺势信号并强制直挂交易所止损。`;
  }

  return {
    avgVolatilityRatio: avgVolRatio,
    correlationScore,
    isCircuitBreakerActive,
    circuitBreakerReason,
    safeLevelLeverage,
    maxAllowedAccountPositions,
    recommendedAction,
    lastEvaluatedTime: Date.now(),
  };
}

export const DEFAULT_PORTFOLIO_BASKET_CONFIG: PortfolioBasketConfig = {
  enabled: true,
  minNetProfitPercent: 1.5,
  minNetProfitUsdt: 1.0,
  takerFeeRate: 0.0005,
  slippageBufferRate: 0.0005,
  trailingRetracePercent: 30,
  cooldownMinutes: 20,
};

export interface BasketPositionSnapshot {
  symbol: string;
  interval: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
}

export interface BasketScanContext {
  symbol: string;
  interval: string;
  trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND';
  signal: 1 | -1 | 0;
}

export interface EvaluateBasketInput {
  positions: BasketPositionSnapshot[];
  scans: BasketScanContext[];
  marketCorrelation: MarketCorrelationMetrics;
  config?: Partial<PortfolioBasketConfig>;
  previousPeakNetPnl?: number;
  cooldownActiveUntil?: number | null;
  now?: number;
}

/**
 * Evaluates whether a multi-position portfolio (e.g. 2 losing + 2 winning) has sufficient
 * net realizable profit after round-trip Binance taker fees & market-close slippage buffer,
 * and decides automatically based on market regime whether to close all or trail winners.
 */
export function evaluatePortfolioBasketTakeProfit(
  input: EvaluateBasketInput
): PortfolioBasketState {
  const now = input.now ?? Date.now();
  const cfg: PortfolioBasketConfig = {
    ...DEFAULT_PORTFOLIO_BASKET_CONFIG,
    ...(input.config || {}),
  };

  const cooldownActiveUntil =
    input.cooldownActiveUntil && input.cooldownActiveUntil > now ? input.cooldownActiveUntil : null;

  if (!input.positions || input.positions.length === 0) {
    return {
      enabled: cfg.enabled,
      positionsCount: 0,
      winningCount: 0,
      losingCount: 0,
      totalMarginUsed: 0,
      totalNotional: 0,
      grossUnrealizedPnl: 0,
      estimatedRoundTripFees: 0,
      estimatedSlippageBuffer: 0,
      netRealizablePnl: 0,
      netReturnOnMarginPercent: 0,
      peakNetRealizablePnl: 0,
      isTrailingActive: false,
      regimeAssessment: 'NO_ACTION',
      shouldCloseAll: false,
      decisionReason: cooldownActiveUntil
        ? `篮子全平冷却保护中 (剩余 ${Math.max(1, Math.ceil((cooldownActiveUntil - now) / 60000))} 分钟)，防原地重复开单`
        : '当前无活跃持仓，组合篮子净利止盈待命中',
      cooldownActiveUntil,
      lastEvaluatedAt: now,
    };
  }

  let totalMarginUsed = 0;
  let totalNotional = 0;
  let entryNotionalTotal = 0;
  let grossUnrealizedPnl = 0;
  let winningCount = 0;
  let losingCount = 0;

  for (const pos of input.positions) {
    const qty = Math.max(0, Number(pos.quantity) || 0);
    const entryPrice = Math.max(0, Number(pos.entryPrice) || 0);
    const curPrice = Math.max(0, Number(pos.currentPrice) || entryPrice);
    const lev = Math.max(1, Number(pos.leverage) || 1);
    const entryNotional = qty * entryPrice;
    const exitNotional = qty * curPrice;
    const margin = pos.marginUsed > 0 ? pos.marginUsed : exitNotional / lev;

    totalMarginUsed += margin;
    totalNotional += exitNotional;
    entryNotionalTotal += entryNotional;
    grossUnrealizedPnl += Number(pos.unrealizedPnl) || 0;

    if (pos.unrealizedPnl > 0) winningCount++;
    else if (pos.unrealizedPnl < 0) losingCount++;
  }

  // Account for both entry fee and market-exit fee + market slippage buffer
  const estimatedRoundTripFees = (entryNotionalTotal + totalNotional) * cfg.takerFeeRate;
  const estimatedSlippageBuffer = totalNotional * cfg.slippageBufferRate;
  const netRealizablePnl = grossUnrealizedPnl - estimatedRoundTripFees - estimatedSlippageBuffer;
  const netReturnOnMarginPercent =
    totalMarginUsed > 0 ? (netRealizablePnl / totalMarginUsed) * 100 : 0;

  const prevPeak = Math.max(0, input.previousPeakNetPnl || 0);
  const peakNetRealizablePnl =
    input.positions.length >= 2 && netRealizablePnl > 0
      ? Math.max(prevPeak, netRealizablePnl)
      : input.positions.length >= 2
      ? prevPeak
      : 0;

  const round2 = (v: number) => Number(v.toFixed(2));
  const round4 = (v: number) => Number(v.toFixed(4));

  const baseState = {
    enabled: cfg.enabled,
    positionsCount: input.positions.length,
    winningCount,
    losingCount,
    totalMarginUsed: round2(totalMarginUsed),
    totalNotional: round2(totalNotional),
    grossUnrealizedPnl: round2(grossUnrealizedPnl),
    estimatedRoundTripFees: round4(estimatedRoundTripFees),
    estimatedSlippageBuffer: round4(estimatedSlippageBuffer),
    netRealizablePnl: round2(netRealizablePnl),
    netReturnOnMarginPercent: round2(netReturnOnMarginPercent),
    peakNetRealizablePnl: round2(peakNetRealizablePnl),
    cooldownActiveUntil,
    lastEvaluatedAt: now,
  };

  if (!cfg.enabled) {
    return {
      ...baseState,
      isTrailingActive: false,
      regimeAssessment: 'NO_ACTION',
      shouldCloseAll: false,
      decisionReason: '自动篮子净利止盈已关闭（仍支持随时人工一键全平）',
    };
  }

  if (input.positions.length < 2) {
    return {
      ...baseState,
      isTrailingActive: false,
      regimeAssessment: 'NO_ACTION',
      shouldCloseAll: false,
      decisionReason: '当前仅 1 笔持仓，由单仓移动止盈/保本规则精准管理（≥2 笔时自动启用篮子协同）',
    };
  }

  const meetsProfitFloor =
    netRealizablePnl >= cfg.minNetProfitUsdt &&
    netReturnOnMarginPercent >= cfg.minNetProfitPercent;

  if (!meetsProfitFloor) {
    const costTotal = estimatedRoundTripFees + estimatedSlippageBuffer;
    return {
      ...baseState,
      isTrailingActive: false,
      regimeAssessment: 'NO_ACTION',
      shouldCloseAll: false,
      decisionReason:
        grossUnrealizedPnl > 0 && netRealizablePnl <= 0
          ? `总浮盈 +$${grossUnrealizedPnl.toFixed(2)} 尚不足覆盖双边手续费与滑点 ($${costTotal.toFixed(2)})，严禁白打工全平`
          : `扣费滑点后净利 ${netRealizablePnl >= 0 ? '+' : ''}$${netRealizablePnl.toFixed(2)} (${netReturnOnMarginPercent.toFixed(2)}%) 未达最低全平门槛 ($${cfg.minNetProfitUsdt.toFixed(2)} 且 ${cfg.minNetProfitPercent.toFixed(1)}%)`,
    };
  }

  // Analyze market regime & winner momentum across open positions
  let winnersInStrongTrend = 0;
  let choppyCount = 0;
  let anyWinnerReversing = false;

  for (const pos of input.positions) {
    const scan =
      input.scans.find((s) => s.symbol === pos.symbol && s.interval === pos.interval) ||
      input.scans.find((s) => s.symbol === pos.symbol && s.interval === '15m') ||
      input.scans.find((s) => s.symbol === pos.symbol);

    const trend = scan?.trendContext ?? 'RANGE_BOUND';
    const sig = scan?.signal ?? 0;

    if (trend === 'RANGE_BOUND') choppyCount++;

    const isAlignedTrend =
      (pos.side === 'LONG' && trend === 'BULL_TREND') ||
      (pos.side === 'SHORT' && trend === 'BEAR_TREND');

    const isReversing =
      pos.unrealizedPnl > 0 &&
      ((pos.side === 'LONG' && sig === -1) || (pos.side === 'SHORT' && sig === 1));

    if (isReversing) anyWinnerReversing = true;
    if (pos.unrealizedPnl > 0 && isAlignedTrend && !isReversing) {
      winnersInStrongTrend++;
    }
  }

  const choppyRatio = choppyCount / input.positions.length;
  const riskElevated =
    input.marketCorrelation.isCircuitBreakerActive ||
    input.marketCorrelation.avgVolatilityRatio >= 1.75;

  const retraceRatioPercent =
    peakNetRealizablePnl > 0
      ? ((peakNetRealizablePnl - netRealizablePnl) / peakNetRealizablePnl) * 100
      : 0;
  const isTrailingTriggered =
    peakNetRealizablePnl >= Math.max(cfg.minNetProfitUsdt * 1.35, cfg.minNetProfitUsdt + 0.5) &&
    retraceRatioPercent >= cfg.trailingRetracePercent;

  // Priority 1: Volatility/correlation danger OR winning leg showing reversal signal -> take net profit now
  if (riskElevated || anyWinnerReversing) {
    const triggerDetail = riskElevated
      ? `市场波动率抬升 (${input.marketCorrelation.avgVolatilityRatio.toFixed(2)}x)`
      : '盈利主力单出现反向拐头信号';
    return {
      ...baseState,
      isTrailingActive: true,
      regimeAssessment: 'RISK_DEFENSE_EXIT',
      shouldCloseAll: true,
      decisionReason: `🚨 [${triggerDetail}] 趁 ${winningCount}盈${losingCount}亏组合扣费后仍净赚 +$${netRealizablePnl.toFixed(2)} (+${netReturnOnMarginPercent.toFixed(2)}%)，果断全平落袋避险！`,
    };
  }

  // Priority 2: Basket trailing profit pullback protection triggered
  if (isTrailingTriggered) {
    return {
      ...baseState,
      isTrailingActive: true,
      regimeAssessment: 'TREND_TRAILING_EXIT',
      shouldCloseAll: true,
      decisionReason: `💰 [篮子净利追踪锁利] 组合扣费净利曾冲高至 +$${peakNetRealizablePnl.toFixed(2)}，现回撤 ${retraceRatioPercent.toFixed(1)}% (≥${cfg.trailingRetracePercent}%)，在 +$${netRealizablePnl.toFixed(2)} (+${netReturnOnMarginPercent.toFixed(2)}%) 果断全平锁定利润！`,
    };
  }

  // Priority 3: Choppy/range-bound market -> lock net profit promptly instead of waiting for whipsaw
  if (choppyRatio >= 0.5 && winnersInStrongTrend === 0) {
    return {
      ...baseState,
      isTrailingActive: true,
      regimeAssessment: 'RANGE_LOCK',
      shouldCloseAll: true,
      decisionReason: `⚖️ [震荡市见好就收] 当前多数合约处于箱体震荡，${winningCount}盈${losingCount}亏组合扣费净利已达 +$${netRealizablePnl.toFixed(2)} (+${netReturnOnMarginPercent.toFixed(2)}%)，自动全平落袋！`,
    };
  }

  // Priority 4: Strong trend winners are still running -> hold & trail the basket instead of cutting winners early!
  return {
    ...baseState,
    isTrailingActive: true,
    regimeAssessment: 'TREND_HOLD',
    shouldCloseAll: false,
    decisionReason: `🚀 [单边顺风持盈追踪] 组合扣费净利 +$${netRealizablePnl.toFixed(2)} (峰值 +$${peakNetRealizablePnl.toFixed(2)})，且 ${winnersInStrongTrend} 个盈利单处于主趋势运行中，暂不急于全平，已开启回撤 ${cfg.trailingRetracePercent}% 防回吐锁利！`,
  };
}

