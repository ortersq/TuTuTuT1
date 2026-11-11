import React from 'react';
import { BacktestMetrics } from '../types/trading';
import { TrendingUp, TrendingDown, Target, ShieldAlert, Award, Activity } from 'lucide-react';

interface MetricsCardsProps {
  metrics: BacktestMetrics;
  strategyName: string;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ metrics, strategyName }) => {
  const isProfit = metrics.totalReturnPercent >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-5">
      {/* 1. Total Net Profit */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>净收益率 (Total Return)</span>
          {isProfit ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-400" />
          )}
        </div>
        <div className="my-1.5">
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              isProfit ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isProfit ? '+' : ''}
            {metrics.totalReturnPercent.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            净利润: {metrics.netProfit >= 0 ? '+' : ''}
            {metrics.netProfit.toFixed(1)} USDT
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-800/60">
          <span>Alpha 超额:</span>
          <span className="font-mono tabular-nums text-slate-300">
            {metrics.alphaPercent >= 0 ? '+' : ''}
            {metrics.alphaPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 2. Win Rate */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>胜率 (Win Rate)</span>
          <Target className="w-4 h-4 text-amber-400" />
        </div>
        <div className="my-1.5">
          <div className="text-xl font-bold text-slate-100 font-mono tabular-nums">
            {metrics.winRatePercent.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            {metrics.winningTrades} 胜 / {metrics.losingTrades} 负 (共 {metrics.totalTrades} 笔)
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-800/60">
          <span>多/空胜率:</span>
          <span className="font-mono tabular-nums text-slate-300">
            {metrics.longWinRatePercent.toFixed(0)}% / {metrics.shortWinRatePercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* 3. Profit Factor */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>盈亏比 (Profit Factor)</span>
          <Award className="w-4 h-4 text-sky-400" />
        </div>
        <div className="my-1.5">
          <div className="text-xl font-bold text-slate-100 font-mono tabular-nums">
            {metrics.profitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            单笔均盈: +{metrics.avgWin.toFixed(1)} / 均亏: -{metrics.avgLoss.toFixed(1)}
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-800/60">
          <span>赔率比:</span>
          <span className="font-mono tabular-nums text-slate-300">
            {metrics.winLossRatio.toFixed(2)} : 1
          </span>
        </div>
      </div>

      {/* 4. Max Drawdown */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>最大回撤 (Max DD)</span>
          <ShieldAlert className="w-4 h-4 text-orange-400" />
        </div>
        <div className="my-1.5">
          <div className="text-xl font-bold text-rose-400 font-mono tabular-nums">
            -{metrics.maxDrawdownPercent.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            最长回撤持续: {metrics.maxDrawdownDurationDays.toFixed(1)} 天
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-800/60">
          <span>Calmar 比率:</span>
          <span className="font-mono tabular-nums text-slate-300">
            {metrics.calmarRatio.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 5. Sharpe & Sortino */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>夏普比率 (Sharpe)</span>
          <Activity className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="my-1.5">
          <div className="text-xl font-bold text-slate-100 font-mono tabular-nums">
            {metrics.sharpeRatio}
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            索提诺比率 (Sortino): {metrics.sortinoRatio}
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-800/60">
          <span>年化 CAGR:</span>
          <span className="font-mono tabular-nums text-slate-300">
            {metrics.cagrPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 6. Risk Triggers Audit */}
      <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 text-xs">
          <span>风控执行统计</span>
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <div className="my-1.5">
          <div className="text-xl font-bold text-slate-100 font-mono tabular-nums">
            {metrics.slTriggersCount + metrics.tpTriggersCount + metrics.trailingTriggersCount} 次
          </div>
          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            止盈: {metrics.tpTriggersCount} · 止损: {metrics.slTriggersCount} · 移动: {metrics.trailingTriggersCount}
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1.5 border-t border-slate-800/60">
          <span>爆仓次数:</span>
          <span className="font-mono tabular-nums font-semibold text-emerald-400">
            {metrics.liquidationsCount} 次 (0% 穿仓)
          </span>
        </div>
      </div>
    </div>
  );
};
