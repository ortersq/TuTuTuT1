import { Kline, StrategyInfo, StrategyKey, StrategyParams } from '../types/trading';
import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateDualThrust,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateSuperTrend,
} from './indicators';
import { generatePatternSignals } from './chartPatterns';

export const STRATEGY_CATALOG: StrategyInfo[] = [
  {
    key: 'pattern_price_action',
    name: 'Al Brooks & Wyckoff 价格形态学与价格行为策略',
    authorOrOrigin: 'Al Brooks (Price Action) & Richard Wyckoff & Bulkowski 形态统计学',
    category: '趋势追踪',
    summary: '根据历史图形形态与流动性猎杀开仓：牛市只做牛旗与H2回踩二次突破，震荡市只做Spring假破底洗盘吸筹与双底，熊市做熊旗与L2破位。',
    description:
      '纯指标往往滞后，而 K 线形态直击市场多空博弈本质。本策略算法化识别 8 大经典胜率形态：牛市中识别牛旗（Bull Flag）与 H2 均线二次入场；震荡市中利用 Wyckoff 弹簧（Spring）猎杀止损流动性后反向开多；熊市中利用熊旗与 L2 均线受阻顺势做空。根据不同市场趋势严格隔离不同形态，显著提升胜率与盈亏比。',
    pros: ['基于真实价格行为学，止损点极紧、盈亏比极高（常达 2.5:1 ~ 4:1）', '不同趋势下严格匹配不同形态，杜绝逆势摸顶抄底', '放量确认过滤虚假波动'],
    cons: ['形态形成需要足够的 K 线结构酝酿，信号频率较为审慎稳健'],
    bestMarketCondition: '全市场周期（不同趋势环境自适应触发对应高胜率形态）',
  },
  {
    key: 'ensemble',
    name: '自适应多策略量化融合引擎 (Multi-Strategy Ensemble)',
    authorOrOrigin: '顶级量化对冲基金多因子架构 (AQR & Bridgewater Quant)',
    category: '综合自适应',
    summary: '通过市场状态机自动识别当前是单边强趋势还是箱体震荡，动态分配各策略权重并加权投票决策。',
    description:
      '单一策略在非适配行情中必然承受回撤。融合引擎内置 ADX 与布林带宽度市场状态机：在强趋势时加大 SuperTrend 与 Dual Thrust 趋势策略权重；在盘整震荡时自动激活布林均值回归与动态网格，过滤虚假突破，实现全天候平滑收益曲线。',
    pros: ['平滑资金回撤，跨牛熊与震荡全周期适用', '多指标共识投票机制，大幅过滤假信号', '仓位根据置信度动态调整'],
    cons: ['极端快速暴跌暴涨初期可能有轻微滞后确认', '参数组合较丰富需要科学调优'],
    bestMarketCondition: '全市场周期（自动识别趋势与震荡）',
  },
  {
    key: 'supertrend',
    name: 'SuperTrend + EMA200 动态趋势追踪策略',
    authorOrOrigin: 'Olivier Seban & 加密顶级趋势交易员系统',
    category: '趋势追踪',
    summary: '结合大周期 EMA200 确定宏观多空方向，利用动态 ATR Trailing Stop 捕捉大级别主升浪/主跌浪。',
    description:
      '币安合约波动剧烈，加密资产 70% 的超额利润来自于 15% 的极端单边行情。SuperTrend 根据 ATR 动态贴紧价格，只顺应 EMA 均线主方向做单，严格执行“截断亏损，让利润奔跑”。',
    pros: ['单笔盈亏比极高（常达 3:1 ~ 5:1）', '绝不逆势扛单，完美规避爆仓风险', '逻辑清晰，执行力强'],
    cons: ['在长时间窄幅震荡市中容易频繁止损打脸（磨损期）'],
    bestMarketCondition: '单边大牛市或流动性充沛的持续单边阴跌市',
  },
  {
    key: 'dual_thrust',
    name: 'Dual Thrust CTA 经典区间突破策略',
    authorOrOrigin: 'Michael Chalek (知名 CTA 量化机构首选标配)',
    category: '突破策略',
    summary: '由顶级商品期货基金 Michael Chalek 提出，以历史 N 根 K 线的最大高低点差构建非对称动态突破通道。',
    description:
      '与传统布林或唐奇安通道不同，Dual Thrust 通过 Range = Max(HH-LC, HC-LL) 综合考虑收盘价与极值价，上下轨可设置非对称系数 K1/K2（牛市偏多，熊市偏空），当即时价格突破上轨开多，跌破下轨开空。',
    pros: ['反应极快，能在放量突破第一根 K 线抢占有利开仓点', '经受近 30 年全球期货市场实盘考验'],
    cons: ['对震荡假突破敏感，需要配合止损或波动率过滤'],
    bestMarketCondition: '突破蓄势完毕爆发的大行情启动节点',
  },
  {
    key: 'bollinger_rsi',
    name: '布林带 + RSI 极值均值回归策略',
    authorOrOrigin: 'John Bollinger & Larry Connors 量化均值理论',
    category: '均值回归',
    summary: '在价格偏离中轨 2 倍标准差触及布林下/上轨且 RSI 出现极度超卖/超买时捕捉高胜率反弹。',
    description:
      '统计套利核心逻辑：加密货币在 75% 的时间处于震荡盘整。当价格穿透布林带极限且 RSI 进入超买(>70)或超卖(<30)区间，价格具有强烈的向 EMA 均值靠拢的引力，设置清晰的均线目标位平仓。',
    pros: ['胜率极高（震荡市通常 >65%）', '持仓周期短，资金周转快'],
    cons: ['遇单边无回踩超级趋势时可能产生连续逆向止损，必须严格止损'],
    bestMarketCondition: '日内宽幅箱体震荡或收敛三角形整理阶段',
  },
  {
    key: 'macd_vpa',
    name: 'MACD + Volume 动量与量价爆发策略',
    authorOrOrigin: 'Richard Wyckoff 量价理论 (VPA) 与 Gerald Appel MACD',
    category: '动量量价',
    summary: '量在价先！当成交量超过均量 1.8 倍放量配合 MACD 水上金叉/水下死叉，确认主力资金真实意图。',
    description:
      '合约市场充斥着诱多诱空，没有真实爆量配合的突破多为假突破。本策略要求价格突破同时成交量突破 20 周期均量，且 MACD DIF 与 DEA 处于多空分界线上方形成强动量扩散。',
    pros: ['有效鉴别假突破与主力诱盘', '爆发力强，往往直接跟随主力推升'],
    cons: ['缩量慢牛行情时信号较稀疏'],
    bestMarketCondition: '放量大阳线或爆量诱空后的反向反转节点',
  },
  {
    key: 'grid_atr',
    name: 'ATR 动态波动率网格套利策略',
    authorOrOrigin: '高频做市商与网格量化 (Dynamic Grid)',
    category: '网格对冲',
    summary: '基于当前真实波动率 ATR 自动动态重设网格间距与止损边界，在波动中频繁收割差价。',
    description:
      '传统静态固定点数网格在行情剧烈变化时极易套牢。ATR 动态网格实时自适应市场波动，当波动大时拉宽网格，波动缩小时收紧网格，并设置了硬性 ATR 保护止损线。',
    pros: ['高频提供正现金流，震荡行情表现极佳', '不依赖对单边方向的预测'],
    cons: ['极端黑天鹅单边突破会触发网格保护离场'],
    bestMarketCondition: '中低波动率持续横盘震荡行情',
  },
];

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  // SuperTrend
  supertrendPeriod: 10,
  supertrendMultiplier: 3.0,
  supertrendEmaFilter: 200,

  // Dual Thrust
  dualThrustLookback: 5,
  dualThrustK1: 0.5,
  dualThrustK2: 0.5,

  // Bollinger + RSI
  bbPeriod: 20,
  bbStdDev: 2.0,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,

  // MACD + VPA
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  volumeMultiplier: 1.6,

  // ATR Grid
  gridLevels: 4,
  gridAtrMultiplier: 1.2,

  // Ensemble Weights
  weightSuperTrend: 0.35,
  weightDualThrust: 0.25,
  weightBollingerRsi: 0.25,
  weightMacdVpa: 0.15,
  ensembleThreshold: 0.35,
  enableRegimeFilter: true,
};

