import React, { useState } from 'react';
import { Layers, ShieldCheck, AlertTriangle, TrendingUp, Clock, Check, X } from 'lucide-react';
import { PortfolioBasketState } from '../types/trading';

interface PortfolioBasketPanelProps {
  basket: PortfolioBasketState | null | undefined;
  activePositionsCount: number;
  onCloseAllPositions?: () => Promise<void> | void;
}

export const PortfolioBasketPanel: React.FC<PortfolioBasketPanelProps> = ({
  basket,
  activePositionsCount,
  onCloseAllPositions,
}) => {
  const [confirmingCloseAll, setConfirmingCloseAll] = useState<boolean>(false);
  const [isClosingAll, setIsClosingAll] = useState<boolean>(false);

  const handleConfirmCloseAll = async () => {
    if (!onCloseAllPositions || isClosingAll) return;
    setIsClosingAll(true);
    try {
      await onCloseAllPositions();
    } finally {
      setIsClosingAll(false);
      setConfirmingCloseAll(false);
    }
  };

  const state: PortfolioBasketState = basket || {
    enabled: true,
    positionsCount: activePositionsCount,
    winningCount: 0,
    losingCount: 0,
    totalMarginUsed: 0,
    totalNotional: 0,
    grossUnrealizedPnl: 0,
    estimatedRoundTripFees: 0,
    estimatedSlippageBuffer: 0,
    netRealizablePnl: 0,
    netReturnOnMarginPercent: 0,
    peakNetRealizablePnl: 0,
    isTrailingActive: false,
    regimeAssessment: 'NO_ACTION',
    shouldCloseAll: false,
    decisionReason: '等待拉取组合篮子净利与行情结构评估...',
    cooldownActiveUntil: null,
    lastEvaluatedAt: Date.now(),
  };

  const totalCostDeduction = state.estimatedRoundTripFees + state.estimatedSlippageBuffer;
  const now = Date.now();
  const cooldownRemainMins =
    state.cooldownActiveUntil && state.cooldownActiveUntil > now
      ? Math.max(1, Math.ceil((state.cooldownActiveUntil - now) / 60000))
      : 0;

  const regimeBadgeMap: Record<
    PortfolioBasketState['regimeAssessment'],
    { label: string; style: string }
  > = {
    RANGE_LOCK: {
      label: '⚖️ 震荡见好全平触发',
      style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
    TREND_HOLD: {
      label: '🚀 单边顺风追踪持盈中',
      style: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    },
    TREND_TRAILING_EXIT: {
      label: '💰 篮子追踪回吐锁利触发',
      style: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    RISK_DEFENSE_EXIT: {
      label: '🚨 风险/拐头全平避险',
      style: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    },
    NO_ACTION: {
      label: state.enabled ? '🛡️ 自动篮子监测中' : '⚪ 自动篮子已暂停',
      style: 'bg-slate-800 text-slate-300 border-slate-700',
    },
  };

  const badge = regimeBadgeMap[state.regimeAssessment] || regimeBadgeMap.NO_ACTION;

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100">
              组合篮子净利智能止盈 &amp; 一键全平中心 (Portfolio Basket Net Take-Profit)
            </h3>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${badge.style}`}>
              {badge.label}
            </span>
            {cooldownRemainMins > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border bg-cyan-500/15 text-cyan-300 border-cyan-500/30 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 防复开冷却 {cooldownRemainMins} 分钟
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            自动扣除开/平双边手续费与市价滑点缓冲；多持仓（如盈利+亏损混持）净赚后结合震荡/单边趋势自动决定落袋全平或追踪持盈，也支持人工一键全平并清空币安挂单。
          </p>
        </div>

        {/* Safe 2-step One-Click Close All Control */}
        {onCloseAllPositions && (
          <div className="flex items-center gap-2">
            {!confirmingCloseAll ? (
              <button
                type="button"
                disabled={activePositionsCount === 0 || isClosingAll}
                onClick={() => setConfirmingCloseAll(true)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  activePositionsCount === 0
                    ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                    : state.netRealizablePnl > 0
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/50 cursor-pointer shadow-sm'
                    : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40 cursor-pointer'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {activePositionsCount === 0
                    ? '当前无持仓可全平'
                    : `一键全平 ${activePositionsCount} 笔持仓 (${
                        state.netRealizablePnl >= 0 ? '+' : ''
                      }$${state.netRealizablePnl.toFixed(2)})`}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-950/50 border border-rose-500/50 px-2.5 py-1.5 rounded-xl text-xs">
                <span className="text-rose-200 font-semibold">
                  确认按先亏后盈全平 {activePositionsCount} 单并撤挂单？
                </span>
                <button
                  type="button"
                  disabled={isClosingAll}
                  onClick={handleConfirmCloseAll}
                  className="px-2.5 py-1 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  <span>{isClosingAll ? '执行中...' : '确认全平'}</span>
                </button>
                <button
                  type="button"
                  disabled={isClosingAll}
                  onClick={() => setConfirmingCloseAll(false)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>取消</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4 Breakdown Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">多空持仓结构</div>
          <div className="text-sm font-bold font-mono text-slate-100 mt-1">
            共 {state.positionsCount} 单{' '}
            <span className="text-xs">
              (<span className="text-emerald-400">{state.winningCount}盈</span> /{' '}
              <span className="text-rose-400">{state.losingCount}亏</span>)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            占用保证金 ${state.totalMarginUsed.toFixed(2)} | 名义 ${state.totalNotional.toFixed(0)}
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">交易所原始浮盈合</div>
          <div
            className={`text-sm font-bold font-mono mt-1 ${
              state.grossUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {state.grossUnrealizedPnl >= 0 ? '+' : ''}${state.grossUnrealizedPnl.toFixed(2)} USDT
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            未扣双边手续费与市价滑点前
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium">双边手续费 + 滑点预留</div>
          <div className="text-sm font-bold font-mono text-amber-400 mt-1">
            -${totalCostDeduction.toFixed(2)} USDT
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            手续费 ${state.estimatedRoundTripFees.toFixed(2)} + 滑点 ${state.estimatedSlippageBuffer.toFixed(2)}
          </div>
        </div>

        <div className="bg-[#0b0e14] border border-slate-800/80 rounded-xl p-3">
          <div className="text-slate-400 font-medium flex items-center justify-between">
            <span>实际可落袋净利 (Net)</span>
            {state.isTrailingActive && (
              <span className="text-[10px] text-sky-400 font-mono flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> 峰值 +${state.peakNetRealizablePnl.toFixed(2)}
              </span>
            )}
          </div>
          <div
            className={`text-sm font-bold font-mono mt-1 ${
              state.netRealizablePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {state.netRealizablePnl >= 0 ? '+' : ''}${state.netRealizablePnl.toFixed(2)} USDT (
            {state.netReturnOnMarginPercent >= 0 ? '+' : ''}
            {state.netReturnOnMarginPercent.toFixed(2)}%)
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            已彻底扣除开平双向成本
          </div>
        </div>
      </div>

      {/* Live Decision Narrative Bar */}
      <div className="px-3.5 py-2.5 bg-[#0b0e14] border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>{state.decisionReason}</span>
      </div>
    </div>
  );
};
