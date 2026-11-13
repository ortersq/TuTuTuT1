import {
  AiPnlForecastResult,
  ArbitrageOpportunity,
  Kline,
  PortfolioAllocationState,
  PortfolioWeightItem,
  StrategyScreenerGrade,
  StrategyScreenerItem,
} from '../types/trading';
import { STRATEGY_CATALOG } from './strategies';

export interface TradeMetricInput {
  id: string;
  symbol: string;
  interval: string;
  side: 'LONG' | 'SHORT';
  patternType?: string;
  patternName: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  marginUsed: number;
  netPnl: number;
  pnlPercent: number;
  strategyUsed: string;
  isPaper: boolean;
  isExternalExchangeTrade?: boolean;
}

export interface ActivePositionSummaryInput {
  symbol: string;
  side: 'LONG' | 'SHORT';
  unrealizedPnl: number;
  marginUsed: number;
}

export interface ScanAllocationInput {
  symbol: string;
  interval: string;
  currentPrice: number;
  atr: number;
  baselineAtrPercent?: number;
  trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND';
}

/**
 * 7-Day Quantitative Strategy Screener (Grade A-F)
 * Automatically marks strategies below Grade C (< C, i.e., D or F) with sufficient samples (>= 3 trades) as ELIMINATED.
 * Strictly excludes external exchange fills and keeps all zero-sample strategies uneliminated (Grade B, ACTIVE_PASS).
 */
export function evaluate7dStrategyScreener(
  closedTrades: TradeMetricInput[],
  now: number = Date.now()
): StrategyScreenerItem[] {
  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  const recentTrades = closedTrades.filter(
    (t) =>
      t &&
      Number.isFinite(t.exitTime) &&
      t.exitTime >= now - sevenDaysMs &&
      !t.isExternalExchangeTrade &&
      t.patternType !== 'LIVE_EXCHANGE_HISTORY' &&
      t.patternType !== 'BINANCE_ACCOUNT_FILL' &&
      t.patternType !== 'EXTERNAL_EXCHANGE_FILL' &&
      t.patternType !== 'LIVE_EXCHANGE_SYNC'
  );

  return STRATEGY_CATALOG.map((strat) => {
    const keyword = strat.key.split('_')[0].toLowerCase();
    const trades = recentTrades.filter(
      (t) =>
        !t.isExternalExchangeTrade &&
        (t.strategyUsed === strat.key ||
          (t.patternType && t.patternType.toLowerCase().includes(keyword)) ||
          (strat.key === 'pattern_price_action' &&
            t.strategyUsed === 'pattern_price_action' &&
            t.patternType &&
            t.patternType !== 'OTHER' &&
            !t.patternType.includes('EXTERNAL')))
    );

    const count = trades.length;
    const wins = trades.filter((t) => t.netPnl > 0).length;
    const losses = trades.filter((t) => t.netPnl <= 0).length;
    const winRate = count > 0 ? (wins / count) * 100 : 0;

    const grossWin = trades.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
    const grossLoss = Math.abs(trades.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0));
    const profitFactor =
      grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3.5 : count === 0 ? 1.5 : 0.4;
    const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);

    // Max drawdown % relative to average margin
    let cum = 0;
    let peak = 0;
    let maxDrawUsdt = 0;
    for (const t of trades) {
      cum += t.netPnl;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDrawUsdt) maxDrawUsdt = dd;
    }
    const avgMargin =
      count > 0 ? trades.reduce((s, t) => s + Math.max(10, t.marginUsed), 0) / count : 100;
    const maxDrawdownPercent = count > 0 ? Math.min(60, (maxDrawUsdt / Math.max(50, avgMargin)) * 100) : 0;

    // Composite quantitative score (0-100)
    let score = 74;
    if (count > 0) {
      const pfPart = Math.min(35, profitFactor * 14);
      const wrPart = winRate * 0.45;
      const ddPenalty = Math.min(30, maxDrawdownPercent * 0.8);
      score = Math.max(0, Math.min(100, pfPart + wrPart + 20 - ddPenalty));
    }

    let grade: StrategyScreenerGrade = 'B';
    if (count === 0) {
      grade = 'B'; // Newly deployed / zero 7d samples -> always allow monitoring and real trading
    } else if (score >= 82 && winRate >= 60 && profitFactor >= 1.6) {
      grade = 'A';
    } else if (score >= 68 && winRate >= 50 && profitFactor >= 1.2) {
      grade = 'B';
    } else if (score >= 54 && profitFactor >= 0.95) {
      grade = 'C';
    } else if (score >= 38) {
      grade = 'D';
    } else {
      grade = 'F';
    }

    // Never eliminate unless >= 3 genuine bot trades have accumulated
    const shouldEliminate = count >= 3 && (grade === 'D' || grade === 'F');
    const status: StrategyScreenerItem['status'] = shouldEliminate
      ? 'ELIMINATED_BELOW_C'
      : grade === 'A'
      ? 'ACTIVE_ELITE'
      : 'ACTIVE_PASS';

    let reason = '策略已全线激活就绪，实时扫描 5 大主流合约 K 线形态与套利机会';
    if (count > 0 && shouldEliminate) {
      reason = `近 7 日 ${count} 笔实盘评分 ${grade} 级 (胜率 ${winRate.toFixed(1)}%, 盈亏比 ${profitFactor.toFixed(2)}, 回撤 ${maxDrawdownPercent.toFixed(1)}%)，低于 C 级阈值，已自动淘汰禁开！`;
    } else if (count > 0) {
      reason = `近 7 日 ${count} 笔表现评级 ${grade} 级 (胜率 ${winRate.toFixed(1)}%, 盈亏比 ${profitFactor.toFixed(2)})，允许执行并按评级配置权重`;
    }

    return {
      strategyKey: strat.key,
      strategyName: strat.name,
      category: strat.category,
      tradesCount7d: count,
      wins7d: wins,
      losses7d: losses,
      winRatePercent: Number(winRate.toFixed(1)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(1)),
      totalNetPnlUsdt: Number(netPnl.toFixed(2)),
      score: Math.round(score),
      grade,
      status,
      reason,
    };
  });
}

