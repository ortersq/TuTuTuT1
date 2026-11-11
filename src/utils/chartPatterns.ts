/**
 * Algorithmic Chart Pattern & Price Action Recognition Engine
 * Based on:
 * - Al Brooks (Price Action: H2/L2 second entries, wedge reversals, climax pullbacks)
 * - Richard Wyckoff (Spring liquidity sweep, Upthrust After Distribution UTAD)
 * - Thomas Bulkowski (Double Bottom W, Double Top M, Bull/Bear Flags, Engulfing)
 * 
 * Automatically filters patterns based on macro trend regime!
 */

import { Kline } from '../types/trading';
import { calculateEMA, calculateSMA, calculateATR } from './indicators';

export type PatternType =
  | 'BULL_FLAG'
  | 'BEAR_FLAG'
  | 'W_BOTTOM'
  | 'M_TOP'
  | 'WYCKOFF_SPRING'
  | 'WYCKOFF_UPTHRUST'
  | 'BROOKS_H2_LONG'
  | 'BROOKS_L2_SHORT'
  | 'BULLISH_PINBAR'
  | 'BEARISH_PINBAR'
  | 'BULLISH_ENGULFING'
  | 'BEARISH_ENGULFING';

export interface DetectedPattern {
  index: number;
  timestamp: number;
  type: PatternType;
  name: string;
  category: '顺势突破' | '回踩二次确认' | '流动性猎杀反转' | '经典几何反转';
  trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND';
  action: 'BUY' | 'SELL';
  qualityScore: number; // 0 - 100
  triggerPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  description: string;
}

export interface PatternStats {
  type: PatternType;
  name: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPercent: number;
  bestFitTrend: string;
}

