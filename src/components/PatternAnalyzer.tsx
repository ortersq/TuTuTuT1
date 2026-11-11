import React, { useMemo, useState } from 'react';
import { Kline, StrategyKey } from '../types/trading';
import {
  detectAllChartPatterns,
  evaluatePatternAccuracy,
  DetectedPattern,
  PatternStats,
} from '../utils/chartPatterns';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Zap,
  Target,
  Activity,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';

interface PatternAnalyzerProps {
  klines: Kline[];
  symbol: string;
  interval: string;
  onApplyStrategy: (key: StrategyKey) => void;
}

export const PatternAnalyzer: React.FC<PatternAnalyzerProps> = ({
  klines,
  symbol,
  interval,
  onApplyStrategy,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [minQuality, setMinQuality] = useState<number>(80);

  // Detect all patterns on current real Kline dataset
  const patterns = useMemo(() => {
    return detectAllChartPatterns(klines);
  }, [klines]);

  // Compute forward accuracy & win-rate metrics for each pattern
  const stats: PatternStats[] = useMemo(() => {
    return evaluatePatternAccuracy(klines, patterns);
  }, [klines, patterns]);

  const filteredPatterns = useMemo(() => {
    return patterns
      .filter((p) => {
        if (p.qualityScore < minQuality) return false;
        if (filterCategory === 'ALL') return true;
        return p.category === filterCategory;
      })
      .slice()
      .reverse(); // Latest patterns first
  }, [patterns, filterCategory, minQuality]);

  // Overall win rate
  const overallWins = stats.reduce((acc, s) => acc + s.wins, 0);
  const overallCount = stats.reduce((acc, s) => acc + s.count, 0);
  const overallWinRate = overallCount > 0 ? (overallWins / overallCount) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Hero Banner: Giants' Principles */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-indigo-950/40 border border-amber-500/30 p-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/20 border border-amber-400/40 rounded-full text-xs font-semibold text-amber-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>站在巨人的肩膀上 · 价格形态学与流动性操纵量化引擎</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              K线图形形态量化系统 (Price Action & Wyckoff)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              摒弃滞后落后的单一均线指标，基于 <strong className="text-amber-300">Al Brooks (价格行为学)</strong>、
              <strong className="text-amber-300">Richard Wyckoff (主力洗盘与流动性猎杀)</strong> 以及
              <strong className="text-amber-300">Thomas Bulkowski (经典几何形态统计)</strong>。
              系统根据不同市场趋势严格匹配不同形态，不断利用币安真实历史数据计算并优化形态前瞻胜率！
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full lg:w-auto">
            <button
              onClick={() => onApplyStrategy('pattern_price_action')}
              className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>一键以此形态策略执行回测</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3 Trend Regimes - Different Patterns for Different Trends */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bull Trend Box */}
        <div className="bg-[#111726] border border-emerald-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <TrendingUp className="w-4 h-4" />
              <span>牛市单边主升浪</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              EMA20 &gt; EMA50
            </span>
          </div>
          <p className="text-xs text-slate-400">
            趋势强劲，杜绝任何摸顶与逆势猜顶。专属形态聚焦于<strong>回踩二次企稳与旗形中继主升突破</strong>：
          </p>
          <div className="space-y-2 pt-1">
            <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>经典牛旗中继爆发 (Bull Flag)</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                大旗杆放量拉升 + 窄幅缩量倾斜休整 + 突破旗顶开启第二段主升浪。
              </div>
            </div>

            <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Al Brooks H2 均线二次多头确认</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                牛市中两波 ABC 回调回踩 20EMA 获得强支撑，H2 突破前高放量反包。
              </div>
            </div>
          </div>
        </div>

        {/* Range-Bound Box */}
        <div className="bg-[#111726] border border-amber-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Layers className="w-4 h-4" />
              <span>宽幅箱体与关键位震荡</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              ADX &lt; 22 / 盘整
            </span>
          </div>
          <p className="text-xs text-slate-400">
            趋势指标在此频繁打脸磨损。专属形态聚焦于<strong>主力假破位洗盘反抽与经典几何反转</strong>：
          </p>
          <div className="space-y-2 pt-1">
            <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Wyckoff 弹簧破底洗盘 (Spring)</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                击穿前期强支撑诱空猎杀散户止损后长下影放量强势收回，确立底部。
              </div>
            </div>

            <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                <span>W底高点抬高结构 (Double Bottom)</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                右底高于左底构筑 Higher Low，放量大阳线突破颈线关键阻力位。
              </div>
            </div>
          </div>
        </div>

        {/* Bear Trend Box */}
        <div className="bg-[#111726] border border-rose-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <TrendingDown className="w-4 h-4" />
              <span>熊市单边主跌浪</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
              EMA20 &lt; EMA50
            </span>
          </div>
          <p className="text-xs text-slate-400">
            阴跌不止，严禁盲目接飞刀。专属形态聚焦于<strong>反抽无力受阻破位与熊旗中继加速</strong>：
          </p>
          <div className="space-y-2 pt-1">
            <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs">
              <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                <span>经典熊旗中继破位 (Bear Flag)</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                断崖暴跌旗杆 + 弱势反弹上升通道受阻 + 放量大阴线跌破旗底支撑。
              </div>
            </div>

            <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 text-xs">
              <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Al Brooks L2 均线二次受阻做空</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                熊市反抽 20EMA 承压，完成两腿无力反弹后 L2 破位阴线顺大势做空。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Data-Driven Accuracy Scoreboard */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Activity className="w-5 h-5 text-amber-400" />
              <span>币安 {symbol} 真实 K 线形态准确率评估看板</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              基于当前拉取的 {klines.length} 根 {interval} 周期真实数据，对每个形态触发点进行前瞻 8 根 K 线综合盈亏验证
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800 text-right">
              <div className="text-[10px] text-slate-400">总识别形态触发</div>
              <div className="text-sm font-mono font-bold text-white">{overallCount} 次</div>
            </div>
            <div className="px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/30 text-right">
              <div className="text-[10px] text-emerald-400">综合前瞻胜率</div>
              <div className="text-sm font-mono font-bold text-emerald-300">
                {overallWinRate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Stats Table / Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {stats.map((s) => (
            <div
              key={s.type}
              className="p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-100 text-xs sm:text-sm line-clamp-1">
                  {s.name}
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0 ${
                    s.winRate >= 65
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : s.winRate >= 50
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  胜率 {s.winRate}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      s.winRate >= 65 ? 'bg-emerald-400' : s.winRate >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, s.winRate))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    胜 {s.wins} / 负 {s.losses} (共 {s.count} 次)
                  </span>
                  <span
                    className={
                      s.avgReturnPercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                    }
                  >
                    平均盈亏: {s.avgReturnPercent >= 0 ? '+' : ''}
                    {s.avgReturnPercent}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                <span className="text-slate-500">最佳契合行情:</span>
                <span className="text-slate-300 font-medium">{s.bestFitTrend}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Detected Patterns Feed */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Target className="w-5 h-5 text-amber-400" />
              <span>当前真实行情形态触发明细与执行位</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              显示在历史 K 线中自动匹配的高置信度形态触发点，自动计算入场位、止损位与目标止盈位
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
              <span className="text-slate-500 px-1">分类:</span>
              {['ALL', '顺势突破', '回踩二次确认', '流动性猎杀反转', '经典几何反转'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    filterCategory === cat
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat === 'ALL' ? '全部' : cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">最低评分:</span>
              <button
                onClick={() => setMinQuality((q) => (q === 80 ? 90 : 80))}
                className="font-mono text-amber-300 font-semibold cursor-pointer"
              >
                {minQuality}分
              </button>
            </div>
          </div>
        </div>

        {/* Patterns List */}
        {filteredPatterns.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            当前筛选条件下暂无形态触发，可尝试降低评分过滤或切换周期/币对。
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPatterns.slice(0, 15).map((p, idx) => (
              <div
                key={`${p.timestamp}_${p.type}_${idx}`}
                className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded ${
                        p.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {p.action === 'BUY' ? '做多 BUY' : '做空 SELL'}
                    </span>
                    <span className="font-bold text-white text-xs sm:text-sm">{p.name}</span>
                    <span className="text-[11px] text-slate-400 px-2 py-0.5 rounded bg-slate-800">
                      {p.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-500">
                      {new Date(p.timestamp).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-amber-400 font-semibold">质量分: {p.qualityScore}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{p.description}</p>

                {/* Price Coordinates Bar */}
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800/80 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">触发开仓价:</span>
                    <span className="text-white font-bold">{p.triggerPrice.toFixed(2)} USDT</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">防守止损位:</span>
                    <span className="text-rose-400 font-bold">{p.stopLossPrice.toFixed(2)} USDT</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">目标止盈位:</span>
                    <span className="text-emerald-400 font-bold">{p.targetPrice.toFixed(2)} USDT</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">预期盈亏比:</span>
                    <span className="text-amber-300 font-bold">
                      {(
                        Math.abs(p.targetPrice - p.triggerPrice) /
                        (Math.abs(p.triggerPrice - p.stopLossPrice) || 1)
                      ).toFixed(1)}
                      : 1
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
