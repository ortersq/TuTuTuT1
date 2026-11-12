import { BotTradeRecord } from '../server/botEngine';
import { VolatilityLevel, HeatmapCellData, HeatmapSampleTrade } from '../types/trading';

export type { VolatilityLevel, HeatmapCellData, HeatmapSampleTrade };

export interface HeatmapOptions {
  symbol?: string; // 'ALL' or specific symbol
  interval?: string; // 'ALL' or specific interval
  timezoneOffsetHours?: number; // 0 for UTC, 8 for UTC+8 (Beijing/Singapore)
}

export interface HeatmapSummary {
  totalAnalyzedTrades: number;
  overallWinRate: number;
  totalNetPnl: number;
  totalReversionUsdt: number;
  avgReversionRatePercent: number;
  highestReversionHour: number;
  highestReversionSession: string;
  mostVulnerableVolatilityLevel: VolatilityLevel;
  estimatedSalvagedPnlWithBreakevenLock: number;
}

export const VOLATILITY_LEVELS: VolatilityLevel[] = ['EXTREME', 'HIGH', 'NORMAL', 'LOW'];

export const VOLATILITY_META: Record<
  VolatilityLevel,
  { label: string; range: string; desc: string; color: string }
> = {
  EXTREME: {
    label: '极高波动 (Extreme)',
    range: '振幅 > 3.0%',
    desc: '美洲开盘暴拉、数据发布或深度插针行情，极易剧烈回吐',
    color: '#ef4444',
  },
  HIGH: {
    label: '较高波动 (High)',
    range: '振幅 1.8% ~ 3.0%',
    desc: '欧美重叠交易时段，单边与假突破并存，冲高快速回落',
    color: '#f97316',
  },
  NORMAL: {
    label: '标准波动 (Normal)',
    range: '振幅 0.9% ~ 1.8%',
    desc: '常规趋势与回踩形态推演，技术面形态顺势传导良好',
    color: '#3b82f6',
  },
  LOW: {
    label: '低波动平缓 (Low)',
    range: '振幅 < 0.9%',
    desc: '亚盘箱体横盘或休市整理，动能衰竭易久盘损耗资金',
    color: '#10b981',
  },
};

export const SESSIONS_META = [
  { name: '🌏 亚洲盘 (Asia)', hours: [0, 1, 2, 3, 4, 5, 6, 7], desc: '流动性适中，以箱体震荡及假突破为主' },
  { name: '🇬🇧 伦敦盘 (London)', hours: [8, 9, 10, 11, 12], desc: '欧盘资金入场，日内第一波单边趋势启动' },
  { name: '🇺🇸 纽约主战区 (NY Open)', hours: [13, 14, 15, 16, 17], desc: '全球流动性焦点，暴拉插针及回吐重灾区！' },
  { name: '🌙 美洲盘后/结算 (NY Close)', hours: [18, 19, 20, 21, 22, 23], desc: '量能收敛，动能衰竭易回撤' },
];

/**
 * Determine optimal stop loss / profit protection prescription based on hour and volatility
 */
export function getOptimalStopLossPrescription(
  hour: number,
  volLevel: VolatilityLevel,
  avgReversion: number
): { pattern: string; details: string; dominantExit: string } {
  if (volLevel === 'EXTREME' || (hour >= 13 && hour <= 17)) {
    return {
      pattern: '阶梯式保本锁定 + 0.45% 紧敏追踪 (Stepped Breakeven & Micro-Trailing)',
      details:
        '浮盈达 +$25 时即刻提升止损至成本价 (0风险)，浮盈超过 +$50 强制锁定至少 65% 利润。严禁在美盘插针中死扛宽止损！',
      dominantExit: avgReversion > 25 ? 'PROFIT_PROTECT_EXIT' : 'TRAILING_STOP',
    };
  }

  if (volLevel === 'HIGH') {
    return {
      pattern: 'ATR 动态缓冲止损 + 2.2x 盈亏比自动平仓 (Dynamic ATR Buffer & Strict RR)',
      details:
        '开仓设置 1.8x ATR 结构缓冲避开小幅洗盘；当浮盈突破 1.5% 时自动启动追踪，回撤 0.6% 坚决离场锁定利润。',
      dominantExit: 'TRAILING_STOP',
    };
  }

  if (volLevel === 'LOW') {
    return {
      pattern: '形态极值结构止损 + 2.0h 动能衰竭限时平仓 (Swing Extreme SL & Decay Exit)',
      details:
        '以入场前 K 线高低点结构止损；低波动下持仓超过 2 小时未放量突破即视为动能衰竭，平仓释放保证金占用。',
      dominantExit: 'MOMENTUM_DECAY_TIMEOUT',
    };
  }

  return {
    pattern: '50 EMA 趋势线防守 + 阶梯分批止盈 (50 EMA Trend Defense & Tiered TP)',
    details:
      '顺应多空趋势通道，价格跌破 50 EMA 关键防守即判定形态推演失效；浮盈超过 +$35 锁定 50% 底线收益。',
    dominantExit: 'TAKE_PROFIT',
  };
}

