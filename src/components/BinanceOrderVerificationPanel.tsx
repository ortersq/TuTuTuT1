import React from 'react';
import { ActivePosition, BotTradeRecord, LogEntry } from '../server/botEngine';
import { ShieldCheck, ShieldAlert, Lock, AlertTriangle, Activity } from 'lucide-react';

interface BinanceOrderVerificationPanelProps {
  activePositions: ActivePosition[];
  closedTrades: BotTradeRecord[];
  logs: LogEntry[];
  hasBinanceKeys: boolean;
  onSyncLive?: () => void;
}

export const BinanceOrderVerificationPanel: React.FC<BinanceOrderVerificationPanelProps> = ({
  activePositions,
  closedTrades,
  logs,
  hasBinanceKeys,
  onSyncLive,
}) => {
  // Filter recent risk intervention & circuit breaker / emergency close logs
  const riskInterventionLogs = logs.filter(
    (l) =>
      l.category === 'ORDER' ||
      l.message.includes('熔断') ||
      l.message.includes('强平') ||
      l.message.includes('平仓') ||
      l.message.includes('保本') ||
      l.message.includes('利润保护') ||
      l.message.includes('止损') ||
      l.message.includes('撤单')
  ).slice(0, 15);

  return (
    <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              策略执行透明度与熔断风控流水面板 (Live Order & Circuit Breaker Audit)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              实时验证已挂载在币安后台的止盈止损单（TP/SL Order IDs），并直观回溯系统因风控触发的强制平仓、自动保本与熔断介入历史。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${
              hasBinanceKeys
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
            }`}
          >
            {hasBinanceKeys ? '🟢 币安实盘 API 已连接' : '🔵 模拟观察模式 (无交易所挂单)'}
          </span>
          {hasBinanceKeys && onSyncLive && (
            <button
              onClick={onSyncLive}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors cursor-pointer font-mono"
            >
              立即同步交易所挂单
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Active Positions & TP/SL Verification */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-sky-400" />
          <span>活动持仓与交易所挂单绑定状态 ({activePositions.length} 笔持仓运行中):</span>
        </div>

        {activePositions.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#0b0e14] border border-slate-800 text-xs text-slate-500 text-center">
            当前暂无活动持仓。当策略触发开仓或您在币安有持仓时，此处将实时展示对应的市价单号与交易所后台 TP/SL 条件挂单 ID。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePositions.map((pos) => {
              const hasSl = Boolean(pos.stopLossPrice || pos.stopLossOrderId);
              const hasTp = Boolean(pos.takeProfitPrice || pos.takeProfitOrderId);
              const isProtected = hasSl && hasTp;

              return (
                <div
                  key={pos.id}
                  className={`rounded-xl p-4 border space-y-3 ${
                    isProtected
                      ? 'bg-[#0b0e14] border-emerald-500/30'
                      : 'bg-amber-950/20 border-amber-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <span>{pos.symbol}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            pos.side === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {pos.side} {pos.leverage}x
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        形态: {pos.patternName || '量化策略开仓'} ({pos.interval})
                      </div>
                    </div>

                    <span
                      className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold font-mono flex items-center gap-1 ${
                        isProtected
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {isProtected ? (
                        <>
                          <ShieldCheck className="w-3 h-3" /> 双重风控已绑定
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3 h-3" /> 正在补挂风控
                        </>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300 bg-[#151c2c] p-2.5 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-slate-500">开仓均价:</span> ${pos.entryPrice.toFixed(2)}
                    </div>
                    <div>
                      <span className="text-slate-500">持仓数量:</span> {pos.quantity}
                    </div>
                    <div>
                      <span className="text-slate-500">保证金:</span> ${pos.marginUsed.toFixed(2)}
                    </div>
                    <div>
                      <span className="text-slate-500">浮动盈亏:</span>{' '}
                      <strong
                        className={
                          pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[11px] font-mono border-t border-slate-800/80 pt-2.5 text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-sky-400" /> 主仓订单号:
                      </span>
                      <span className="text-sky-300 font-semibold">
                        {pos.binanceOrderId ? `#${pos.binanceOrderId}` : pos.isPaper ? '模拟订单' : '未返回'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-rose-400" /> 交易所止损 (SL):
                      </span>
                      <span className={pos.stopLossPrice ? 'text-rose-300 font-semibold' : 'text-slate-500'}>
                        {pos.stopLossPrice
                          ? `$${pos.stopLossPrice.toFixed(2)} ${pos.stopLossOrderId ? `(#${pos.stopLossOrderId})` : '(本地监控)'}`
                          : '暂未设定'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" /> 交易所止盈 (TP):
                      </span>
                      <span className={pos.takeProfitPrice ? 'text-emerald-300 font-semibold' : 'text-slate-500'}>
                        {pos.takeProfitPrice
                          ? `$${pos.takeProfitPrice.toFixed(2)} ${pos.takeProfitOrderId ? `(#${pos.takeProfitOrderId})` : '(本地追踪)'}`
                          : '动态追踪止盈'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Circuit Breaker & Risk Intervention Execution History */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>熔断风控与强制平仓执行流水 (Circuit Breaker & Risk Intervention Log):</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            展示最近 {riskInterventionLogs.length} 条风控、熔断与平仓记录
          </span>
        </div>

        {riskInterventionLogs.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#0b0e14] border border-slate-800 text-xs text-slate-500 text-center">
            暂无风控熔断介入日志。当市场出现剧烈共振、触发自动保本、利润保护止盈或大盘回撤熔断时，系统将在此实时直观记录。
          </div>
        ) : (
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 font-mono text-[11px]">
            {riskInterventionLogs.map((log) => {
              const isError = log.level === 'error';
              const isSuccess = log.level === 'success';
              const isWarn = log.level === 'warn';

              return (
                <div key={log.id} className="p-3 flex items-start justify-between gap-3 hover:bg-slate-900/50 transition-colors">
                  <div className="flex items-start gap-2.5">
                    <span className="text-slate-500 shrink-0 pt-0.5">{log.time}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        isError
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : isSuccess
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : isWarn
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {log.category}
                    </span>
                    <span className="text-slate-200 leading-relaxed">{log.message}</span>
                  </div>

                  {log.symbol && (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                      {log.symbol}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