/**
 * AI 24-Hour PnL Forecast Model
 * Uses exponential recency-weighted trade expectancy + active portfolio delta + signal quality
 */
export function predict24hPnlModel(
  closedTrades: TradeMetricInput[],
  activePositions: ActivePositionSummaryInput[],
  currentEquity: number,
  highQualitySignalCount: number,
  now: number = Date.now()
): AiPnlForecastResult {
  const safeEquity = Math.max(0, currentEquity);
  const recent = closedTrades.slice(-30);

  // Recency-weighted trade return expectancy
  let weightedReturnSum = 0;
  let weightTotal = 0;
  let wins = 0;
  let returnsVarianceAccum = 0;

  recent.forEach((t, idx) => {
    const w = 1 + (idx / Math.max(1, recent.length)) * 1.2;
    const pct = t.marginUsed > 0 ? t.netPnl / t.marginUsed : 0;
    weightedReturnSum += pct * w;
    weightTotal += w;
    if (t.netPnl > 0) wins++;
  });

  const avgExpectancyRatio = weightTotal > 0 ? weightedReturnSum / weightTotal : 0.008;
  const projectedWinRate =
    recent.length > 0 ? (wins / recent.length) * 100 : 58.0;

  for (const t of recent) {
    const pct = t.marginUsed > 0 ? t.netPnl / t.marginUsed : 0;
    returnsVarianceAccum += Math.pow(pct - avgExpectancyRatio, 2);
  }
  const stdDev = recent.length > 1 ? Math.sqrt(returnsVarianceAccum / (recent.length - 1)) : 0.025;

  // Estimate expected trades over next 24h (baseline ~4 trades + signal bonus)
  const expectedTrades24h = Math.min(10, Math.max(2, 3 + highQualitySignalCount * 0.8));
  const avgCapitalPerTrade =
    safeEquity > 0 ? Math.max(safeEquity * 0.18, Math.min(safeEquity * 0.45, 50)) : 0;
  const activeUnrealized = activePositions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0);

  const raw24hDrift = avgCapitalPerTrade * avgExpectancyRatio * expectedTrades24h;
  const expected24hPnl = Number((activeUnrealized * 0.4 + raw24hDrift).toFixed(2));
  const expected24hReturnPercent =
    safeEquity > 0 ? Number(((expected24hPnl / safeEquity) * 100).toFixed(2)) : 0;

  const horizons = [2, 4, 8, 12, 16, 20, 24];
  const trajectoryPoints = horizons.map((h) => {
    const progress = h / 24;
    const meanPnl = activeUnrealized * 0.4 * Math.min(1, progress * 2) + raw24hDrift * progress;
    const band = Math.max(
      safeEquity * 0.008,
      avgCapitalPerTrade * Math.max(0.015, stdDev) * Math.sqrt(expectedTrades24h * progress)
    );
    return {
      hourOffset: h,
      timeLabel: `+${h}h`,
      predictedCumulativePnl: Number(meanPnl.toFixed(2)),
      optimisticPnl: Number((meanPnl + band).toFixed(2)),
      pessimisticPnl: Number((meanPnl - band).toFixed(2)),
    };
  });

  const confidencePercent = Math.min(
    92,
    Math.max(42, Math.round(48 + Math.min(25, recent.length * 1.4) + (projectedWinRate - 50) * 0.35))
  );

  let regimeLabel = '⚖️ 中性震荡期望稳增';
  if (avgExpectancyRatio >= 0.018 && projectedWinRate >= 60) {
    regimeLabel = '🟢 高胜率正向动量扩张';
  } else if (avgExpectancyRatio < 0) {
    regimeLabel = '🟡 近期期望承压，建议降杠杆滤波';
  }

  const adjustmentSuggestions: AiPnlForecastResult['adjustmentSuggestions'] = [];
  if (projectedWinRate < 50 && recent.length >= 3) {
    adjustmentSuggestions.push({
      title: '提高信号质量准入门槛至 ≥ 90 分',
      detail: `近期样本胜率 (${projectedWinRate.toFixed(1)}%) 偏低，模型建议暂停低质量形态并自动启用 C 级以下淘汰规则。`,
      priority: 'HIGH',
    });
  } else {
    adjustmentSuggestions.push({
      title: '保持顺势追踪止盈 + 阶梯保本',
      detail: `当前预测未来 24h 胜率 ${projectedWinRate.toFixed(1)}%，建议延续 1.8x ATR 止损与 +0.8% 自动保本上移锁利。`,
      priority: 'MEDIUM',
    });
  }

  if (activePositions.length >= 2) {
    adjustmentSuggestions.push({
      title: '检查多持仓正相关性暴露',
      detail: `当前持有 ${activePositions.length} 个活跃头寸，动态相关性模块将自动压缩弱势币种敞口 40%。`,
      priority: 'MEDIUM',
    });
  }

  if (safeEquity > 0 && safeEquity <= 500) {
    adjustmentSuggestions.push({
      title: '小资金复利精细化仓位模式已激活',
      detail: `当前账户净值 $${safeEquity.toFixed(2)} USDT，系统优先选择高流动性、低名义门槛合约（如 ETH/XAU）并在每笔开仓同步直挂交易所止损。`,
      priority: 'HIGH',
    });
  }

  return {
    generatedAt: now,
    expected24hPnlUsdt: expected24hPnl,
    expected24hReturnPercent,
    confidencePercent,
    projectedWinRatePercent: Number(projectedWinRate.toFixed(1)),
    regimeLabel,
    trajectoryPoints,
    adjustmentSuggestions,
  };
}