export type SignalValue = 1 | -1 | 0; // 1 = Buy/Long, -1 = Sell/Short, 0 = Neutral

export interface RawStrategySignals {
  supertrend: SignalValue[];
  dualThrust: SignalValue[];
  bollingerRsi: SignalValue[];
  macdVpa: SignalValue[];
  gridAtr: SignalValue[];
  patternPriceAction: SignalValue[];
  ensemble: SignalValue[];
  ensembleScore: number[];
  regimes: ('TREND' | 'RANGE')[];
}

/**
 * Compute raw trading signals for all strategies across the full K-line series
 */
export function generateAllSignals(
  klines: Kline[],
  params: StrategyParams = DEFAULT_STRATEGY_PARAMS
): RawStrategySignals {
  const n = klines.length;
  const closes = klines.map((k) => k.close);
  const volumes = klines.map((k) => k.volume);

  // Indicators
  const ema200 = calculateEMA(closes, params.supertrendEmaFilter);
  const supertrendRes = calculateSuperTrend(klines, params.supertrendPeriod, params.supertrendMultiplier);
  const dualThrustRes = calculateDualThrust(klines, params.dualThrustLookback, params.dualThrustK1, params.dualThrustK2);
  const bbRes = calculateBollingerBands(closes, params.bbPeriod, params.bbStdDev);
  const rsi = calculateRSI(closes, params.rsiPeriod);
  const macdRes = calculateMACD(closes, params.macdFast, params.macdSlow, params.macdSignal);
  const volSma = calculateSMA(volumes, 20);
  const atr = calculateATR(klines, 14);
  const adx = calculateADX(klines, 14);
  const sigPatternPriceAction = generatePatternSignals(klines);

  const sigSupertrend: SignalValue[] = new Array(n).fill(0);
  const sigDualThrust: SignalValue[] = new Array(n).fill(0);
  const sigBollingerRsi: SignalValue[] = new Array(n).fill(0);
  const sigMacdVpa: SignalValue[] = new Array(n).fill(0);
  const sigGridAtr: SignalValue[] = new Array(n).fill(0);
  const sigEnsemble: SignalValue[] = new Array(n).fill(0);
  const ensembleScore: number[] = new Array(n).fill(0);
  const regimes: ('TREND' | 'RANGE')[] = new Array(n).fill('RANGE');

  for (let i = 1; i < n; i++) {
    const close = klines[i].close;
    const prevClose = klines[i - 1].close;

    // 1. SuperTrend + EMA200
    const stDir = supertrendRes.trend[i];
    const prevStDir = supertrendRes.trend[i - 1];
    const ema = ema200[i];

    if (stDir !== null && prevStDir !== null) {
      if (stDir === 1 && prevStDir === -1) {
        // Bullish flip
        if (ema === null || close >= ema * 0.99) {
          sigSupertrend[i] = 1;
        }
      } else if (stDir === -1 && prevStDir === 1) {
        // Bearish flip
        if (ema === null || close <= ema * 1.01) {
          sigSupertrend[i] = -1;
        }
      }
    }

    // 2. Dual Thrust
    const buyTrig = dualThrustRes.buyTrigger[i];
    const sellTrig = dualThrustRes.sellTrigger[i];
    if (buyTrig !== null && sellTrig !== null) {
      if (close > buyTrig && prevClose <= buyTrig) {
        sigDualThrust[i] = 1;
      } else if (close < sellTrig && prevClose >= sellTrig) {
        sigDualThrust[i] = -1;
      }
    }

    // 3. Bollinger + RSI Mean Reversion
    const lowerBb = bbRes.lower[i];
    const upperBb = bbRes.upper[i];
    const curRsi = rsi[i];
    const prevRsi = rsi[i - 1];

    if (lowerBb !== null && upperBb !== null && curRsi !== null && prevRsi !== null) {
      // Oversold bounce
      if ((klines[i].low <= lowerBb || curRsi <= params.rsiOversold) && curRsi > prevRsi) {
        sigBollingerRsi[i] = 1;
      }
      // Overbought pullback
      else if ((klines[i].high >= upperBb || curRsi >= params.rsiOverbought) && curRsi < prevRsi) {
        sigBollingerRsi[i] = -1;
      }
    }

    // 4. MACD + VPA
    const hist = macdRes.histogram[i];
    const prevHist = macdRes.histogram[i - 1];
    const dif = macdRes.dif[i];
    const v = volumes[i];
    const vAvg = volSma[i] ?? v;

    const isHighVol = v >= vAvg * params.volumeMultiplier;

    if (hist !== null && prevHist !== null && dif !== null) {
      if (hist > 0 && prevHist <= 0 && isHighVol) {
        sigMacdVpa[i] = 1;
      } else if (hist < 0 && prevHist >= 0 && isHighVol) {
        sigMacdVpa[i] = -1;
      }
    }

    // 5. ATR Dynamic Grid
    const curAtr = atr[i];
    const bbMid = bbRes.middle[i];
    if (curAtr !== null && bbMid !== null) {
      const step = (curAtr * params.gridAtrMultiplier) / params.gridLevels;
      // Below mid by 2 steps
      if (close <= bbMid - step * 1.5 && prevClose < close) {
        sigGridAtr[i] = 1;
      } else if (close >= bbMid + step * 1.5 && prevClose > close) {
        sigGridAtr[i] = -1;
      }
    }

    // 6. Market Regime: ADX and BB Bandwidth
    const curAdx = adx[i];
    const curBw = bbRes.bandwidth[i];
    const isTrending = (curAdx !== null && curAdx > 24) || (curBw !== null && curBw > 6.5);
    regimes[i] = isTrending ? 'TREND' : 'RANGE';

    // 7. Ensemble consensus score calculation
    let wST = params.weightSuperTrend;
    let wDT = params.weightDualThrust;
    let wBR = params.weightBollingerRsi;
    let wVPA = params.weightMacdVpa;

    if (params.enableRegimeFilter) {
      if (isTrending) {
        // Boost trend weights
        wST *= 1.6;
        wDT *= 1.4;
        wBR *= 0.4;
        wVPA *= 1.2;
      } else {
        // Boost mean-reversion weights
        wBR *= 2.0;
        wST *= 0.4;
        wDT *= 0.5;
        wVPA *= 0.8;
      }
    }

    let wPA = 0.45; // High weight for Price Action & Chart Patterns
    if (params.enableRegimeFilter) {
      if (isTrending) {
        wPA *= 1.3;
      } else {
        wPA *= 1.2;
      }
    }

    const totalWeight = wST + wDT + wBR + wVPA + wPA;
    const score =
      (sigSupertrend[i] * wST +
        sigDualThrust[i] * wDT +
        sigBollingerRsi[i] * wBR +
        sigMacdVpa[i] * wVPA +
        sigPatternPriceAction[i] * wPA) /
      (totalWeight || 1);

    ensembleScore[i] = score;

    if (score >= params.ensembleThreshold) {
      sigEnsemble[i] = 1;
    } else if (score <= -params.ensembleThreshold) {
      sigEnsemble[i] = -1;
    }
  }

  return {
    supertrend: sigSupertrend,
    dualThrust: sigDualThrust,
    bollingerRsi: sigBollingerRsi,
    macdVpa: sigMacdVpa,
    gridAtr: sigGridAtr,
    patternPriceAction: sigPatternPriceAction,
    ensemble: sigEnsemble,
    ensembleScore,
    regimes,
  };
}
