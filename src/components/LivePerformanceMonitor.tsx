import React from 'react';
import { BotStatus } from '../server/botEngine';
import {
  Activity,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  ArrowDownRight,
  Zap,
  PieChart,
  GitCompare,
} from 'lucide-react';

interface LivePerformanceMonitorProps {
  status: BotStatus | null;
}

interface StrategyPerformanceMetrics {
  key: string;
  name: string;
  category: string;
  totalTrades: number;
  wins: number;
  winRate: number | null;
  sharpeRatio: number | null;
  maxDrawdownPercent: number | null;
  profitFactor: number | null;
  statusLevel: 'NORMAL_EXCELLENT' | 'NORMAL_STABLE' | 'WARNING_LOW' | 'ABNORMAL_HIGH_RISK' | 'NO_DATA';
  statusLabel: string;
}

export const LivePerformanceMonitor: React.FC<LivePerformanceMonitorProps> = ({ status }) => {
  const closedTrades = status?.closedTrades || [];
  const equityHistory = status?.equityHistory || [];
  const peakEquity = status?.peakEquity ?? 0;
  const currentEquity = status?.equity ?? 0;

  // 1. Calculate Overall Account Sharpe Ratio (returns null if < 2 closed trades; zero fake baseline)
  const computeOverallSharpe = (): number | null => {
    if (closedTrades.length < 2) return null;
    const returns = closedTrades.map((t) => (t.marginUsed > 0 ? t.netPnl / t.marginUsed : 0));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return mean > 0 ? 3.5 : 0;
    const rawSharpe = (mean / stdDev) * Math.sqrt(252);
    return Number(Math.max(-3.0, Math.min(5.0, rawSharpe)).toFixed(2));
  };

  // 2. Calculate Overall Max Drawdown strictly from recorded equityHistory
  const computeOverallMaxDrawdown = (): number => {
    if (equityHistory.length < 2) {
      return peakEquity > 0 ? Number((((peakEquity - currentEquity) / peakEquity) * 100).toFixed(2)) : 0;
    }
    let maxDd = 0;
    let runningPeak = equityHistory[0]?.equity || 0;

    for (const point of equityHistory) {
      if (point.equity > runningPeak) {
        runningPeak = point.equity;
      }
      if (runningPeak > 0) {
        const dd = ((runningPeak - point.equity) / runningPeak) * 100;
        if (dd > maxDd) maxDd = dd;
      }
    }
    return Number(maxDd.toFixed(2));
  };

  const overallSharpe = computeOverallSharpe();
  const overallMaxDd = computeOverallMaxDrawdown();

  // Color & Badge for Sharpe Ratio
  const getSharpeStatusBadge = (sharpe: number | null) => {
    if (sharpe === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
          ⚪ 暂无样本 (&lt;2笔平仓)
        </span>
      );
    }
    if (sharpe >= 2.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          🟢 极度优秀 (Sharpe ≥ 2.0)
        </span>
      );
    }
    if (sharpe >= 1.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
          🔵 正常平稳 (Sharpe 1.0 ~ 2.0)
        </span>
      );
    }
    if (sharpe >= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          🟡 收益偏平 (Sharpe &lt; 1.0)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
        🔴 非正常波动警告 (Sharpe &lt; 0)
      </span>
    );
  };

  // Color & Badge for Max Drawdown
  const getMaxDdStatusBadge = (maxDd: number) => {
    if (maxDd <= 5.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          🟢 极低回撤 (≤ 5%)
        </span>
      );
    }
    if (maxDd <= 12.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
          🔵 正常回撤 (5% ~ 12%)
        </span>
      );
    }
    if (maxDd <= 20.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          🟡 注意警告 (12% ~ 20%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
        🔴 严重异常回撤 (&gt; 20%)
      </span>
    );
  };

  // Compute breakdown metrics per strategy catalog
  const strategiesList: { key: string; name: string; category: string }[] = [
    { key: 'pattern_price_action', name: '全形态历史胜率自优引擎', category: '全形态自优' },
    { key: 'wyckoff_spring_utad', name: 'Wyckoff 弹簧洗盘 & UTAD 形态', category: '流动性猎杀' },
    { key: 'brooks_h2_l2', name: 'Al Brooks H2/L2 均线确认形态', category: '回踩二次确认' },
    { key: 'flag_breakout', name: '牛旗 / 熊旗中继放量突破形态', category: '顺势突破' },
    { key: 'double_top_bottom', name: 'W底 / M头 颈线放量突破形态', category: '几何反转' },
  ];

  const strategyMetrics: StrategyPerformanceMetrics[] = strategiesList.map((strat) => {
    const stratTrades = closedTrades.filter(
      (t) => t.strategyUsed === strat.key || t.patternType?.toLowerCase().includes(strat.key.split('_')[0])
    );
    const totalTrades = stratTrades.length;
    const wins = stratTrades.filter((t) => t.netPnl > 0).length;
    const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : null;

    // Strategy Sharpe Ratio (null when insufficient real samples)
    let sharpe: number | null = null;
    if (totalTrades >= 2) {
      const returns = stratTrades.map((t) => (t.marginUsed > 0 ? t.netPnl / t.marginUsed : 0));
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance =
        returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      sharpe = stdDev > 0 ? Number(((mean / stdDev) * Math.sqrt(252)).toFixed(2)) : mean > 0 ? 3.5 : 0;
    }

    // Strategy Max Drawdown
    let stratMaxDd: number | null = null;
    if (totalTrades >= 2) {
      let cumPnl = 0;
      let peakPnl = 0;
      let maxDraw = 0;
      for (const t of stratTrades) {
        cumPnl += t.netPnl;
        if (cumPnl > peakPnl) peakPnl = cumPnl;
        const ddUsdt = peakPnl - cumPnl;
        if (ddUsdt > maxDraw) maxDraw = ddUsdt;
      }
      const avgMargin =
        stratTrades.reduce((s, t) => s + Math.max(10, t.marginUsed), 0) / totalTrades;
      stratMaxDd = Number(Math.min(100, Math.max(0, (maxDraw / Math.max(10, avgMargin)) * 100)).toFixed(1));
    }

    // Profit Factor
    let profitFactor: number | null = null;
    if (totalTrades > 0) {
      const grossWin = stratTrades.filter((t) => t.netPnl > 0).reduce((a, b) => a + b.netPnl, 0);
      const grossLoss = Math.abs(stratTrades.filter((t) => t.netPnl < 0).reduce((a, b) => a + b.netPnl, 0));
      profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 9.9 : 0;
    }

    let statusLevel: StrategyPerformanceMetrics['statusLevel'] = 'NO_DATA';
    let statusLabel = '⚪ 等待真实成交样本';

    if (totalTrades >= 2 && sharpe !== null && stratMaxDd !== null) {
      if (sharpe < 0 || stratMaxDd > 18) {
        statusLevel = 'ABNORMAL_HIGH_RISK';
        statusLabel = '🔴 非正常波动警告';
      } else if (sharpe < 1.0 || stratMaxDd > 12) {
        statusLevel = 'WARNING_LOW';
        statusLabel = '🟡 警戒观察';
      } else if (sharpe < 1.8) {
        statusLevel = 'NORMAL_STABLE';
        statusLabel = '🔵 正常平稳';
      } else {
        statusLevel = 'NORMAL_EXCELLENT';
        statusLabel = '🟢 正常平稳 (优秀)';
      }
    }

    return {
      key: strat.key,
      name: strat.name,
      category: strat.category,
      totalTrades,
      wins,
      winRate,
      sharpeRatio: sharpe,
      maxDrawdownPercent: stratMaxDd,
      profitFactor,
      statusLevel,
      statusLabel,
    };
  });

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100">
                实盘性能与波动性诊断 (Live Quant Performance & Volatility Monitor)
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                实时自动风控标识
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              自动监控当前各策略夏普比率 (Sharpe Ratio) 与最大回撤 (Max Drawdown)，颜色标识波动健康度。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(overallSharpe !== null && overallSharpe < 0) || overallMaxDd > 20 ? (
            <span className="px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              🔴 整体处于非正常剧烈波动状态
            </span>
          ) : (
            <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              🟢 策略处于正常波动范围 (风控健康)
            </span>
          )}
        </div>
      </div>

      {/* Top 2 Big KPI Cards: Sharpe Ratio & Max Drawdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* KPI Card 1: Sharpe Ratio */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>全系统实时夏普比率 (Sharpe Ratio)</span>
            </div>
            {getSharpeStatusBadge(overallSharpe)}
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-bold font-mono text-white">
              {overallSharpe !== null ? overallSharpe.toFixed(2) : '--'}
            </div>
            <div className="text-xs text-slate-400">
              {overallSharpe === null
                ? '等待至少 2 笔真实已平仓记录以计算真实夏普比率'
                : overallSharpe >= 2.0
                ? '极高超额收益风险比 (夏普 ≥ 2.0)'
                : overallSharpe >= 1.0
                ? '稳健平稳收益状态 (Sharpe 1.0 ~ 2.0)'
                : '收益率偏平，建议保持风控'}
            </div>
          </div>
        </div>

        {/* KPI Card 2: Max Drawdown */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-amber-400" />
              <span>全系统历史最大回撤 (Max Drawdown)</span>
            </div>
            {getMaxDdStatusBadge(overallMaxDd)}
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-bold font-mono text-amber-300">{overallMaxDd.toFixed(2)}%</div>
            <div className="text-xs text-slate-400">
              {overallMaxDd <= 5.0
                ? '极小资金回撤，极强抗洗盘能力'
                : overallMaxDd <= 12.0
                ? '正常波动回调，处预设容忍度内'
                : '接近风控容忍下限，注意防守'}
            </div>
          </div>
        </div>
      </div>

      {/* Global Market Correlation & Risk Circuit Breaker Banner */}
      {status?.marketCorrelation && (
        <div
          className={`p-4 rounded-xl border transition-all ${
            status.marketCorrelation.isCircuitBreakerActive
              ? 'bg-rose-950/60 border-rose-500/80 text-rose-100 shadow-rose-900/40 shadow-lg animate-pulse'
              : 'bg-[#0b0e14] border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status.marketCorrelation.isCircuitBreakerActive ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
                }`}
              />
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <span>自动风险熔断防线 (Automated Market Volatility & Correlation Circuit Breaker)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  全网络实时防冲洗
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                <span className="text-slate-400">共振关联度: </span>
                <span className="text-amber-400 font-bold">
                  {(status.marketCorrelation.correlationScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
                <span className="text-slate-400">波动爆发比率: </span>
                <span className="text-cyan-400 font-bold">
                  {status.marketCorrelation.avgVolatilityRatio.toFixed(2)}x
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="leading-relaxed text-slate-300">
              {status.marketCorrelation.circuitBreakerReason}
            </div>
            <div className="shrink-0 font-mono text-[11px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-bold">
              {status.marketCorrelation.isCircuitBreakerActive ? (
                <span className="text-rose-400">
                  🚨 熔断保护: 杠杆 ≤ {status.marketCorrelation.safeLevelLeverage}x / 持仓 ≤ {status.marketCorrelation.maxAllowedAccountPositions} 笔
                </span>
              ) : (
                <span className="text-emerald-400">
                  🟢 避险门槛正常: 杠杆 {status.leverage}x / 最大持仓 {status.portfolioAllocation?.maxConcurrentPositions ?? 5} 笔
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Per-Symbol Reinforcement Learning Sensitivity Matrix */}
      {status?.symbolRLSensitivityStates && status.symbolRLSensitivityStates.length > 0 && (
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#0b0e14]">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>基于强化学习的各品种策略触发灵敏度自动迭代 (Symbol RL Sensitivity Tuning)</span>
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
              第 #{status.learningGeneration || 1} 代 RL 迭代
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 font-sans">
              <thead className="bg-[#07090e] text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 font-mono">
                <tr>
                  <th className="px-4 py-3">交易品种 (Symbol)</th>
                  <th className="px-4 py-3">RL 灵敏度得分</th>
                  <th className="px-4 py-3">开仓质检门槛</th>
                  <th className="px-4 py-3">ATR 止损倍数</th>
                  <th className="px-4 py-3">RL 策略触发动作</th>
                  <th className="px-4 py-3">强化学习迭代状态说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {status.symbolRLSensitivityStates.map((rl) => (
                  <tr key={rl.symbol} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-white">{rl.symbol}</td>

                    <td className="px-4 py-3 font-bold">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              rl.sensitivityScore >= 80
                                ? 'bg-emerald-400'
                                : rl.sensitivityScore >= 60
                                ? 'bg-cyan-400'
                                : 'bg-rose-400'
                            }`}
                            style={{ width: `${rl.sensitivityScore}%` }}
                          />
                        </div>
                        <span>{rl.sensitivityScore} 分</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 font-bold text-amber-300">
                      ≥ {rl.qualityScoreThreshold} 分
                    </td>

                    <td className="px-4 py-3 font-bold text-cyan-300">
                      {rl.atrMultiplier}x ATR
                    </td>

                    <td className="px-4 py-3">
                      {rl.rlAction === 'ELEVATE_SENSITIVITY' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          🚀 提敏增频 (放宽门槛)
                        </span>
                      )}
                      {rl.rlAction === 'MAINTAIN' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          ⚖️ 维持标准 (85分)
                        </span>
                      )}
                      {rl.rlAction === 'RESTRICT_SENSITIVITY' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          🛡️ 收紧防线 (严管92分)
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-sans text-[11px] text-slate-300">
                      {rl.statusDescription}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-Strategy Metric Breakdown Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#0b0e14] border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200">
            核心策略细分夏普比率与最大回撤监控 (Per-Strategy Performance Matrix)
          </span>
          <span className="text-[11px] text-slate-500 font-mono">100% 真实交易反馈</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 font-sans">
            <thead className="bg-[#07090e] text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">策略分类 & 名称</th>
                <th className="px-4 py-3">夏普比率 (Sharpe Ratio)</th>
                <th className="px-4 py-3">最大回撤 (Max Drawdown)</th>
                <th className="px-4 py-3">胜率 %</th>
                <th className="px-4 py-3">利润因子 (Profit Factor)</th>
                <th className="px-4 py-3">波动健康度标识</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {strategyMetrics.map((item) => (
                <tr key={item.key} className="hover:bg-slate-900/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">
                    <div>{item.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.category}</div>
                  </td>

                  <td className="px-4 py-3 font-mono font-bold">
                    {item.sharpeRatio === null ? (
                      <span className="text-slate-500">--</span>
                    ) : (
                      <span
                        className={
                          item.sharpeRatio >= 2.0
                            ? 'text-emerald-400'
                            : item.sharpeRatio >= 1.0
                            ? 'text-sky-300'
                            : 'text-amber-400'
                        }
                      >
                        {item.sharpeRatio.toFixed(2)}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono font-bold">
                    {item.maxDrawdownPercent === null ? (
                      <span className="text-slate-500">--</span>
                    ) : (
                      <span
                        className={
                          item.maxDrawdownPercent <= 5.0
                            ? 'text-emerald-400'
                            : item.maxDrawdownPercent <= 12.0
                            ? 'text-sky-300'
                            : 'text-rose-400'
                        }
                      >
                        {item.maxDrawdownPercent.toFixed(1)}%
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono font-semibold text-slate-200">
                    {item.winRate === null ? (
                      <span className="text-slate-500">0 笔</span>
                    ) : (
                      `${item.winRate.toFixed(1)}% (${item.wins}/${item.totalTrades}胜)`
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono font-bold text-amber-300">
                    {item.profitFactor === null ? (
                      <span className="text-slate-500">--</span>
                    ) : (
                      item.profitFactor.toFixed(2)
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {item.statusLevel === 'NO_DATA' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        ⚪ 等待真实样本
                      </span>
                    )}
                    {item.statusLevel === 'NORMAL_EXCELLENT' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        🟢 正常平稳 (优秀)
                      </span>
                    )}
                    {item.statusLevel === 'NORMAL_STABLE' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        🔵 正常平稳 (稳定)
                      </span>
                    )}
                    {item.statusLevel === 'WARNING_LOW' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        🟡 警戒观察
                      </span>
                    )}
                    {item.statusLevel === 'ABNORMAL_HIGH_RISK' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                        🔴 非正常波动警告
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Smart Order Execution Algorithm & Dynamic Correlation Hedging Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Smart Order Execution Algorithm (Volume & Volatility Order Slicing) */}
        <div className="bg-[#0b0e14] border border-cyan-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>成交量与波动率‘智能执行算法’ (Smart Order Execution)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
              防滑点 & 冰山分片撮合
            </span>
          </div>

          {status?.smartExecutionLogs && status.smartExecutionLogs.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {status.smartExecutionLogs.slice(0, 5).map((log, idx) => (
                <div key={idx} className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-xs space-y-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${log.side === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span>[{log.symbol} {log.side}]</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
                      {log.executionAlgorithm} ({log.slicesCount}分片)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-sans leading-relaxed">
                    {log.executionReason}
                  </div>
                  <div className="text-[10px] text-slate-500 flex justify-between">
                    <span>成交量比率: {log.volumeRatio}x 均值</span>
                    <span>预估滑点: {log.estimatedSlippageBps} bps</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 font-sans border border-slate-800/80 rounded-lg">
              🟢 智能订单执行引擎处于全自动就绪状态，触发信号时自动根据 Orderbook 深度选择冰山/TWAP/市价单
            </div>
          )}
        </div>

        {/* Panel 2: Dynamic Correlation Hedging (Portfolio Exposure Reduction) */}
        <div className="bg-[#0b0e14] border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>动态相关性主动对冲中枢 (Correlation Hedging)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
              组合风险降维与平滑
            </span>
          </div>

          {status?.correlationHedgingLogs && status.correlationHedgingLogs.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {status.correlationHedgingLogs.slice(0, 5).map((log, idx) => (
                <div key={idx} className="bg-slate-900/80 border border-amber-500/30 p-2.5 rounded-lg text-xs space-y-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">{log.pairName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                      正相关性: {(log.correlationCoefficient * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-200 font-sans font-medium">
                    {log.actionTaken}
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>弱势被对冲币种: {log.weakerSymbol}</span>
                    <span className="text-amber-400">已对冲下调 -{log.hedgedQuantityPercent}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 font-sans border border-slate-800/80 rounded-lg">
              🛡️ 组合相关性防线监听中，监测到多个正相关币种（如 BTC/ETH r≥0.80）时自动主动下调弱势品种持仓
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Portfolio Allocation (VIX-like) & Cross-Symbol Statistical Arbitrage Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel A: Dynamic VIX-like Portfolio Weight Allocation */}
        <div className="bg-[#0b0e14] border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>动态资产组合权重分配 (VIX-like Portfolio Allocation)</span>
            </span>
            {status?.portfolioAllocation && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                VIX指数: {status.portfolioAllocation.vixLikeIndex} | 敞口 {(status.portfolioAllocation.totalExposureMultiplier * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {status?.portfolioAllocation ? (
            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
                {status.portfolioAllocation.coverageDescription}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                {status.portfolioAllocation.weights.map((w) => (
                  <div key={w.symbol} className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{w.symbol.replace('USDT', '')}</span>
                      <span className="text-emerald-400 font-bold">{w.targetWeightPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full"
                        style={{ width: `${Math.min(100, w.targetWeightPercent * 2)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>波动 {w.volatilityPct}</span>
                      <span className="text-cyan-300">乘数 {w.sizingMultiplier}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">正在计算全合约波动率平价权重...</div>
          )}
        </div>

        {/* Panel B: Cross-Symbol Statistical Arbitrage Monitor */}
        <div className="bg-[#0b0e14] border border-purple-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <GitCompare className="w-4 h-4 text-purple-400" />
              <span>跨品种套利监控 (Cross-Symbol Divergence & Reversion)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
              做空强品种 / 做多弱品种
            </span>
          </div>

          {status?.arbitrageOpportunities && status.arbitrageOpportunities.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {status.arbitrageOpportunities.slice(0, 4).map((opp) => (
                <div
                  key={opp.id}
                  className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                    opp.isActionable
                      ? 'bg-purple-950/30 border-purple-500/60'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-white">{opp.pairName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        opp.isActionable
                          ? 'bg-purple-500/30 text-purple-200 border border-purple-400/50'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Z = {opp.spreadZScore >= 0 ? '+' : ''}{opp.spreadZScore} (阈值 ±{opp.optimalEntryZScore})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 leading-relaxed">{opp.reason}</div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                    <span>相关性 r={opp.correlation}</span>
                    <span>{opp.reversionSpeedLabel}</span>
                    <span className="text-purple-300">
                      强: {opp.strongSymbol.replace('USDT', '')} / 弱: {opp.weakSymbol.replace('USDT', '')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 border border-slate-800/80 rounded-lg">
              🔀 跨品种均值回归扫频中，持续监测高度相关合约价格分叉 Z-Score 与 AR(1) 回归半衰期
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