/**
 * Cross-Symbol Statistical Arbitrage Monitor
 * Calculates Pearson return correlation, log spread Z-score, and AR(1) mean-reversion half-life.
 */
export function detectCrossSymbolArbitrage(
  symbolKlinesMap: Map<string, Kline[]>,
  monitoredSymbols: string[],
  now: number = Date.now()
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  const availableSymbols = monitoredSymbols.filter((s) => (symbolKlinesMap.get(s)?.length || 0) >= 40);

  for (let i = 0; i < availableSymbols.length; i++) {
    for (let j = i + 1; j < availableSymbols.length; j++) {
      const symA = availableSymbols[i];
      const symB = availableSymbols[j];
      const klA = symbolKlinesMap.get(symA)!;
      const klB = symbolKlinesMap.get(symB)!;
      const len = Math.min(klA.length, klB.length, 60);
      if (len < 30) continue;

      const sliceA = klA.slice(-len);
      const sliceB = klB.slice(-len);

      // Compute return correlation & log price ratio spread
      const retA: number[] = [];
      const retB: number[] = [];
      const spreads: number[] = [];
      for (let k = 0; k < len; k++) {
        const pA = sliceA[k].close;
        const pB = sliceB[k].close;
        if (pA <= 0 || pB <= 0) continue;
        spreads.push(Math.log(pA / pB));
        if (k > 0) {
          retA.push((pA - sliceA[k - 1].close) / sliceA[k - 1].close);
          retB.push((pB - sliceB[k - 1].close) / sliceB[k - 1].close);
        }
      }
      if (spreads.length < 25 || retA.length < 20) continue;

      const corrLen = retA.length >= 20 ? retA.length - 2 : retA.length;
      const corrRetA = retA.slice(0, corrLen);
      const corrRetB = retB.slice(0, corrLen);
      const meanRetA = corrRetA.reduce((a, b) => a + b, 0) / corrRetA.length;
      const meanRetB = corrRetB.reduce((a, b) => a + b, 0) / corrRetB.length;
      let cov = 0;
      let varA = 0;
      let varB = 0;
      for (let k = 0; k < corrRetA.length; k++) {
        const dA = corrRetA[k] - meanRetA;
        const dB = corrRetB[k] - meanRetB;
        cov += dA * dB;
        varA += dA * dA;
        varB += dB * dB;
      }
      const denom = Math.sqrt(varA * varB);
      const corr = denom > 0 ? cov / denom : 0;

      // Only monitor cointegrated/correlated pairs (e.g. BTC/ETH typically > 0.70)
      if (corr < 0.65) continue;

      const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
      const stdSpread = Math.sqrt(
        spreads.reduce((s, v) => s + Math.pow(v - meanSpread, 2), 0) / (spreads.length - 1)
      );
      if (stdSpread <= 1e-8) continue;

      const latestSpread = spreads[spreads.length - 1];
      const zScore = (latestSpread - meanSpread) / stdSpread;

      // Estimate AR(1) mean reversion speed: (S_t - S_{t-1}) = lambda * (S_{t-1} - mu)
      let num = 0;
      let den = 0;
      for (let k = 1; k < spreads.length; k++) {
        const x = spreads[k - 1] - meanSpread;
        const dy = spreads[k] - spreads[k - 1];
        num += x * dy;
        den += x * x;
      }
      const lambda = den > 0 ? Math.min(-0.02, num / den) : -0.15;
      const halfLifeBars = Math.max(2, Math.min(48, Math.round(-Math.log(2) / lambda)));

      // Faster reversion justifies slightly lower entry Z threshold; slower reversion demands wider divergence
      const optimalEntryZ = halfLifeBars <= 8 ? 1.85 : halfLifeBars <= 16 ? 2.05 : 2.35;
      const absZ = Math.abs(zScore);
      const isActionable = absZ >= optimalEntryZ;

      const strongSymbol = zScore >= 0 ? symA : symB;
      const weakSymbol = zScore >= 0 ? symB : symA;
      const expectedReversionPercent = Number((absZ * stdSpread * 100 * 0.7).toFixed(2));

      const reversionSpeedLabel =
        halfLifeBars <= 8
          ? `极快回归 (~${halfLifeBars} 根K线)`
          : halfLifeBars <= 16
          ? `稳健回归 (~${halfLifeBars} 根K线)`
          : `缓慢回归 (~${halfLifeBars} 根K线)`;

      opportunities.push({
        id: `arb_${symA}_${symB}`,
        pairName: `${symA.replace('USDT', '')} / ${symB.replace('USDT', '')}`,
        symbolA: symA,
        symbolB: symB,
        strongSymbol,
        weakSymbol,
        correlation: Number(corr.toFixed(2)),
        spreadZScore: Number(zScore.toFixed(2)),
        halfLifeBars,
        reversionSpeedLabel,
        optimalEntryZScore: optimalEntryZ,
        expectedReversionPercent,
        recommendedAction: isActionable ? 'LONG_WEAK_SHORT_STRONG' : 'MONITORING',
        reason: isActionable
          ? `价格分叉 Z=${zScore.toFixed(2)} 突破最优入场点 ±${optimalEntryZ}！建议做空强品种【${strongSymbol}】、做多弱品种【${weakSymbol}】，预期价差回归 ${expectedReversionPercent}%`
          : `相关性 ${(corr * 100).toFixed(0)}%，当前偏离 Z=${zScore.toFixed(2)} (最优触发阈值 ±${optimalEntryZ})，持续追踪套利均值回归速率`,
        isActionable,
        timestamp: now,
      });
    }
  }

  return opportunities.sort((a, b) => Math.abs(b.spreadZScore) - Math.abs(a.spreadZScore));
}