/**
 * Aggregates only real closed trades (no fake or empirical filling) into a 24x4 Grid Matrix
 */
export function aggregateHeatmapData(
  trades: BotTradeRecord[] = [],
  options: HeatmapOptions = {}
): HeatmapCellData[][] {
  const { symbol = 'ALL', interval = 'ALL', timezoneOffsetHours = 0 } = options;

  // Filter relevant trades strictly
  const filteredTrades = trades.filter((t) => {
    if (symbol !== 'ALL' && t.symbol !== symbol) return false;
    if (interval !== 'ALL' && t.interval !== interval) return false;
    return true;
  });

  // Group real trades by (hour, volatilityLevel)
  const realTradesMap = new Map<string, BotTradeRecord[]>();

  for (const trade of filteredTrades) {
    const tradeDate = new Date(trade.entryTime || trade.exitTime);
    let h = (tradeDate.getUTCHours() + timezoneOffsetHours) % 24;
    if (h < 0) h += 24;

    const vol: VolatilityLevel = trade.volatilityLevel || 'NORMAL';
    const key = `${h}_${vol}`;
    if (!realTradesMap.has(key)) {
      realTradesMap.set(key, []);
    }
    realTradesMap.get(key)!.push(trade);
  }

  // Build the 4 x 24 matrix
  const matrix: HeatmapCellData[][] = [];

  for (const volLevel of VOLATILITY_LEVELS) {
    const row: HeatmapCellData[] = [];

    for (let h = 0; h < 24; h++) {
      const key = `${h}_${volLevel}`;
      const cellRealTrades = realTradesMap.get(key) || [];

      const tradesCount = cellRealTrades.length;
      const winningTrades = cellRealTrades.filter((t) => t.netPnl > 0).length;
      const losingTrades = cellRealTrades.filter((t) => t.netPnl <= 0).length;
      const totalNetPnl = cellRealTrades.reduce((acc, t) => acc + t.netPnl, 0);
      const totalPeakPnl = cellRealTrades.reduce((acc, t) => acc + (t.peakPnlUsdt || 0), 0);
      const totalReversion = cellRealTrades.reduce((acc, t) => acc + (t.reversionUsdt || 0), 0);

      const winRate = tradesCount > 0 ? (winningTrades / tradesCount) * 100 : 0;
      const avgNetPnl = tradesCount > 0 ? totalNetPnl / tradesCount : 0;
      const avgPeakPnl = tradesCount > 0 ? totalPeakPnl / tradesCount : 0;
      const avgReversion = tradesCount > 0 ? totalReversion / tradesCount : 0;

      // Reversion severity score: 0 to 100 based strictly on real trade metrics
      let severity = 0;
      if (tradesCount > 0) {
        const reversionRatio = avgPeakPnl > 0 ? Math.min(1.5, avgReversion / avgPeakPnl) : 0;
        severity = Math.min(100, Math.round(reversionRatio * 50 + (avgReversion / 80) * 50));
        if (avgNetPnl < 0 && avgPeakPnl > 25) {
          severity = Math.max(75, severity);
        }
      }

      const prescription = getOptimalStopLossPrescription(h, volLevel, avgReversion);

      // Only real trade samples from actual execution
      const sampleTrades: HeatmapSampleTrade[] = cellRealTrades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        interval: t.interval,
        side: t.side,
        patternName: t.patternName,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        netPnl: t.netPnl,
        peakPnl: t.peakPnlUsdt || 0,
        reversionUsdt: t.reversionUsdt || 0,
        exitReason: t.exitReason,
        exitTime: t.exitTime,
      }));

      row.push({
        hour: h,
        volatilityLevel: volLevel,
        tradesCount,
        winningTrades,
        losingTrades,
        winRate: Number(winRate.toFixed(1)),
        totalNetPnl: Number(totalNetPnl.toFixed(2)),
        avgNetPnl: Number(avgNetPnl.toFixed(2)),
        avgPeakPnl: Number(avgPeakPnl.toFixed(2)),
        avgReversion: Number(avgReversion.toFixed(2)),
        reversionSeverityScore: severity,
        optimalStopLossPattern: prescription.pattern,
        optimalStopLossDetails: prescription.details,
        dominantExitReason: cellRealTrades.length > 0 ? cellRealTrades[0].exitReason : prescription.dominantExit,
        sampleTrades,
      });
    }

    matrix.push(row);
  }

  return matrix;
}