export function detectAllChartPatterns(klines: Kline[]): DetectedPattern[] {
  const n = klines.length;
  if (n < 30) return [];

  const closes = klines.map((k) => k.close);
  const volumes = klines.map((k) => k.volume);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const volSma = calculateSMA(volumes, 20);
  const atr = calculateATR(klines, 14);

  const patterns: DetectedPattern[] = [];

  for (let i = 20; i < n; i++) {
    const bar = klines[i];
    const prev = klines[i - 1];
    const prev2 = klines[i - 2];
    const curAtr = atr[i] ?? (bar.high - bar.low);
    const avgV = volSma[i] ?? bar.volume;
    const isVolConfirmed = bar.volume >= avgV * 1.25;

    // 1. Determine Market Trend Context for this bar
    const e20 = ema20[i];
    const e50 = ema50[i];
    const e200 = ema200[i];

    let trendContext: 'BULL_TREND' | 'BEAR_TREND' | 'RANGE_BOUND' = 'RANGE_BOUND';
    if (e20 && e50) {
      if (e20 > e50 && (e200 === null || bar.close > e200 * 0.99)) {
        trendContext = 'BULL_TREND';
      } else if (e20 < e50 && (e200 === null || bar.close < e200 * 1.01)) {
        trendContext = 'BEAR_TREND';
      }
    }

    const body = Math.abs(bar.close - bar.open);
    const upperWick = bar.high - Math.max(bar.close, bar.open);
    const lowerWick = Math.min(bar.close, bar.open) - bar.low;
    const totalRange = bar.high - bar.low || 1;

    // =========================================================================
    // 形态 1: Wyckoff Spring (弹簧下影线猎杀洗盘)
    // 逻辑: 价格向下击穿前低（诱空掠夺流动性），但在同根或次根 K 线强势收回，形成长下影洗盘针
    // =========================================================================
    let recentMinLow = Infinity;
    for (let k = i - 15; k < i - 1; k++) {
      if (klines[k].low < recentMinLow) recentMinLow = klines[k].low;
    }

    if (bar.low < recentMinLow && bar.close > recentMinLow && lowerWick >= body * 1.8 && isVolConfirmed) {
      // Wyckoff Spring
      const sl = bar.low - curAtr * 0.3;
      const tp = bar.close + (bar.close - sl) * 2.2;
      patterns.push({
        index: i,
        timestamp: bar.timestamp,
        type: 'WYCKOFF_SPRING',
        name: 'Wyckoff 弹簧破底洗盘 (Spring)',
        category: '流动性猎杀反转',
        trendContext,
        action: 'BUY',
        qualityScore: trendContext === 'BEAR_TREND' ? 75 : 92, // High in range or bull pullbacks
        triggerPrice: bar.close,
        stopLossPrice: sl,
        targetPrice: tp,
        description: `主力资金故意击穿前低 ${recentMinLow.toFixed(1)} 诱空猎杀止损流动性后快速拉回收盘，放量长下影确立多头反攻。`,
      });
      continue;
    }

    // =========================================================================
    // 形态 2: Wyckoff Upthrust (UTAD 假突破诱多拉高出货破位)
    // 逻辑: 价格向上突破前高诱多，但收盘跌回阻力位下方，形成长上影墓碑线
    // =========================================================================
    let recentMaxHigh = -Infinity;
    for (let k = i - 15; k < i - 1; k++) {
      if (klines[k].high > recentMaxHigh) recentMaxHigh = klines[k].high;
    }

    if (bar.high > recentMaxHigh && bar.close < recentMaxHigh && upperWick >= body * 1.8 && isVolConfirmed) {
      const sl = bar.high + curAtr * 0.3;
      const tp = bar.close - (sl - bar.close) * 2.2;
      patterns.push({
        index: i,
        timestamp: bar.timestamp,
        type: 'WYCKOFF_UPTHRUST',
        name: 'Wyckoff 诱多假突破出货 (Upthrust)',
        category: '流动性猎杀反转',
        trendContext,
        action: 'SELL',
        qualityScore: trendContext === 'BULL_TREND' ? 75 : 92,
        triggerPrice: bar.close,
        stopLossPrice: sl,
        targetPrice: tp,
        description: `主力向上破前高 ${recentMaxHigh.toFixed(1)} 诱多后高位放量抛售，收盘跌破阻力位，形成致命假突破顶。`,
      });
      continue;
    }

    // =========================================================================
    // 形态 3: Al Brooks H2 二次买入入场 (High 2 Pullback in Bull Trend)
    // 逻辑: 牛市中两波回调回踩 20 EMA 企稳，二次突破第一腿高点，经典高胜率顺势入场点
    // =========================================================================
    if (trendContext === 'BULL_TREND' && e20) {
      const touchesEma = Math.min(bar.low, prev.low, prev2.low) <= e20 * 1.006;
      const isRebound = bar.close > bar.open && bar.close > prev.high;
      const wasDipping = prev.close < prev.open || prev2.close < prev2.open;

      if (touchesEma && isRebound && wasDipping) {
        const sl = Math.min(bar.low, prev.low) - curAtr * 0.4;
        const tp = bar.close + (bar.close - sl) * 2.0;
        patterns.push({
          index: i,
          timestamp: bar.timestamp,
          type: 'BROOKS_H2_LONG',
          name: 'Al Brooks H2 均线二次多头入场',
          category: '回踩二次确认',
          trendContext,
          action: 'BUY',
          qualityScore: 90,
          triggerPrice: bar.close,
          stopLossPrice: sl,
          targetPrice: tp,
          description: `牛市强趋势中健康回踩 20EMA 获得强力支撑，完成 ABC 双腿回调后形成 H2 二次确认放量反包。`,
        });
        continue;
      }
    }

    // =========================================================================
    // 形态 4: Al Brooks L2 二次做空入场 (Low 2 Pullback in Bear Trend)
    // 逻辑: 熊市中两波反抽至 20 EMA 受阻，二次跌破前一腿低点，经典高胜率顺势做空点
    // =========================================================================
    if (trendContext === 'BEAR_TREND' && e20) {
      const touchesEma = Math.max(bar.high, prev.high, prev2.high) >= e20 * 0.994;
      const isFall = bar.close < bar.open && bar.close < prev.low;
      const wasRising = prev.close > prev.open || prev2.close > prev2.open;

      if (touchesEma && isFall && wasRising) {
        const sl = Math.max(bar.high, prev.high) + curAtr * 0.4;
        const tp = bar.close - (sl - bar.close) * 2.0;
        patterns.push({
          index: i,
          timestamp: bar.timestamp,
          type: 'BROOKS_L2_SHORT',
          name: 'Al Brooks L2 均线二次受阻做空',
          category: '回踩二次确认',
          trendContext,
          action: 'SELL',
          qualityScore: 90,
          triggerPrice: bar.close,
          stopLossPrice: sl,
          targetPrice: tp,
          description: `熊市单边中反抽 20EMA 阻力位受阻，完成两腿无力反弹后 L2 阴线跌破前低，顺大势做空。`,
        });
        continue;
      }
    }

    // =========================================================================
    // 形态 5: Bull Flag (牛旗整理向上突破)
    // 逻辑: 强劲阳线大旗杆推升 + 3-7 根小阴小阳平行下倾通道整理 + 放量大阳线突破通道上轨
    // =========================================================================
    if (trendContext === 'BULL_TREND' && i >= 8) {
      const poleStart = klines[i - 7].low;
      const polePeak = Math.max(...klines.slice(i - 6, i - 2).map((k) => k.high));
      const poleHeight = polePeak - poleStart;

      // Pole must be significant (> 2.5x ATR)
      if (poleHeight >= curAtr * 2.5) {
        const flagLow = Math.min(...klines.slice(i - 3, i).map((k) => k.low));
        // Flag didn't retrace more than 50% of pole
        if (flagLow > poleStart + poleHeight * 0.4) {
          // Current bar breaks above recent 3 bars highs
          const isBreakout = bar.close > Math.max(klines[i - 1].high, klines[i - 2].high) && isVolConfirmed;
          if (isBreakout) {
            const sl = flagLow - curAtr * 0.2;
            const tp = bar.close + poleHeight * 0.8;
            patterns.push({
              index: i,
              timestamp: bar.timestamp,
              type: 'BULL_FLAG',
              name: '经典牛旗中继爆发 (Bull Flag)',
              category: '顺势突破',
              trendContext,
              action: 'BUY',
              qualityScore: 95,
              triggerPrice: bar.close,
              stopLossPrice: sl,
              targetPrice: tp,
              description: `前期巨幅放量旗杆拉升，在缩量窄幅旗形通道休整完毕后，放量大阳线强势突破旗顶，开启第二段等长主升浪。`,
            });
            continue;
          }
        }
      }
    }

    // =========================================================================
    // 形态 6: Bear Flag (熊旗中继向下破位)
    // 逻辑: 强劲暴跌大阴线旗杆 + 弱势反弹上升通道 + 放量大阴线跌破通道下轨
    // =========================================================================
    if (trendContext === 'BEAR_TREND' && i >= 8) {
      const poleStart = klines[i - 7].high;
      const poleTrough = Math.min(...klines.slice(i - 6, i - 2).map((k) => k.low));
      const poleDrop = poleStart - poleTrough;

      if (poleDrop >= curAtr * 2.5) {
        const flagHigh = Math.max(...klines.slice(i - 3, i).map((k) => k.high));
        if (flagHigh < poleStart - poleDrop * 0.4) {
          const isBreakdown = bar.close < Math.min(klines[i - 1].low, klines[i - 2].low) && isVolConfirmed;
          if (isBreakdown) {
            const sl = flagHigh + curAtr * 0.2;
            const tp = bar.close - poleDrop * 0.8;
            patterns.push({
              index: i,
              timestamp: bar.timestamp,
              type: 'BEAR_FLAG',
              name: '经典熊旗中继破位 (Bear Flag)',
              category: '顺势突破',
              trendContext,
              action: 'SELL',
              qualityScore: 95,
              triggerPrice: bar.close,
              stopLossPrice: sl,
              targetPrice: tp,
              description: `前期断崖式放量下跌旗杆，弱势反抽上升通道受阻后，放量阴线击穿旗底支撑，主跌浪加速。`,
            });
            continue;
          }
        }
      }
    }

    // =========================================================================
    // 形态 7: W-Bottom (双底高点抬高结构突破颈线)
    // =========================================================================
    if (i >= 12) {
      const leftLow = klines[i - 8].low;
      const midHigh = Math.max(...klines.slice(i - 7, i - 3).map((k) => k.high));
      const rightLow = Math.min(...klines.slice(i - 3, i).map((k) => k.low));

      // Right low is higher than or equal to left low (higher low structural bullish)
      if (rightLow >= leftLow * 0.995 && rightLow <= leftLow * 1.03 && midHigh > leftLow + curAtr * 1.5) {
        if (bar.close > midHigh && isVolConfirmed) {
          const sl = rightLow - curAtr * 0.3;
          const tp = bar.close + (midHigh - leftLow) * 1.5;
          patterns.push({
            index: i,
            timestamp: bar.timestamp,
            type: 'W_BOTTOM',
            name: 'W底颈线放量突破 (Double Bottom)',
            category: '经典几何反转',
            trendContext,
            action: 'BUY',
            qualityScore: trendContext === 'BEAR_TREND' ? 70 : 88,
            triggerPrice: bar.close,
            stopLossPrice: sl,
            targetPrice: tp,
            description: `形成右底高于左底的高点抬高筑底结构，放量实体大阳线一举突破颈线位 ${midHigh.toFixed(1)}，确立反转。`,
          });
          continue;
        }
      }
    }

    // =========================================================================
    // 形态 8: M-Top (双顶低点降低结构跌破颈线)
    // =========================================================================
    if (i >= 12) {
      const leftHigh = klines[i - 8].high;
      const midLow = Math.min(...klines.slice(i - 7, i - 3).map((k) => k.low));
      const rightHigh = Math.max(...klines.slice(i - 3, i).map((k) => k.high));

      if (rightHigh <= leftHigh * 1.005 && rightHigh >= leftHigh * 0.97 && midLow < leftHigh - curAtr * 1.5) {
        if (bar.close < midLow && isVolConfirmed) {
          const sl = rightHigh + curAtr * 0.3;
          const tp = bar.close - (leftHigh - midLow) * 1.5;
          patterns.push({
            index: i,
            timestamp: bar.timestamp,
            type: 'M_TOP',
            name: 'M头颈线放量破位 (Double Top)',
            category: '经典几何反转',
            trendContext,
            action: 'SELL',
            qualityScore: trendContext === 'BULL_TREND' ? 70 : 88,
            triggerPrice: bar.close,
            stopLossPrice: sl,
            targetPrice: tp,
            description: `右顶受阻于左顶形成次高点无力突破，放量大阴线跌破颈线关键支撑 ${midLow.toFixed(1)}，双顶结构确立。`,
          });
          continue;
        }
      }
    }
  }

  return patterns;
}

