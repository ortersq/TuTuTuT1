import { Kline, StrategyInfo, StrategyKey, StrategyParams } from '../types/trading';
import { calculateEMA } from './indicators';
import { DetectedPattern, generatePatternSignals } from './chartPatterns';

export const STRATEGY_CATALOG: StrategyInfo[] = [
  {
    key: 'pattern_price_action',
    name: '全形态历史胜率自优引擎 (Adaptive Pattern Quant)',
    authorOrOrigin: 'Al Brooks & Richard Wyckoff & Bulkowski 形态库',
    category: '全形态自优',
    summary:
      '自动根据牛市、熊市、震荡市匹配对应的最佳 K 线形态（牛熊旗、H2/L2、Spring洗盘、W底/M头），并基于历史回测胜率动态过滤低胜率形态。',
    description:
      '不同趋势下严格使用不同形态：牛市（EMA20>EMA50）仅执行牛旗突破与 Al Brooks H2 回踩二次确认；熊市（EMA20<EMA50）仅执行熊旗破位与 L2 反抽受阻做空；震荡市仅执行 Wyckoff Spring 弹簧破底洗盘、UTAD 诱多破顶与 W底/M头反转。同时利用历史数据滚动计算各形态真实准确率，自动屏蔽低胜率信号。',
    pros: [
      '趋势与形态严格对齐，杜绝逆势猜顶摸底',
      '自带形态结构止损位与目标止盈位，平均盈亏比达 2.2:1 以上',
      '利用历史 K 线真实胜率滚动自优，越跑越准',
    ],
    cons: ['严格过滤低评分杂波，仅在标准高确定性形态出现时出手'],
    bestMarketCondition: '全市场周期（牛市/熊市/箱体震荡自适应切换形态）',
  },
  {
    key: 'wyckoff_spring_utad',
    name: 'Wyckoff 弹簧破底洗盘 & UTAD 诱多猎杀形态',
    authorOrOrigin: 'Richard Wyckoff 量价与流动性操纵理论',
    category: '流动性猎杀',
    summary: '专门捕捉主力击穿关键支撑/阻力位扫损后放量收回的假突破反转形态。',
    description:
      '合约市场最常见的散户亏损源于主力“插针扫损”。当价格刺穿前 18 根 K 线极值低点（诱空并触发多头止损盘）随后放量收复支撑位时立即做多（Spring）；反之刺穿前高诱多后放量砸回阻力下方时立即做空（UTAD）。',
    pros: ['极窄止损（设在插针极值外侧），盈亏比极高', '直接跟随主力吸筹/派发方向'],
    cons: ['专注于支撑阻力边缘的流动性猎杀，单边无回调行情触发较少'],
    bestMarketCondition: '宽幅箱体震荡、关键支撑阻力位洗盘阶段',
  },
  {
    key: 'brooks_h2_l2',
    name: 'Al Brooks H2/L2 均线回踩二次确认形态',
    authorOrOrigin: 'Al Brooks 《Reading Price Charts Bar by Bar》',
    category: '回踩二次确认',
    summary: '在明确单边趋势中，等待两波回调触及 20EMA 均线企稳并反包前高/前低时顺势入场。',
    description:
      '不追高、不杀跌。在多头趋势中等待价格缩量回踩 20EMA 均线，出现阳线实体反包前一根 K 线高点（High 2）时顺势做多；在空头趋势中等待反抽 20EMA 受阻、阴线跌破前一根 K 线低点（Low 2）时顺势做空。',
    pros: ['顺大势、逆小势，入场成本极佳', '胜率稳健，回撤可控'],
    cons: ['震荡无趋势行情中自动休眠不交易'],
    bestMarketCondition: '单边多头趋势或单边空头趋势中的健康回调阶段',
  },
  {
    key: 'flag_breakout',
    name: '经典牛旗 / 熊旗中继放量突破形态 (Bull & Bear Flag)',
    authorOrOrigin: 'Thomas Bulkowski 《Encyclopedia of Chart Patterns》',
    category: '顺势突破',
    summary: '识别急涨/急跌大旗杆后的窄幅缩量旗面整理，在放量突破旗面边界时追击第二段等长主升/主跌浪。',
    description:
      '要求前期旗杆波幅超过 2.2 倍 ATR，且随后的旗面回调深度不超过旗杆的 55%（强势整理特征）。一旦出现放量实体大阳线突破旗面上沿或大阴线跌破旗面下沿，立即顺势开仓。',
    pros: ['爆发力极强，持仓时间短、资金效率高', '利润目标清晰（旗杆等距投射）'],
    cons: ['形态筛选严格，仅在强动量爆发期出现'],
    bestMarketCondition: '强单边牛市主升浪或暴跌主跌浪中继阶段',
  },
  {
    key: 'double_top_bottom',
    name: '经典 W底 / M头 颈线放量突破形态',
    authorOrOrigin: '经典几何形态学 (Higher-Low W底 / Lower-High M顶)',
    category: '经典几何反转',
    summary: '识别右底高于左底（W底）或右顶低于左顶（M头）结构，在放量突破颈线位时开仓。',
    description:
      '拒绝盲目左侧猜底，必须等待右底抬高（确认卖盘衰竭）且放量阳线实体突破中间颈线高点时才右侧开多；或等待右顶降低（确认买盘力竭）且放量阴线跌破颈线低点时才右侧开空。',
    pros: ['右侧颈线确认，避免左侧接飞刀', '形态结构清晰，止损与等距止盈明确'],
    cons: ['需要完整的双底/双顶结构筑造周期'],
    bestMarketCondition: '趋势末端筑底反转或阶段性派发筑顶行情',
  },
];

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  minPatternQuality: 80,
  minHistoricalWinRate: 50,
  usePatternStructuralSlTp: true,
};

export type SignalValue = 1 | -1 | 0;

export interface RawStrategySignals {
  signals: SignalValue[];
  patternMap: Map<number, DetectedPattern>;
  regimes: ('TREND' | 'RANGE')[];
}

/**
 * Compute trading signals and matched pattern metadata across the K-line series
 */
export function generateAllSignals(
  klines: Kline[],
  params: StrategyParams = DEFAULT_STRATEGY_PARAMS,
  strategy: StrategyKey = 'pattern_price_action'
): RawStrategySignals {
  const n = klines.length;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const { signals, patternMap } = generatePatternSignals(klines, strategy, params);
  const regimes: ('TREND' | 'RANGE')[] = new Array(n).fill('RANGE');

  for (let i = 1; i < n; i++) {
    const e20 = ema20[i];
    const e50 = ema50[i];
    if (e20 !== null && e50 !== null) {
      const diffPct = (Math.abs(e20 - e50) / e50) * 100;
      regimes[i] = diffPct >= 0.45 ? 'TREND' : 'RANGE';
    }
  }

  return {
    signals,
    patternMap,
    regimes,
  };
}
