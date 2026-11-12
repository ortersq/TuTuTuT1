import React from 'react';
import { BotStatus } from '../server/botEngine';
import { PatternLearningItem } from '../types/trading';
import { Brain, Cpu, TrendingUp, ShieldCheck, Zap, Award, BarChart3, AlertCircle } from 'lucide-react';

interface SelfLearningDashboardProps {
  status: BotStatus | null;
}

export const SelfLearningDashboard: React.FC<SelfLearningDashboardProps> = ({ status }) => {
  const stats: PatternLearningItem[] = status?.patternLearningStats || [];
  const generation = status?.learningGeneration ?? 1;

  // Calculate top performing pattern
  const sortedByWeight = [...stats].sort((a, b) => b.weight - a.weight);
  const topPattern = sortedByWeight[0];
  const activePrunedCount = stats.filter((s) => s.status === 'DECAY_PRUNED').length;
  const highConvictionCount = stats.filter((s) => s.status === 'OPTIMAL_HIGH_CONVICTION').length;

  const getStatusBadge = (itemStatus: PatternLearningItem['status']) => {
    switch (itemStatus) {
      case 'OPTIMAL_HIGH_CONVICTION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Award className="w-3 h-3" />
            🟢 高信念特化
          </span>
        );
      case 'DECAY_PRUNED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            🔴 降维剪枝
          </span>
        );
      case 'LEARNING_ACTIVE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Zap className="w-3 h-3" />
            🔵 持续迭代中
          </span>
        );
    }
  };

  const getWeightColor = (weight: number) => {
    if (weight >= 1.4) return 'text-emerald-400 font-bold';
    if (weight >= 1.1) return 'text-emerald-300 font-semibold';
    if (weight <= 0.5) return 'text-rose-400 font-bold';
    if (weight <= 0.8) return 'text-amber-400 font-medium';
    return 'text-slate-200';
  };

  const getBoostBadge = (boost: number) => {
    if (boost > 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          +{boost} 分
        </span>
      );
    }
    if (boost < 0) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
          {boost} 分
        </span>
      );
    }
    return <span className="text-slate-500 text-[11px]">基准 (0)</span>;
  };

  // Filter self-learning logs
  const learningLogs = (status?.logs || []).filter(
    (l) => l.message.includes('自学习') || l.message.includes('强化') || l.message.includes('权重')
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-[#111827] to-slate-900 rounded-xl p-5 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -z-0 pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  强化自适应学习进化控制台 (Online Reinforcement Learning)
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-semibold border border-amber-500/30">
                  第 #{generation} 代在线强化模型
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                基于指数移动平均 (EMA Reward Updates) 实时调控 K线形态权重，运行时间越长，形态分析越精准，特化胜率与盈利能力越高。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs shrink-0">
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">高信念形态</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{highConvictionCount} 个</div>
            </div>
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">剪枝拦截形态</div>
              <div className="text-base font-bold text-rose-400 mt-0.5">{activePrunedCount} 个</div>
            </div>
            <div className="text-center px-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">王牌形态</div>
              <div className="text-xs font-bold text-amber-300 mt-1 truncate max-w-[130px]">
                {topPattern?.patternName ? topPattern.patternName.split(' ')[0] : '积累中'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">自学习迭代世代</div>
            <div className="text-lg font-bold text-white mt-0.5">#{generation} 世代</div>
            <div className="text-[10px] text-sky-400 mt-0.5">平仓即触发权重微调</div>
          </div>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">最高权重特化</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {topPattern ? `${topPattern.weight.toFixed(2)}x` : '1.00x'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {topPattern?.patternName ? topPattern.patternName.split(' ')[0] : '初始阶段'}
            </div>
          </div>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">智能仓位调控范围</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">0.40x ~ 1.50x</div>
            <div className="text-[10px] text-slate-400 mt-0.5">高信心放大，低信心缩减</div>
          </div>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">信号质量分动态修正</div>
            <div className="text-lg font-bold text-purple-300 mt-0.5">-25分 ~ +15分</div>
            <div className="text-[10px] text-slate-400 mt-0.5">自动修正图形质量评级</div>
          </div>
        </div>
      </div>

      {/* Pattern Weight Matrix Table */}
      <div className="bg-[#0e131f] border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">K线形态强化学习权重矩阵 (Pattern Weight Matrix)</h3>
          </div>
          <span className="text-[11px] text-slate-400">
            100% 真实交易日志强化反馈 | 动态衰减 & 爆炸拉升机制
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">形态名称 & 代码</th>
                <th className="px-4 py-3">学习权重 (EMA Weight)</th>
                <th className="px-4 py-3">信念得分 (0-100)</th>
                <th className="px-4 py-3">实盘胜率 & 损益</th>
                <th className="px-4 py-3">质量分加成</th>
                <th className="px-4 py-3">仓位乘数</th>
                <th className="px-4 py-3">模型状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                    正在初始化形态强化学习矩阵...
                  </td>
                </tr>
              ) : (
                stats.map((item) => (
                  <tr key={item.patternType} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">
                      <div>{item.patternName}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.patternType}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${getWeightColor(item.weight)}`}>
                        {item.weight.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 max-w-[120px]">
                        <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              item.confidenceScore >= 70
                                ? 'bg-emerald-400'
                                : item.confidenceScore >= 45
                                ? 'bg-sky-400'
                                : 'bg-rose-400'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(5, item.confidenceScore))}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-200">
                          {item.confidenceScore}分
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.totalTrades === 0 ? (
                        <span className="text-slate-500 text-[11px]">暂无测试单</span>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-200">
                            {item.winRate.toFixed(1)}% ({item.wins}/{item.totalTrades}胜)
                          </div>
                          <div
                            className={`text-[10px] font-mono ${
                              item.totalNetPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.totalNetPnlUsdt >= 0 ? '+' : ''}
                            {item.totalNetPnlUsdt.toFixed(2)} USDT
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{getBoostBadge(item.qualityScoreBoost)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-amber-300">
                        {item.adaptiveSizingMultiplier.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mechanism Deep Dive & Event Stream Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Core Mechanics */}
        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>自学习进化核心机制 (Adaptive Reinforcement Logic)</span>
          </div>
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1">
                1. EMA 指数移动奖励更新 (Exponential Weight Scaling)
              </div>
              <p className="text-slate-400 text-[11px]">
                每次平仓离场，系统根据实际净收益率与盈亏比计算 Reward 值。运用 $\alpha=0.18$ 的指数衰减公式实时更新形态权重，拉升盈利形态，压制低效形态。
              </p>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-sky-300 mb-1">
                2. 形态质量分加成与剪枝 (Quality Score Boosting)
              </div>
              <p className="text-slate-400 text-[11px]">
                高胜率形态赋予 +5 ~ +15 分信号评级加成，开仓优先级提升；权重大幅下降的形态赋予 -12 ~ -25 分降维剪枝，自动过滤垃圾信号。
              </p>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-emerald-300 mb-1">
                3. 信念仓位控制 (Conviction Position Sizing)
              </div>
              <p className="text-slate-400 text-[11px]">
                根据学习积累的信念分数，在 0.40x ~ 1.50x 之间动态调整保证金，实现高把握形态重仓出击，低把握形态极小仓试探。
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Recent Reinforcement Learning Stream */}
        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Brain className="w-4 h-4 text-sky-400" />
              <span>实时自学习日志流 (Reinforcement Events Stream)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {learningLogs.length} 条记录
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 h-[250px] overflow-y-auto space-y-2 text-[11px] font-mono">
            {learningLogs.length === 0 ? (
              <div className="text-slate-500 text-center pt-20">
                🤖 算法引擎运行中，产生平仓订单后将在此展示实时权重微调轨迹...
              </div>
            ) : (
              learningLogs.slice(0, 15).map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded bg-slate-900/80 border border-slate-800/80 text-slate-300 flex items-start gap-2"
                >
                  <span className="text-amber-400 shrink-0 font-bold">[{log.time}]</span>
                  <span className="leading-snug">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