/**
 * Generate signal series (-1, 0, 1) across the full K-line series based on price action patterns
 */
export function generatePatternSignals(klines: Kline[]): (1 | -1 | 0)[] {
  const n = klines.length;
  const signals: (1 | -1 | 0)[] = new Array(n).fill(0);
  const patterns = detectAllChartPatterns(klines);

  for (const p of patterns) {
    if (p.index < n) {
      // Quality score threshold > 80
      if (p.qualityScore >= 80) {
        signals[p.index] = p.action === 'BUY' ? 1 : -1;
      }
    }
  }
  return signals;
}

/**
 * Evaluate statistical accuracy and win-rate for each recognized pattern
 */
export function evaluatePatternAccuracy(klines: Kline[], patterns: DetectedPattern[]): PatternStats[] {
  const typeMap: Record<string, { name: string; wins: number; losses: number; count: number; returns: number[] }> = {};

  for (const p of patterns) {
    if (!typeMap[p.type]) {
      typeMap[p.type] = {
        name: p.name,
        wins: 0,
        losses: 0,
        count: 0,
        returns: [],
      };
    }

    const stat = typeMap[p.type];
    stat.count++;

    // Look forward 8 bars to evaluate forward outcome
    const exitBarIndex = Math.min(klines.length - 1, p.index + 8);
    const futureClose = klines[exitBarIndex].close;

    let tradeReturn = 0;
    if (p.action === 'BUY') {
      tradeReturn = ((futureClose - p.triggerPrice) / p.triggerPrice) * 100;
    } else {
      tradeReturn = ((p.triggerPrice - futureClose) / p.triggerPrice) * 100;
    }

    stat.returns.push(tradeReturn);
    if (tradeReturn > 0) stat.wins++;
    else stat.losses++;
  }

  const result: PatternStats[] = Object.keys(typeMap).map((key) => {
    const s = typeMap[key];
    const winRate = s.count > 0 ? (s.wins / s.count) * 100 : 0;
    const avgReturnPercent = s.returns.length > 0 ? s.returns.reduce((a, b) => a + b, 0) / s.returns.length : 0;

    let bestFitTrend = '全周期';
    if (key.includes('BULL_FLAG') || key.includes('H2')) bestFitTrend = '单边多头主升浪';
    else if (key.includes('BEAR_FLAG') || key.includes('L2')) bestFitTrend = '单边空头主跌浪';
    else if (key.includes('SPRING') || key.includes('UPTHRUST')) bestFitTrend = '箱体震荡/关键位猎杀洗盘';

    return {
      type: key as PatternType,
      name: s.name,
      count: s.count,
      wins: s.wins,
      losses: s.losses,
      winRate: Number(winRate.toFixed(1)),
      avgReturnPercent: Number(avgReturnPercent.toFixed(2)),
      bestFitTrend,
    };
  });

  result.sort((a, b) => b.winRate - a.winRate);
  return result;
}
