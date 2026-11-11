import React from 'react';
import { MultiStrategyComparison } from '../utils/binanceApi';
import { StrategyKey } from '../types/trading';
import { Trophy, CheckCircle2, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { STRATEGY_CATALOG } from '../utils/strategies';

interface StrategyLeaderboardProps {
  benchmark: MultiStrategyComparison | null;
  selectedStrategy: StrategyKey;
  onSelectStrategy: (key: StrategyKey) => void;
}

export const StrategyLeaderboard: React.FC<StrategyLeaderboardProps> = ({
  benchmark,
  selectedStrategy,
  onSelectStrategy,
}) => {
  if (!benchmark) {
    return (
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        正在拉取数据并计算多策略横向比拼...
      </div>
    );
  }

  const champion = benchmark.results[0];
  const championDetails = STRATEGY_CATALOG.find((s) => s.key === champion.key);

  return (
    <div className="space-y-6">
      {/* 1. Champion Strategy Highlight Card */}
      <div className="bg-gradient-to-r from-amber-950/40 via-[#111726] to-[#111726] border-2 border-amber-500/40 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 tracking-wide mb-2 uppercase">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>本期实盘回测综合表现第一名 (Champion Strategy)</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">
              {champion.name}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              {championDetails?.summary}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-400">分类: <strong className="text-slate-200">{champion.category}</strong></span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">提出者/来源: <strong className="text-slate-200">{championDetails?.authorOrOrigin}</strong></span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">最佳适配行情: <strong className="text-amber-300">{championDetails?.bestMarketCondition}</strong></span>
            </div>
          </div>

          {/* Quick Champion Metrics Grid */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 flex flex-col gap-3 min-w-[240px]">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
              <span>净收益率 (Total Return)</span>
              <span className={`font-mono font-bold text-base tabular-nums ${champion.metrics.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {champion.metrics.totalReturnPercent >= 0 ? '+' : ''}{champion.metrics.totalReturnPercent.toFixed(2)}%
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
              <span>胜率 (Win Rate)</span>
              <span className="font-mono font-bold text-slate-200 tabular-nums">
                {champion.metrics.winRatePercent.toFixed(1)}% ({champion.metrics.winningTrades}胜/{champion.metrics.losingTrades}负)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
              <span>盈亏比 (Profit Factor)</span>
              <span className="font-mono font-bold text-amber-400 tabular-nums">
                {champion.metrics.profitFactor.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>最大回撤 (Max DD)</span>
              <span className="font-mono font-bold text-rose-400 tabular-nums">
                -{champion.metrics.maxDrawdownPercent.toFixed(2)}%
              </span>
            </div>

            <button
              onClick={() => onSelectStrategy(champion.key)}
              className="mt-1 w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>应用此冠军策略为当前回测</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Full Multi-Strategy Comparison Table */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white">6大成熟策略综合表现排行榜</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              基于币安真实历史行情相同数据窗口的严格横向基准评测
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3">排名</th>
                <th className="py-3 px-3">策略方案</th>
                <th className="py-3 px-3">策略类型</th>
                <th className="py-3 px-3 text-right">净收益率</th>
                <th className="py-3 px-3 text-right">胜率</th>
                <th className="py-3 px-3 text-right">交易笔数</th>
                <th className="py-3 px-3 text-right">盈亏比</th>
                <th className="py-3 px-3 text-right">最大回撤</th>
                <th className="py-3 px-3 text-right">夏普比率</th>
                <th className="py-3 px-3 text-right">单笔均盈</th>
                <th className="py-3 px-3 text-center">状态 / 操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {benchmark.results.map((r, idx) => {
                const isSelected = selectedStrategy === r.key;
                const isFirst = idx === 0;

                return (
                  <tr
                    key={r.key}
                    className={`transition-colors hover:bg-slate-800/40 ${
                      isSelected ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {isFirst ? (
                        <span className="flex items-center gap-1 text-amber-400 font-bold">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <span>#1 冠军</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-semibold">#{idx + 1}</span>
                      )}
                    </td>

                    {/* Strategy Name */}
                    <td className="py-3.5 px-3 font-sans font-medium text-slate-200 whitespace-nowrap">
                      {r.name}
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3 font-sans text-slate-400 whitespace-nowrap">
                      {r.category}
                    </td>

                    {/* Return */}
                    <td
                      className={`py-3.5 px-3 text-right font-bold tabular-nums whitespace-nowrap ${
                        r.metrics.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {r.metrics.totalReturnPercent >= 0 ? '+' : ''}
                      {r.metrics.totalReturnPercent.toFixed(2)}%
                    </td>

                    {/* Win Rate */}
                    <td className="py-3.5 px-3 text-right text-slate-200 tabular-nums whitespace-nowrap">
                      {r.metrics.winRatePercent.toFixed(1)}%
                    </td>

                    {/* Trades */}
                    <td className="py-3.5 px-3 text-right text-slate-300 tabular-nums whitespace-nowrap">
                      {r.metrics.totalTrades}
                    </td>

                    {/* Profit Factor */}
                    <td className="py-3.5 px-3 text-right text-slate-200 font-bold tabular-nums whitespace-nowrap">
                      {r.metrics.profitFactor.toFixed(2)}
                    </td>

                    {/* Max DD */}
                    <td className="py-3.5 px-3 text-right text-rose-400 tabular-nums whitespace-nowrap">
                      -{r.metrics.maxDrawdownPercent.toFixed(2)}%
                    </td>

                    {/* Sharpe */}
                    <td className="py-3.5 px-3 text-right text-slate-200 tabular-nums whitespace-nowrap">
                      {r.metrics.sharpeRatio}
                    </td>

                    {/* Avg Win */}
                    <td className="py-3.5 px-3 text-right text-emerald-400 tabular-nums whitespace-nowrap">
                      +${r.metrics.avgWin.toFixed(1)}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>当前选中</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectStrategy(r.key)}
                          className="px-2.5 py-1 text-[11px] font-sans font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                        >
                          切换测试
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
