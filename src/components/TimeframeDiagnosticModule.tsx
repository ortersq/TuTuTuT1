import React from 'react';
import { TimeframeDiagnosticReport } from '../types/trading';
import { Clock, CheckCircle2, AlertTriangle, Activity, Sparkles, Trophy, ArrowUpRight } from 'lucide-react';

interface TimeframeDiagnosticModuleProps {
  report?: TimeframeDiagnosticReport;
}

export const TimeframeDiagnosticModule: React.FC<TimeframeDiagnosticModuleProps> = ({ report }) => {
  if (!report) {
    return (
      <div className="bg-[#0e131f] border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
        正在分析 1m 到 1d 全周期历史胜率与波动率匹配度...
      </div>
    );
  }

  const { regimeName, regimeDescription, volatilityIndexRatio, recommendedTimeframe, recommendationReason, rankings } = report;

  const getRankBadge = (rank: number, isRec: boolean) => {
    if (isRec) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse">
          <Trophy className="w-3 h-3 text-amber-400 fill-current" />
          RANK #{rank} (最佳黄金推荐)
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          RANK #2
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800/80 text-amber-600/80 border border-slate-800">
          RANK #3
        </span>
      );
    }
    return <span className="text-slate-500 text-[11px] font-mono">#{rank}</span>;
  };

  const getSuitabilityColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
    if (score >= 80) return 'text-sky-400 bg-sky-500/20 border-sky-500/30';
    if (score >= 60) return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/20 border-rose-500/30';
  };

  return (
    <div className="bg-[#0e131f] border border-slate-800 rounded-xl overflow-hidden shadow-xl space-y-0">
      {/* Header Banner */}
      <div className="p-5 bg-slate-900/80 border-b border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                全周期 K线胜率诊断与最佳时空推荐 (1m 到 1d Timeframe Diagnostic)
              </h3>
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-semibold border border-sky-500/30">
                1m ~ 1d 全覆盖
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              自动根据大盘波动率指数 (V-Ratio: {volatilityIndexRatio}x) 诊断匹配最适合当前行情的 K线分析周期。
            </p>
          </div>
        </div>

        {/* Current Volatility Regime Badge */}
        <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">当前盘面波动率状态</div>
            <div className="text-xs font-bold text-white mt-0.5">{regimeName}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
            <Activity className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Recommendation Banner */}
      <div className="p-4 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border-b border-slate-800/80 flex items-center gap-3.5">
        <Sparkles className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
        <div className="text-xs text-slate-200">
          <span className="font-bold text-amber-300 mr-2">【AI 诊断结论】:</span>
          <span>{recommendationReason}</span>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">诊断排名</th>
              <th className="px-4 py-3">K线周期</th>
              <th className="px-4 py-3">波动率环境适配度</th>
              <th className="px-4 py-3">历史实盘/模拟胜率</th>
              <th className="px-4 py-3">累计净收益 (USDT)</th>
              <th className="px-4 py-3">行情环境诊断提示</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rankings.map((item) => (
              <tr
                key={item.timeframe}
                className={`transition-colors ${
                  item.isRecommended
                    ? 'bg-amber-500/10 hover:bg-amber-500/15'
                    : 'hover:bg-slate-900/50'
                }`}
              >
                <td className="px-4 py-3.5 font-medium">{getRankBadge(item.rank, item.isRecommended)}</td>

                <td className="px-4 py-3.5 font-bold text-white flex items-center gap-2">
                  <span className="text-sm font-mono">{item.timeframe}</span>
                  {item.isRecommended && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-bold text-[10px]">
                      最佳
                    </span>
                  )}
                </td>

                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2 max-w-[130px]">
                    <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${item.volatilitySuitabilityScore}%` }}
                      />
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getSuitabilityColor(
                        item.volatilitySuitabilityScore
                      )}`}
                    >
                      {item.volatilitySuitabilityScore}分
                    </span>
                  </div>
                </td>

                <td className="px-4 py-3.5">
                  {item.totalTrades === 0 ? (
                    <span className="text-slate-500 text-[11px]">基准预估 50.0% (无数据)</span>
                  ) : (
                    <div>
                      <span className="font-bold text-slate-100">{item.winRate.toFixed(1)}%</span>
                      <span className="text-[10px] text-slate-500 ml-1.5">
                        ({item.wins}/{item.totalTrades}胜)
                      </span>
                    </div>
                  )}
                </td>

                <td className="px-4 py-3.5 font-mono">
                  <span
                    className={
                      item.totalNetPnlUsdt >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                    }
                  >
                    {item.totalNetPnlUsdt >= 0 ? '+' : ''}
                    {item.totalNetPnlUsdt.toFixed(2)} USDT
                  </span>
                </td>

                <td className="px-4 py-3.5 text-slate-300 text-[11px] font-medium">
                  {item.regimeFitDescription}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
