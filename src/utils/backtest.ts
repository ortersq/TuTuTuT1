import {
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  EquityPoint,
  ExitReason,
  Kline,
  PositionSide,
  Trade,
} from '../types/trading';
import { calculateATR } from './indicators';
import { generateAllSignals } from './strategies';

interface OpenPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  patternName?: string;
  entryTime: number;
  entryIndex: number;
  entryPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  entryFee: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  highestPriceSinceEntry: number;
  lowestPriceSinceEntry: number;
  liquidationPrice: number;
}

export function runFuturesBacktest(klines: Kline[], config: BacktestConfig): BacktestResult {
  if (klines.length < 30) {
    throw new Error('K线数据量过少，至少需要 30 根 K 线进行回测');
  }

  const { signals: activeSignals, patternMap, regimes } = generateAllSignals(
    klines,
    config.params,
    config.strategy
  );
  const atrValues = calculateATR(klines, 14);

  let currentCash = config.initialCapital;
  let peakEquity = config.initialCapital;
  let activePosition: OpenPosition | null = null;
  const closedTrades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  const initialPrice = klines[0].close;
  const mmr = 0.005; // 0.5% Maintenance Margin Rate (Binance tier 1)

  let trendingBars = 0;
  let consolidationBars = 0;

  for (let i = 0; i < klines.length; i++) {
    const bar = klines[i];
    const timestamp = bar.timestamp;
    const openPrice = bar.open;
    const highPrice = bar.high;
    const lowPrice = bar.low;
    const closePrice = bar.close;
    const currentAtr = atrValues[i] ?? (highPrice - lowPrice);

    if (regimes[i] === 'TREND') trendingBars++;
    else consolidationBars++;

    // 1. If we have an active position, evaluate Risk Management & Exits
    if (activePosition) {
      let exitPrice: number | null = null;
      let exitReason: ExitReason | null = null;
      const pos = activePosition;

      // Track extreme excursions
      if (highPrice > pos.highestPriceSinceEntry) pos.highestPriceSinceEntry = highPrice;
      if (lowPrice < pos.lowestPriceSinceEntry) pos.lowestPriceSinceEntry = lowPrice;

      // A. Liquidation Safeguard Check
      if (pos.side === 'LONG' && lowPrice <= pos.liquidationPrice) {
        exitPrice = pos.liquidationPrice;
        exitReason = 'LIQUIDATION';
      } else if (pos.side === 'SHORT' && highPrice >= pos.liquidationPrice) {
        exitPrice = pos.liquidationPrice;
        exitReason = 'LIQUIDATION';
      }

      // B. Stop Loss Check (Fixed % or ATR dynamic)
      if (!exitReason && pos.stopLossPrice !== null) {
        if (pos.side === 'LONG' && lowPrice <= pos.stopLossPrice) {
          exitPrice = Math.min(openPrice, pos.stopLossPrice);
          exitReason = 'STOP_LOSS';
        } else if (pos.side === 'SHORT' && highPrice >= pos.stopLossPrice) {
          exitPrice = Math.max(openPrice, pos.stopLossPrice);
          exitReason = 'STOP_LOSS';
        }
      }

      // C. Take Profit Check (Fixed % or Risk:Reward ratio)
      if (!exitReason && pos.takeProfitPrice !== null) {
        if (pos.side === 'LONG' && highPrice >= pos.takeProfitPrice) {
          exitPrice = pos.takeProfitPrice;
          exitReason = 'TAKE_PROFIT';
        } else if (pos.side === 'SHORT' && lowPrice <= pos.takeProfitPrice) {
          exitPrice = pos.takeProfitPrice;
          exitReason = 'TAKE_PROFIT';
        }
      }

      // D. Trailing Stop Check
      if (!exitReason && config.risk.useTrailingStop && config.risk.trailingCallbackPercent > 0) {
        const callbackRate = config.risk.trailingCallbackPercent / 100;
        if (pos.side === 'LONG') {
          const maxGain = (pos.highestPriceSinceEntry - pos.entryPrice) / pos.entryPrice;
          if (maxGain >= callbackRate) {
            const trailStop = pos.highestPriceSinceEntry * (1 - callbackRate);
            if (lowPrice <= trailStop) {
              exitPrice = trailStop;
              exitReason = 'TRAILING_STOP';
            }
          }
        } else {
          const maxGain = (pos.entryPrice - pos.lowestPriceSinceEntry) / pos.entryPrice;
          if (maxGain >= callbackRate) {
            const trailStop = pos.lowestPriceSinceEntry * (1 + callbackRate);
            if (highPrice >= trailStop) {
              exitPrice = trailStop;
              exitReason = 'TRAILING_STOP';
            }
          }
        }
      }

      // Execute intra-bar exit if triggered
      if (exitReason && exitPrice !== null) {
        const trade = closePosition(pos, exitPrice, exitReason, timestamp, i, config);
        currentCash += pos.marginUsed + trade.netPnl;
        closedTrades.push(trade);
        activePosition = null;
      }
    }

    // 2. Evaluate Strategy Signal at Bar Close
    const sig = activeSignals[i];

    // If signal reverses existing position, close it first
    if (activePosition) {
      if (
        (activePosition.side === 'LONG' && sig === -1) ||
        (activePosition.side === 'SHORT' && sig === 1)
      ) {
        const trade = closePosition(activePosition, closePrice, 'SIGNAL_REVERSAL', timestamp, i, config);
        currentCash += activePosition.marginUsed + trade.netPnl;
        closedTrades.push(trade);
        activePosition = null;
      }
    }

    // 3. Open New Position on Signal if flat
    // Circuit Breaker: check current total drawdown
    const currentDrawdown = peakEquity > 0 ? ((peakEquity - currentCash) / peakEquity) * 100 : 0;
    const isCircuitBreakerTripped =
      config.risk.maxAllowedDrawdownPercent > 0 &&
      currentDrawdown >= config.risk.maxAllowedDrawdownPercent;

    if (!activePosition && sig !== 0 && currentCash > 50 && !isCircuitBreakerTripped) {
      const side = sig === 1 ? 'LONG' : 'SHORT';
      const leverage = Math.max(1, config.risk.leverage);
      const matchedPattern = patternMap.get(i);

      // Determine Position Size based on Risk Mode
      let allocatedMargin = 0;
      let plannedStopDistance = 0;

      // Calculate Stop Loss Price & Distance (use Pattern Structural SL if enabled, fallback to Risk config)
      let stopLossPrice: number | null = null;
      if (config.params.usePatternStructuralSlTp && matchedPattern) {
        stopLossPrice = matchedPattern.stopLossPrice;
        plannedStopDistance = Math.abs(closePrice - stopLossPrice);
      } else if (config.risk.slMode === 'PERCENT' && config.risk.slPercent > 0) {
        plannedStopDistance = closePrice * (config.risk.slPercent / 100);
        stopLossPrice = side === 'LONG' ? closePrice - plannedStopDistance : closePrice + plannedStopDistance;
      } else if (config.risk.slMode === 'ATR' && config.risk.slAtrMultiplier > 0) {
        plannedStopDistance = currentAtr * config.risk.slAtrMultiplier;
        stopLossPrice = side === 'LONG' ? closePrice - plannedStopDistance : closePrice + plannedStopDistance;
      }

      // Sizing Mode Calculation
      if (config.risk.sizingMode === 'FIXED_AMOUNT') {
        const targetNotional = Math.min(config.risk.fixedAmountUSDT, currentCash * leverage);
        allocatedMargin = targetNotional / leverage;
      } else if (config.risk.sizingMode === 'RISK_PARITY_ATR') {
        // Volatility Risk Parity: dollar risk = equity * riskPerTrade%
        const dollarRisk = currentCash * (config.risk.riskPerTradePercent / 100);
        const dist = plannedStopDistance > 0 ? plannedStopDistance : currentAtr * 2;
        const targetQty = dist > 0 ? dollarRisk / dist : 0;
        const targetNotional = targetQty * closePrice;
        allocatedMargin = Math.min(currentCash * 0.95, targetNotional / leverage);
      } else {
        // EQUITY_PERCENT
        const sizePct = Math.min(100, Math.max(5, config.risk.positionSizePercent));
        allocatedMargin = currentCash * (sizePct / 100);
      }

      // Apply slippage
      const executionSlippage = side === 'LONG' ? 1 + config.slippageRate : 1 - config.slippageRate;
      const actualEntryPrice = closePrice * executionSlippage;

      const positionNotional = allocatedMargin * leverage;
      const quantity = positionNotional / actualEntryPrice;
      const entryFee = positionNotional * config.takerFeeRate;

      if (currentCash >= allocatedMargin + entryFee && quantity > 0) {
        currentCash -= allocatedMargin + entryFee;

        // Take Profit Price Calculation
        let takeProfitPrice: number | null = null;
        if (config.params.usePatternStructuralSlTp && matchedPattern) {
          takeProfitPrice = matchedPattern.targetPrice;
        } else if (config.risk.tpMode === 'PERCENT' && config.risk.tpPercent > 0) {
          takeProfitPrice =
            side === 'LONG'
              ? actualEntryPrice * (1 + config.risk.tpPercent / 100)
              : actualEntryPrice * (1 - config.risk.tpPercent / 100);
        } else if (
          config.risk.tpMode === 'RISK_REWARD' &&
          config.risk.tpRiskRewardRatio > 0 &&
          plannedStopDistance > 0
        ) {
          const rewardDistance = plannedStopDistance * config.risk.tpRiskRewardRatio;
          takeProfitPrice =
            side === 'LONG' ? actualEntryPrice + rewardDistance : actualEntryPrice - rewardDistance;
        }

        // Liquidation Price Calculation
        let liqPrice = 0;
        if (side === 'LONG') {
          liqPrice = actualEntryPrice * (1 - 1 / leverage + mmr);
        } else {
          liqPrice = actualEntryPrice * (1 + 1 / leverage - mmr);
        }

        activePosition = {
          id: `trade_${i}_${side}`,
          symbol: config.symbol,
          side,
          patternName: matchedPattern?.name ?? 'K线形态突破',
          entryTime: timestamp,
          entryIndex: i,
          entryPrice: actualEntryPrice,
          quantity,
          leverage,
          marginUsed: allocatedMargin,
          entryFee,
          stopLossPrice,
          takeProfitPrice,
          highestPriceSinceEntry: actualEntryPrice,
          lowestPriceSinceEntry: actualEntryPrice,
          liquidationPrice: Math.max(0, liqPrice),
        };
      }
    }

    // 4. Record Equity Point
    let unrealizedPnl = 0;
    if (activePosition) {
      if (activePosition.side === 'LONG') {
        unrealizedPnl = (closePrice - activePosition.entryPrice) * activePosition.quantity;
      } else {
        unrealizedPnl = (activePosition.entryPrice - closePrice) * activePosition.quantity;
      }
    }

    const currentTotalEquity = Math.max(
      0,
      currentCash + (activePosition ? activePosition.marginUsed : 0) + unrealizedPnl
    );

    if (currentTotalEquity > peakEquity) peakEquity = currentTotalEquity;
    const drawdown = peakEquity > 0 ? ((peakEquity - currentTotalEquity) / peakEquity) * 100 : 0;
    const benchmarkEquity = config.initialCapital * (closePrice / initialPrice);

    equityCurve.push({
      timestamp,
      equity: currentTotalEquity,
      cash: currentCash,
      benchmarkEquity,
      drawdown,
      positionSide: activePosition ? activePosition.side : 'NONE',
      unrealizedPnl,
      price: closePrice,
    });
  }

  // Force close remaining open position at end of backtest data
  if (activePosition) {
    const lastBar = klines[klines.length - 1];
    const trade = closePosition(
      activePosition,
      lastBar.close,
      'END_OF_DATA',
      lastBar.timestamp,
      klines.length - 1,
      config
    );
    currentCash += activePosition.marginUsed + trade.netPnl;
    closedTrades.push(trade);
    activePosition = null;
  }

  const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? currentCash;
  const metrics = computeMetrics(config.initialCapital, finalEquity, closedTrades, equityCurve, klines);

  return {
    config,
    metrics,
    trades: closedTrades,
    equityCurve,
    klines,
    marketRegimeStats: {
      trendingBarsPercent: (trendingBars / klines.length) * 100,
      consolidationBarsPercent: (consolidationBars / klines.length) * 100,
    },
  };
}

