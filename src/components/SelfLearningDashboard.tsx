import React from 'react';
import { BotStatus } from '../server/botEngine';
import { TimeframeDiagnosticModule } from './TimeframeDiagnosticModule';
import { PatternLearningItem } from '../types/trading';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Brain, Cpu, TrendingUp, Zap, Award, AlertCircle, Clock, Calendar, Sparkles } from 'lucide-react';

interface SelfLearningDashboardProps {
  status: BotStatus | null;
}

export const SelfLearningDashboard: React.FC<SelfLearningDashboardProps> = ({ status }) => {
  const stats: PatternLearningItem[] = status?.patternLearningStats || [];
  const generation = status?.learningGeneration ?? 1;
  const forecast = status?.aiPnlForecast;

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
    (l) => l.message.includes('自学习') || l.message.includes('强化') || l.message.includes('权重') || l.message.includes('时段')
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
                  多维时空强化自适应自学习进化控制台 (Multi-Timeframe & Session Slicing AI)
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-semibold border border-amber-500/30">
                  第 #{generation} 代多维强化模型
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                已深度兼顾<strong>不同 K线周期 (5m/15m/30m)</strong> 与<strong>不同 24h 交易时段 (亚盘/欧盘/美盘/尾盘)</strong> 的形态胜率差异！自动微调信号质量分加成与仓位乘数。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs shrink-0">
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">高信念形态</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{highConvictionCount} 个</div>
            </div>
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">剪枝/时段防护</div>
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
            <div className="text-[10px] text-sky-400 mt-0.5">多维时空离散切片</div>
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
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">交易时段离散分维</div>
            <div className="text-lg font-bold text-amber-400 mt-0.5">亚 / 欧 / 美 / 尾盘</div>
            <div className="text-[10px] text-slate-400 mt-0.5">避开低效陷阱时段</div>
          </div>
        </div>

        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">K线周期独立特化</div>
            <div className="text-lg font-bold text-purple-300 mt-0.5">5m / 15m / 30m</div>
            <div className="text-[10px] text-slate-400 mt-0.5">周期离散加权控制</div>
          </div>
        </div>
      </div>

      {/* AI 24-Hour PnL Forecast Model */}
      {forecast && (
        <div className="bg-[#0e131f] border border-cyan-500/30 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  AI 24小时收益预测模型 (AI 24h PnL Trajectory Forecast & Strategy Advisor)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  融合当前持仓 Delta、指数近因加权交易期望与多周期高质量信号密度，预测未来 24 小时预期净值增长轨迹与置信区间
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              {forecast.regimeLabel}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">未来 24h 预期 PnL</div>
              <div
                className={`text-lg font-bold font-mono mt-0.5 ${
                  forecast.expected24hPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {forecast.expected24hPnlUsdt >= 0 ? '+' : ''}${forecast.expected24hPnlUsdt.toFixed(2)} USDT
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">预期 24h 收益率</div>
              <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                {forecast.expected24hReturnPercent >= 0 ? '+' : ''}{forecast.expected24hReturnPercent.toFixed(2)}%
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">预测胜率 (Projected WR)</div>
              <div className="text-lg font-bold font-mono text-cyan-300 mt-0.5">
                {forecast.projectedWinRatePercent.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">模型置信度</div>
              <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
                {forecast.confidencePercent}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="lg:col-span-2 h-64 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecast.trajectoryPoints} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                  <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis stroke="#06b6d4" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0e14',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="optimisticPnl"
                    name="乐观上轨 (USDT)"
                    stroke="none"
                    fill="#10b981"
                    fillOpacity={0.14}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="pessimisticPnl"
                    name="保守下轨 (USDT)"
                    stroke="none"
                    fill="#f43f5e"
                    fillOpacity={0.1}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predictedCumulativePnl"
                    name="AI 预期累积 PnL (USDT)"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#06b6d4' }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-bold text-slate-200">AI 自动化调优建议方向</div>
              {forecast.adjustmentSuggestions.map((sug, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-xs space-y-1 ${
                    sug.priority === 'HIGH'
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{sug.title}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        sug.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-cyan-300'
                      }`}
                    >
                      {sug.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{sug.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeframe Volatility Diagnostic Module */}
      <TimeframeDiagnosticModule report={status?.timeframeDiagnostic} />

      {/* Pattern Weight Matrix Table */}
      <div className="bg-[#0e131f] border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">多维时空 K线形态强化学习矩阵 (Multi-Dimensional Weight Matrix)</h3>
          </div>
          <span className="text-[11px] text-slate-400">
            兼顾不同周期 (5m/15m/30m) 与 24h 交易时段 (亚/欧/美盘) 的胜率差异
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">形态名称 & 代码</th>
                <th className="px-4 py-3">综合权重</th>
                <th className="px-4 py-3">信念得分</th>
                <th className="px-4 py-3">最佳黄金周期</th>
                <th className="px-4 py-3">最佳黄金交易时段</th>
                <th className="px-4 py-3">实盘胜率 & 损益</th>
                <th className="px-4 py-3">质量分加成</th>
                <th className="px-4 py-3">仓位乘数</th>
                <th className="px-4 py-3">模型状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-xs">
                    正在初始化多维形态强化学习矩阵...
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
                      <div className="flex items-center gap-2 max-w-[100px]">
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
                    <td className="px-4 py-3 font-mono font-semibold text-purple-300">
                      {item.bestTimeframe || '15m'}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-amber-300">
                      {item.bestSession || '美盘高波爆发'}
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
        {/* Card 1: Multi-Dimensional Slicing Explanation */}
        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>多维时空离散分维机制 (Multi-Dimensional Slicing Logic)</span>
          </div>
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>1. 24h 交易时段隔离 (Session Time-Slicing)</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                系统将 24 小时划分为<strong>亚盘低波 (08-16)</strong>、<strong>欧盘动能 (16-22)</strong>、<strong>美盘高波 (22-06)</strong> 与<strong>尾盘交割 (06-08)</strong>。若某个形态在亚盘无脑假突破（胜率&lt;35%），系统自动激活<strong>时段陷阱拦截</strong>，避免无用试仓。
              </p>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-sky-300 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span>2. K线周期独立特化 (Timeframe-Specific Weighting)</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                独立追踪 <strong>5m、15m、30m</strong> 各周期下的形态胜率。例如：某形态在 5m 噪声大胜率仅 30%，但在 30m 大周期下胜率达 75%，系统仅在 30m 周期下赋予高加成与大仓位！
              </p>
            </div>

            <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg">
              <div className="font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. 综合多维加权与信念仓位 (Composite Conviction)</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                开仓前融合“全局权重 + 周期权重 + 时段权重”，实现黄金时段重仓爆发、低效时段降维避让。
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Recent Reinforcement Learning Stream */}
        <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Brain className="w-4 h-4 text-sky-400" />
              <span>多维自学习日志流 (Reinforcement Events Stream)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {learningLogs.length} 条记录
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 h-[270px] overflow-y-auto space-y-2 text-[11px] font-mono">
            {learningLogs.length === 0 ? (
              <div className="text-slate-500 text-center pt-20">
                🤖 算法引擎运行中，产生平仓订单后将在此展示多维时空权重微调轨迹...
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