/**
 * Dynamic Portfolio Weight Allocation driven by a VIX-like daily market volatility index
 */
export function computeDynamicPortfolioWeights(
  scans: ScanAllocationInput[],
  monitoredSymbols: string[],
  now: number = Date.now()
): PortfolioAllocationState {
  // Derive normalized daily-equivalent volatility (%) per symbol
  const volMap = new Map<string, number>();
  for (const sym of monitoredSymbols) {
    const symScan = scans.find((s) => s.symbol === sym && s.interval === '15m') || scans.find((s) => s.symbol === sym);
    if (symScan && symScan.currentPrice > 0 && symScan.atr > 0) {
      // Scale 15m ATR% (~0.35%) roughly to annualized VIX-like scale (~35)
      const atrPct = (symScan.atr / symScan.currentPrice) * 100;
      const baseFactor = symScan.interval === '5m' ? 140 : symScan.interval === '30m' ? 68 : 95;
      volMap.set(sym, Math.max(8, Math.min(120, atrPct * baseFactor)));
    } else {
      volMap.set(sym, 38);
    }
  }

  const allVols = Array.from(volMap.values());
  const vixLikeIndex =
    allVols.length > 0
      ? Number((allVols.reduce((a, b) => a + b, 0) / allVols.length).toFixed(1))
      : 35.0;

  let volatilityRegime: PortfolioAllocationState['volatilityRegime'] = 'NORMAL_BALANCED';
  let totalExposureMultiplier = 1.0;
  let maxConcurrentPositions = Math.min(5, monitoredSymbols.length);
  let coverageDescription = '🟢 市场处于常规趋势与震荡平衡期，采用波动率倒数风险平价分配资产权重。';

  if (vixLikeIndex >= 72) {
    volatilityRegime = 'EXTREME_DEFENSE';
    totalExposureMultiplier = 0.45;
    maxConcurrentPositions = 2;
    coverageDescription = `🔴 恐慌波动 VIX-Index 升至 ${vixLikeIndex} (≥72)：自动下调总风险敞口至 45%，集中防御核心资产并向避险资产(XAU)倾斜！`;
  } else if (vixLikeIndex >= 52) {
    volatilityRegime = 'HIGH_CAUTION';
    totalExposureMultiplier = 0.72;
    maxConcurrentPositions = 3;
    coverageDescription = `🟠 较高波动预警 VIX-Index=${vixLikeIndex}：风险敞口自动收缩至 72%，优选高信念标的防止插针损耗。`;
  } else if (vixLikeIndex < 30) {
    volatilityRegime = 'LOW_VOL_EXPANSION';
    totalExposureMultiplier = 1.15;
    maxConcurrentPositions = Math.max(4, monitoredSymbols.length);
    coverageDescription = `🔵 低波震荡市 VIX-Index=${vixLikeIndex} (<30)：自动扩大全品种策略覆盖宽度并提升配比至 115%，多点捕捉轮动收益平滑曲线！`;
  }

  // Inverse-volatility risk-parity weights across monitored symbols
  const rawInvVols = monitoredSymbols.map((sym) => {
    const v = volMap.get(sym) || 38;
    // Slight defensive overweight to XAU in extreme vol regimes
    const goldDefenseBoost = volatilityRegime === 'EXTREME_DEFENSE' && sym.startsWith('XAU') ? 1.35 : 1.0;
    return (1 / v) * goldDefenseBoost;
  });
  const totalInv = rawInvVols.reduce((a, b) => a + b, 0) || 1;

  const weights: PortfolioWeightItem[] = monitoredSymbols.map((sym, idx) => {
    const volPct = Number((volMap.get(sym) || 38).toFixed(1));
    const targetWeightPercent = Number(((rawInvVols[idx] / totalInv) * 100).toFixed(1));
    const equalWeight = 100 / Math.max(1, monitoredSymbols.length);
    const relativeWeightRatio = targetWeightPercent / equalWeight;
    const sizingMultiplier = Number(
      Math.max(0.4, Math.min(1.4, totalExposureMultiplier * (0.6 + 0.4 * relativeWeightRatio))).toFixed(2)
    );

    const regimeRole: PortfolioWeightItem['regimeRole'] = sym.startsWith('XAU')
      ? 'DEFENSIVE_HEDGE'
      : sym.startsWith('BTC') || sym.startsWith('ETH')
      ? 'CORE_LEADER'
      : 'ALPHA_SATELLITE';

    return {
      symbol: sym,
      targetWeightPercent,
      volatilityPct: volPct,
      regimeRole,
      sizingMultiplier,
    };
  });

  return {
    vixLikeIndex,
    volatilityRegime,
    totalExposureMultiplier,
    maxConcurrentPositions,
    coverageDescription,
    weights,
    lastUpdated: now,
  };
}