function closePosition(
  pos: OpenPosition,
  exitPrice: number,
  exitReason: ExitReason,
  exitTime: number,
  exitIndex: number,
  config: BacktestConfig
): Trade {
  const exitFeeRate = exitReason === 'TAKE_PROFIT' ? config.makerFeeRate : config.takerFeeRate;
  const exitSlippage = pos.side === 'LONG' ? 1 - config.slippageRate : 1 + config.slippageRate;
  const actualExitPrice = exitReason === 'LIQUIDATION' ? exitPrice : exitPrice * exitSlippage;

  const exitNotional = pos.quantity * actualExitPrice;
  const exitFee = exitNotional * exitFeeRate;
  const totalFee = pos.entryFee + exitFee;

  let grossPnl = 0;
  if (pos.side === 'LONG') {
    grossPnl = (actualExitPrice - pos.entryPrice) * pos.quantity;
  } else {
    grossPnl = (pos.entryPrice - actualExitPrice) * pos.quantity;
  }

  let netPnl = grossPnl - totalFee;
  if (exitReason === 'LIQUIDATION') {
    netPnl = -pos.marginUsed;
    grossPnl = -pos.marginUsed;
  }

  const pnlPercent = (netPnl / pos.marginUsed) * 100;

  let maxFavorable = 0;
  let maxAdverse = 0;
  if (pos.side === 'LONG') {
    maxFavorable = ((pos.highestPriceSinceEntry - pos.entryPrice) / pos.entryPrice) * pos.leverage * 100;
    maxAdverse = ((pos.entryPrice - pos.lowestPriceSinceEntry) / pos.entryPrice) * pos.leverage * 100;
  } else {
    maxFavorable = ((pos.entryPrice - pos.lowestPriceSinceEntry) / pos.entryPrice) * pos.leverage * 100;
    maxAdverse = ((pos.highestPriceSinceEntry - pos.entryPrice) / pos.entryPrice) * pos.leverage * 100;
  }

  return {
    id: pos.id,
    symbol: pos.symbol,
    side: pos.side,
    patternName: pos.patternName,
    entryTime: pos.entryTime,
    exitTime,
    entryPrice: pos.entryPrice,
    exitPrice: actualExitPrice,
    quantity: pos.quantity,
    leverage: pos.leverage,
    marginUsed: pos.marginUsed,
    initialSlPrice: pos.stopLossPrice ?? 0,
    initialTpPrice: pos.takeProfitPrice ?? 0,
    grossPnl,
    netPnl,
    pnlPercent,
    totalFee,
    exitReason,
    holdingBars: exitIndex - pos.entryIndex,
    maxFavorableExcursion: Math.max(0, maxFavorable),
    maxAdverseExcursion: Math.max(0, maxAdverse),
  };
}

