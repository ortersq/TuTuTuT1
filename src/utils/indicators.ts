import { Kline } from '../types/trading';

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result[i] = sum / period;
  }
  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  const multiplier = 2 / (period + 1);

  // Initial SMA as first EMA seed
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;

  for (let i = period; i < data.length; i++) {
    prevEma = (data[i] - prevEma) * multiplier + prevEma;
    result[i] = prevEma;
  }
  return result;
}

/**
 * True Range (TR)
 */
export function calculateTR(klines: Kline[]): number[] {
  const tr: number[] = new Array(klines.length).fill(0);
  if (klines.length === 0) return tr;

  tr[0] = klines[0].high - klines[0].low;

  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;

    const hl = high - low;
    const hpc = Math.abs(high - prevClose);
    const lpc = Math.abs(low - prevClose);

    tr[i] = Math.max(hl, hpc, lpc);
  }
  return tr;
}

/**
 * Average True Range (ATR)
 */
export function calculateATR(klines: Kline[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(klines.length).fill(null);
  if (klines.length < period) return result;

  const tr = calculateTR(klines);

  // Initial ATR is simple average of first period TRs
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  let prevAtr = sum / period;
  result[period - 1] = prevAtr;

  // RMA smoothing (Wilder's)
  for (let i = period; i < klines.length; i++) {
    prevAtr = (prevAtr * (period - 1) + tr[i]) / period;
    result[i] = prevAtr;
  }
  return result;
}

/**
 * Relative Strength Index (RSI) using Wilder's smoothing
 */
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));
  }

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }
  return result;
}

/**
 * Bollinger Bands
 */
export interface BollingerBandsResult {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBandsResult {
  const middle = calculateSMA(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  const bandwidth: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const mid = middle[i];
    if (mid === null) continue;

    // Variance
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - mid;
      sumSq += diff * diff;
    }
    const stdDev = Math.sqrt(sumSq / period);

    upper[i] = mid + stdDevMultiplier * stdDev;
    lower[i] = mid - stdDevMultiplier * stdDev;
    bandwidth[i] = mid > 0 ? ((upper[i]! - lower[i]!) / mid) * 100 : 0;
  }

  return { middle, upper, lower, bandwidth };
}

/**
 * MACD Indicator
 */
export interface MACDResult {
  dif: (number | null)[];
  dea: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const dif: (number | null)[] = new Array(closes.length).fill(null);
  const difValidValues: number[] = [];
  const difValidIndices: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      const val = fastEMA[i]! - slowEMA[i]!;
      dif[i] = val;
      difValidValues.push(val);
      difValidIndices.push(i);
    }
  }

  const dea: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);

  if (difValidValues.length >= signalPeriod) {
    const signalEMA = calculateEMA(difValidValues, signalPeriod);
    for (let j = 0; j < signalEMA.length; j++) {
      const origIndex = difValidIndices[j];
      const sigVal = signalEMA[j];
      dea[origIndex] = sigVal;
      if (sigVal !== null && dif[origIndex] !== null) {
        histogram[origIndex] = (dif[origIndex]! - sigVal) * 2;
      }
    }
  }

  return { dif, dea, histogram };
}

/**
 * SuperTrend Indicator
 * Classic ATR dynamic trailing stop calculation
 */
export interface SuperTrendResult {
  trend: (1 | -1 | null)[]; // 1 = Bullish, -1 = Bearish
  supertrend: (number | null)[];
}

export function calculateSuperTrend(
  klines: Kline[],
  period: number = 10,
  multiplier: number = 3.0
): SuperTrendResult {
  const n = klines.length;
  const trend: (1 | -1 | null)[] = new Array(n).fill(null);
  const supertrend: (number | null)[] = new Array(n).fill(null);

  if (n < period) return { trend, supertrend };

  const atr = calculateATR(klines, period);

  const upperBand: number[] = new Array(n).fill(0);
  const lowerBand: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const curAtr = atr[i] ?? (klines[i].high - klines[i].low);
    const hl2 = (klines[i].high + klines[i].low) / 2;
    const basicUpper = hl2 + multiplier * curAtr;
    const basicLower = hl2 - multiplier * curAtr;

    if (i === 0) {
      upperBand[i] = basicUpper;
      lowerBand[i] = basicLower;
      trend[i] = 1;
      supertrend[i] = lowerBand[i];
      continue;
    }

    const prevClose = klines[i - 1].close;
    // Final upper band
    if (basicUpper < upperBand[i - 1] || prevClose > upperBand[i - 1]) {
      upperBand[i] = basicUpper;
    } else {
      upperBand[i] = upperBand[i - 1];
    }

    // Final lower band
    if (basicLower > lowerBand[i - 1] || prevClose < lowerBand[i - 1]) {
      lowerBand[i] = basicLower;
    } else {
      lowerBand[i] = lowerBand[i - 1];
    }

    const prevTrend = trend[i - 1] ?? 1;

    if (prevTrend === 1) {
      if (klines[i].close < lowerBand[i]) {
        trend[i] = -1;
        supertrend[i] = upperBand[i];
      } else {
        trend[i] = 1;
        supertrend[i] = lowerBand[i];
      }
    } else {
      if (klines[i].close > upperBand[i]) {
        trend[i] = 1;
        supertrend[i] = lowerBand[i];
      } else {
        trend[i] = -1;
        supertrend[i] = upperBand[i];
      }
    }
  }

  return { trend, supertrend };
}

