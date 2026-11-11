import React from 'react';
import { STRATEGY_CATALOG } from '../utils/strategies';
import { BookOpen, Compass, Layers, ShieldCheck, Zap } from 'lucide-react';

export const StrategyGuide: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* 1. Header Overview */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
          <BookOpen className="w-4 h-4 text-amber-400" />
          <span>币安合约多合一量化策略框架与调优指南</span>
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          顶级量化对冲基金多策略多合一 (Multi-in-One) 体系解析
        </h2>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">
          单一指标和单因子策略在加密货币市场必然存在周期性“水土不服”。本系统借鉴 Bridgewater 和 AQR 的多策略配置架构，通过<strong>市场状态机（Regime Detection）</strong>判断当前处于“强趋势”还是“箱体震荡”，动态调配趋势、突破与均值回归策略的权重。
        </p>
      </div>

      {/* 2. Architecture Visual Blueprint */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-sky-400" />
          <span>自适应多合一策略系统架构图 (System Architecture)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Layer 1: Market Regime */}
          <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                <Compass className="w-4 h-4" />
                <span>层级 1: 市场状态机识别</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed mb-3">
                基于 <strong>ADX(14) 趋向指标</strong> 与 <strong>布林带宽度 (BBW)</strong>：
              </p>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-400">●</span>
                  <span><strong>强趋势状态 (ADX &gt; 24)</strong>：启动 SuperTrend 与 Dual Thrust 追随大浪。</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-sky-400">●</span>
                  <span><strong>箱体震荡状态 (ADX &le; 24)</strong>：启动布林极限 + RSI 超买超卖均值套利。</span>
                </li>
              </ul>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500">
              杜绝在单边趋势中逆势做空，杜绝在震荡中频繁打脸
            </div>
          </div>

          {/* Layer 2: Signal Ensemble */}
          <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-sky-400 font-bold mb-1 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                <span>层级 2: 动态加权投票共识</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed mb-3">
                各成熟子策略输出信号值（多头 +1，空头 -1，中性 0），根据市场环境分配动态权重 $W_i$：
              </p>
              <div className="p-2 bg-slate-950 rounded font-mono text-[11px] text-amber-300 text-center mb-2">
                Score = &sum;(Sig_i &times; W_i) / &sum;W_i
              </div>
              <p className="text-slate-300 text-[11px]">
                只有当共识总分达到阈值 (如 &ge; 0.35) 才触发开仓，大幅过滤虚假假突破信号。
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500">
              多指标交叉验证，胜率与稳定性显著提升
            </div>
          </div>

          {/* Layer 3: Risk Guard */}
          <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>层级 3: 全流程风险管理中台</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed mb-3">
                执行执行级风控与头寸管理：
              </p>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li>• <strong>ATR 动态止损</strong>：根据真实波动率设置防护网。</li>
                <li>• <strong>盈亏比止盈 (1:2)</strong>：让单笔盈利显著覆盖亏损。</li>
                <li>• <strong>移动追踪止盈</strong>：行情起飞后锁定浮盈。</li>
                <li>• <strong>强平保护与熔断</strong>：杜绝穿仓与极端黑天鹅。</li>
              </ul>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500">
              坚守资金安全第一定律
            </div>
          </div>
        </div>
      </div>

      {/* 3. Deep Dive into the Mature Strategies & Price Action Patterns */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-100 mb-4">
          已整合的成熟交易策略与价格形态学深度剖析
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STRATEGY_CATALOG.filter((s) => s.key !== 'ensemble').map((s) => (
            <div key={s.key} className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-white">{s.name}</h4>
                  <span className="text-[11px] text-amber-400 font-medium px-2 py-0.5 bg-amber-500/10 rounded">
                    {s.category}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  {s.description}
                </p>

                <div className="space-y-1.5 text-xs text-slate-400 mb-3">
                  <div className="text-emerald-400 font-medium">✓ 优势:</div>
                  <ul className="list-disc list-inside text-[11px] text-slate-300 pl-1 space-y-0.5">
                    {s.pros.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>

                  <div className="text-rose-400 font-medium pt-1">✕ 局限性:</div>
                  <ul className="list-disc list-inside text-[11px] text-slate-300 pl-1 space-y-0.5">
                    {s.cons.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-800/80 text-[11px] flex items-center justify-between text-slate-400">
                <span>来源: {s.authorOrOrigin}</span>
                <span className="text-amber-400 font-medium">{s.bestMarketCondition}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Practical Market Regime Tuning Matrix */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-6">
        <h3 className="text-base font-bold text-slate-100 mb-3">
          不同市场环境的参数调优实战方案
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          根据不同行情特征，微调参数以最大化策略盈亏比与稳定性：
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">市场环境类型</th>
                <th className="py-2.5 px-3">典型表现</th>
                <th className="py-2.5 px-3">首选核心策略</th>
                <th className="py-2.5 px-3">推荐止损 / 止盈配置</th>
                <th className="py-2.5 px-3">杠杆建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono text-[11px]">
              <tr>
                <td className="py-3 px-3 font-sans font-bold text-emerald-400">大单边牛市 / 主升浪</td>
                <td className="py-3 px-3 font-sans text-slate-400">连续大阳线，破新高，均线多头排列</td>
                <td className="py-3 px-3 font-sans text-white">SuperTrend + Dual Thrust</td>
                <td className="py-3 px-3">2.5x ATR 止损 / 移动止盈 (1.5% 回调)</td>
                <td className="py-3 px-3 font-bold text-amber-400">5x ~ 10x</td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-sans font-bold text-sky-400">窄幅箱体震荡 / 磨损期</td>
                <td className="py-3 px-3 font-sans text-slate-400">成交量萎缩，布林带收口，反复假突破</td>
                <td className="py-3 px-3 font-sans text-white">布林带 + RSI 均值回归 / ATR网格</td>
                <td className="py-3 px-3">1.5% 固定止损 / 1:1.5 盈亏比快速锁利</td>
                <td className="py-3 px-3 font-bold text-amber-400">2x ~ 3x</td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-sans font-bold text-rose-400">单边阴跌破位 / 熊市</td>
                <td className="py-3 px-3 font-sans text-slate-400">反弹无力，均线空头排列，屡破新低</td>
                <td className="py-3 px-3 font-sans text-white">SuperTrend + MACD VPA (顺势做空)</td>
                <td className="py-3 px-3">2.0x ATR 止损 / 1:2.5 盈亏比</td>
                <td className="py-3 px-3 font-bold text-amber-400">3x ~ 5x</td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-sans font-bold text-indigo-400">全市场周期 (综合应用)</td>
                <td className="py-3 px-3 font-sans text-slate-400">牛熊交替，震荡与突破并存</td>
                <td className="py-3 px-3 font-sans text-white font-bold text-amber-400">
                  自适应多策略融合引擎 (Ensemble)
                </td>
                <td className="py-3 px-3">2.0x ATR 动态止损 + 移动追踪止盈</td>
                <td className="py-3 px-3 font-bold text-amber-400">5x (稳健)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