function computeMetrics(
  initialCapital: number,
  finalEquity: number,
  trades: Trade[],
  equityCurve: EquityPoint[],
  klines: Kline[]
): BacktestMetrics {
  const netProfit = finalEquity - initialCapital;
  const totalReturnPercent = (netProfit / initialCapital) * 100;

  const startMs = klines[0]?.timestamp ?? 0;
  const endMs = klines[klines.length - 1]?.timestamp ?? 0;
  const durationDays = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));
  const years = durationDays / 365;

  const cagrPercent =
    years > 0 && finalEquity > 0
      ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
      : totalReturnPercent;

  const benchmarkStart = klines[0]?.close ?? 1;
  const benchmarkEnd = klines[klines.length - 1]?.close ?? 1;
  const benchmarkReturnPercent = ((benchmarkEnd - benchmarkStart) / benchmarkStart) * 100;
  const alphaPercent = totalReturnPercent - benchmarkReturnPercent;

  const totalTrades = trades.length;
  const winningTradesList = trades.filter((t) => t.netPnl > 0);
  const losingTradesList = trades.filter((t) => t.netPnl < 0);

  const winningTrades = winningTradesList.length;
  const losingTrades = losingTradesList.length;
  const winRatePercent = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const totalGrossWin = winningTradesList.reduce((acc, t) => acc + t.netPnl, 0);
  const totalGrossLoss = Math.abs(losingTradesList.reduce((acc, t) => acc + t.netPnl, 0));
  const profitFactor = totalGrossLoss > 0 ? totalGrossWin / totalGrossLoss : totalGrossWin > 0 ? 99 : 0;

  const longTradesList = trades.filter((t) => t.side === 'LONG');
  const shortTradesList = trades.filter((t) => t.side === 'SHORT');
  const longWins = longTradesList.filter((t) => t.netPnl > 0).length;
  const shortWins = shortTradesList.filter((t) => t.netPnl > 0).length;

  const longTrades = longTradesList.length;
  const shortTrades = shortTradesList.length;
  const longWinRatePercent = longTrades > 0 ? (longWins / longTrades) * 100 : 0;
  const shortWinRatePercent = shortTrades > 0 ? (shortWins / shortTrades) * 100 : 0;

  const avgTradeReturnPercent =
    totalTrades > 0 ? trades.reduce((acc, t) => acc + t.pnlPercent, 0) / totalTrades : 0;
  const avgWin = winningTrades > 0 ? totalGrossWin / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalGrossLoss / losingTrades : 0;
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 0;

  let maxConsecLoss = 0;
  let curLoss = 0;
  for (const t of trades) {
    if (t.netPnl < 0) {
      curLoss++;
      if (curLoss > maxConsecLoss) maxConsecLoss = curLoss;
    } else {
      curLoss = 0;
    }
  }

  let maxDrawdownPercent = 0;
  for (const pt of equityCurve) {
    if (pt.drawdown > maxDrawdownPercent) maxDrawdownPercent = pt.drawdown;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    const cur = equityCurve[i].equity;
    if (prev > 0) {
      returns.push((cur - prev) / prev);
    }
  }

  let meanReturn = 0;
  if (returns.length > 0) {
    meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  }

  let variance = 0;
  let downsideVariance = 0;
  for (const r of returns) {
    const diff = r - meanReturn;
    variance += diff * diff;
    if (r < 0) {
      downsideVariance += r * r;
    }
  }

  const stdDev = returns.length > 1 ? Math.sqrt(variance / (returns.length - 1)) : 0;
  const downsideDev = returns.length > 1 ? Math.sqrt(downsideVariance / (returns.length - 1)) : 0;

  const barsPerYear = 24 * 365;
  const annualFactor = Math.sqrt(barsPerYear);

  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * annualFactor : 0;
  const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * annualFactor : 0;
  const calmarRatio = maxDrawdownPercent > 0 ? cagrPercent / maxDrawdownPercent : 0;

  const totalFeesPaid = trades.reduce((acc, t) => acc + t.totalFee, 0);
  const liquidationsCount = trades.filter((t) => t.exitReason === 'LIQUIDATION').length;

  const slTriggersCount = trades.filter((t) => t.exitReason === 'STOP_LOSS').length;
  const tpTriggersCount = trades.filter((t) => t.exitReason === 'TAKE_PROFIT').length;
  const trailingTriggersCount = trades.filter((t) => t.exitReason === 'TRAILING_STOP').length;
  const avgHoldingBars =
    trades.length > 0 ? trades.reduce((acc, t) => acc + t.holdingBars, 0) / trades.length : 0;

  let largestWinningTradePercent = 0;
  let largestLosingTradePercent = 0;
  for (const t of trades) {
    if (t.pnlPercent > largestWinningTradePercent) largestWinningTradePercent = t.pnlPercent;
    if (t.pnlPercent < largestLosingTradePercent) largestLosingTradePercent = t.pnlPercent;
  }

  return {
    initialCapital,
    finalEquity,
    netProfit,
    totalReturnPercent,
    cagrPercent,
    benchmarkReturnPercent,
    alphaPercent,
    totalTrades,
    winningTrades,
    losingTrades,
    winRatePercent,
    profitFactor,
    longTrades,
    longWinRatePercent,
    shortTrades,
    shortWinRatePercent,
    avgTradeReturnPercent,
    avgWin,
    avgLoss,
    winLossRatio,
    maxConsecutiveLosses: maxConsecLoss,
    maxDrawdownPercent,
    maxDrawdownDurationDays: durationDays,
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    sortinoRatio: Number(sortinoRatio.toFixed(2)),
    calmarRatio: Number(calmarRatio.toFixed(2)),
    totalFeesPaid,
    liquidationsCount,
    slTriggersCount,
    tpTriggersCount,
    trailingTriggersCount,
    avgHoldingBars: Number(avgHoldingBars.toFixed(1)),
    largestWinningTradePercent,
    largestLosingTradePercent,
  };
}