/**
 * Dual Thrust CTA Calculation
 * Developed by Michael Chalek, one of the most resilient trend breakout systems.
 */
export interface DualThrustResult {
  buyTrigger: (number | null)[];
  sellTrigger: (number | null)[];
  range: (number | null)[];
}

export function calculateDualThrust(
  klines: Kline[],
  lookback: number = 4,
  k1: number = 0.5,
  k2: number = 0.5
): DualThrustResult {
  const n = klines.length;
  const buyTrigger: (number | null)[] = new Array(n).fill(null);
  const sellTrigger: (number | null)[] = new Array(n).fill(null);
  const range: (number | null)[] = new Array(n).fill(null);

  if (n <= lookback) return { buyTrigger, sellTrigger, range };

  for (let i = lookback; i < n; i++) {
    let highestHigh = -Infinity;
    let lowestClose = Infinity;
    let highestClose = -Infinity;
    let lowestLow = Infinity;

    for (let j = i - lookback; j < i; j++) {
      if (klines[j].high > highestHigh) highestHigh = klines[j].high;
      if (klines[j].close < lowestClose) lowestClose = klines[j].close;
      if (klines[j].close > highestClose) highestClose = klines[j].close;
      if (klines[j].low < lowestLow) lowestLow = klines[j].low;
    }

    const rangeVal = Math.max(highestHigh - lowestClose, highestClose - lowestLow);
    const openPrice = klines[i].open;

    range[i] = rangeVal;
    buyTrigger[i] = openPrice + k1 * rangeVal;
    sellTrigger[i] = openPrice - k2 * rangeVal;
  }

  return { buyTrigger, sellTrigger, range };
}

/**
 * Average Directional Index (ADX) for Market Regime Detection
 * ADX > 25: Strong trending regime (suitable for trend following & breakouts)
 * ADX <= 25: Range-bound consolidation (suitable for mean reversion & grid)
 */
export function calculateADX(klines: Kline[], period: number = 14): (number | null)[] {
  const n = klines.length;
  const adx: (number | null)[] = new Array(n).fill(null);
  if (n <= period * 2) return adx;

  const tr = calculateTR(klines);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = klines[i].high - klines[i - 1].high;
    const downMove = klines[i - 1].low - klines[i].low;

    if (upMove > downMove && upMove > 0) {
      plusDM[i] = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM[i] = downMove;
    }
  }

  // Smooth TR, +DM, -DM using Wilder's RMA
  let trSum = 0;
  let plusDmSum = 0;
  let minusDmSum = 0;

  for (let i = 1; i <= period; i++) {
    trSum += tr[i];
    plusDmSum += plusDM[i];
    minusDmSum += minusDM[i];
  }

  const dxList: { index: number; dx: number }[] = [];

  let smoothTr = trSum;
  let smoothPlusDm = plusDmSum;
  let smoothMinusDm = minusDmSum;

  const plusDI0 = smoothTr > 0 ? (smoothPlusDm / smoothTr) * 100 : 0;
  const minusDI0 = smoothTr > 0 ? (smoothMinusDm / smoothTr) * 100 : 0;
  const sumDI0 = plusDI0 + minusDI0;
  const dx0 = sumDI0 > 0 ? (Math.abs(plusDI0 - minusDI0) / sumDI0) * 100 : 0;
  dxList.push({ index: period, dx: dx0 });

  for (let i = period + 1; i < n; i++) {
    smoothTr = smoothTr - smoothTr / period + tr[i];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDM[i];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDM[i];

    const plusDI = smoothTr > 0 ? (smoothPlusDm / smoothTr) * 100 : 0;
    const minusDI = smoothTr > 0 ? (smoothMinusDm / smoothTr) * 100 : 0;
    const sumDI = plusDI + minusDI;
    const dx = sumDI > 0 ? (Math.abs(plusDI - minusDI) / sumDI) * 100 : 0;
    dxList.push({ index: i, dx });
  }

  // Smooth DX to get ADX
  if (dxList.length >= period) {
    let dxSum = 0;
    for (let j = 0; j < period; j++) {
      dxSum += dxList[j].dx;
    }
    let prevAdx = dxSum / period;
    adx[dxList[period - 1].index] = prevAdx;

    for (let j = period; j < dxList.length; j++) {
      prevAdx = (prevAdx * (period - 1) + dxList[j].dx) / period;
      adx[dxList[j].index] = prevAdx;
    }
  }

  return adx;
}