/**
 * Computes top-level heatmap metrics strictly based on real trades (0 if no trades yet)
 */
export function calculateHeatmapSummary(matrix: HeatmapCellData[][]): HeatmapSummary {
  let totalTrades = 0;
  let totalWins = 0;
  let totalNetPnl = 0;
  let totalReversion = 0;
  let totalPeakPnl = 0;

  const hourReversionMap = new Array<number>(24).fill(0);
  const volReversionMap: Record<VolatilityLevel, number> = {
    EXTREME: 0,
    HIGH: 0,
    NORMAL: 0,
    LOW: 0,
  };

  for (const row of matrix) {
    for (const cell of row) {
      totalTrades += cell.tradesCount;
      totalWins += cell.winningTrades;
      totalNetPnl += cell.totalNetPnl;
      totalReversion += cell.avgReversion * cell.tradesCount;
      totalPeakPnl += cell.avgPeakPnl * cell.tradesCount;

      hourReversionMap[cell.hour] += cell.avgReversion * cell.tradesCount;
      volReversionMap[cell.volatilityLevel] += cell.avgReversion * cell.tradesCount;
    }
  }

  if (totalTrades === 0) {
    return {
      totalAnalyzedTrades: 0,
      overallWinRate: 0,
      totalNetPnl: 0,
      totalReversionUsdt: 0,
      avgReversionRatePercent: 0,
      highestReversionHour: 14,
      highestReversionSession: '暂无已完成调单',
      mostVulnerableVolatilityLevel: 'NORMAL',
      estimatedSalvagedPnlWithBreakevenLock: 0,
    };
  }

  // Find hour with highest reversion
  let highestReversionHour = 0;
  let maxHourRev = -1;
  hourReversionMap.forEach((rev, h) => {
    if (rev > maxHourRev) {
      maxHourRev = rev;
      highestReversionHour = h;
    }
  });

  // Find worst volatility tier
  let mostVulnerableVolatilityLevel: VolatilityLevel = 'NORMAL';
  let maxVolRev = -1;
  for (const v of VOLATILITY_LEVELS) {
    if (volReversionMap[v] > maxVolRev) {
      maxVolRev = volReversionMap[v];
      mostVulnerableVolatilityLevel = v;
    }
  }

  const sessionObj = SESSIONS_META.find((s) => s.hours.includes(highestReversionHour));
  const highestReversionSession = sessionObj ? sessionObj.name : '未知时段';

  const avgReversionRatePercent = totalPeakPnl > 0 ? (totalReversion / totalPeakPnl) * 100 : 0;
  const estimatedSalvagedPnlWithBreakevenLock = totalReversion * 0.58;

  return {
    totalAnalyzedTrades: totalTrades,
    overallWinRate: Number(((totalWins / totalTrades) * 100).toFixed(1)),
    totalNetPnl: Number(totalNetPnl.toFixed(2)),
    totalReversionUsdt: Number(totalReversion.toFixed(2)),
    avgReversionRatePercent: Number(avgReversionRatePercent.toFixed(1)),
    highestReversionHour,
    highestReversionSession,
    mostVulnerableVolatilityLevel,
    estimatedSalvagedPnlWithBreakevenLock: Number(estimatedSalvagedPnlWithBreakevenLock.toFixed(2)),
  };
}
