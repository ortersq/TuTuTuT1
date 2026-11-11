import React from 'react';
import { BotStatus, ActivePosition, BotTradeRecord } from '../server/botEngine';
import { ShieldAlert, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';

interface PositionsAndLogsProps {
  status: BotStatus | null;
  onClosePosition: (symbol: string) => void;
}

export const PositionsAndLogs: React.FC<PositionsAndLogsProps> = ({
  status,
  onClosePosition,
}) => {
  const activePositions = status?.activePositions || [];
  const closedTrades = status?.closedTrades || [];

  // Calculate Metrics for Completed Trades Log
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter((t) => t.netPnl > 0).length;
  const losses = closedTrades.filter((t) => t.netPnl < 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnl = closedTrades.reduce((acc, t) => acc + t.netPnl, 0);

  const grossWin = closedTrades.filter((t) => t.netPnl > 0).reduce((acc, t) => acc + t.netPnl, 0);
  const grossLoss = Math.abs(
    closedTrades.filter((t) => t.netPnl < 0).reduce((acc, t) => acc + t.netPnl, 0)
  );
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

  return (
    <div className="space-y-6">
      {/* Active Open Positions Section */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>当前活跃持仓 ({activePositions.length})</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            持仓实时浮动盈亏: ${activePositions.reduce((acc, p) => acc + p.unrealizedPnl, 0).toFixed(2)} USDT
          </span>
        </div>

        {activePositions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            目前无活跃持仓。当 5m / 15m / 30m 产生图表形态信号时，系统将自动开仓。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePositions.map((pos) => (
              <div
                key={pos.id}
                className="bg-[#0b0e14] border border-emerald-500/40 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        pos.side === 'LONG'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {pos.side} {pos.leverage}x
                    </span>
                    <strong className="text-sm text-slate-100">{pos.symbol}</strong>
                    <span className="text-xs text-slate-400">({pos.interval})</span>
                  </div>

                  <button
                    onClick={() => onClosePosition(pos.symbol)}
                    className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    市价平仓
                  </button>
                </div>

                <div className="text-xs text-slate-300 font-medium">
                  形态: <span className="text-amber-400 font-semibold">{pos.patternName}</span>
                  {pos.isPaper && (
                    <span className="ml-2 text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                      模拟模式
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-[#111726] p-2.5 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-400 block text-[10px]">开仓均价</span>
                    <span className="text-slate-200">${pos.entryPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">当前标记价</span>
                    <span className="text-slate-200">${pos.currentPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">保证金 / 杠杆</span>
                    <span className="text-slate-200">${pos.marginUsed.toFixed(1)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-slate-400">未实现净盈亏:</span>
                  <strong
                    className={`font-mono text-sm ${
                      pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} (
                    {pos.unrealizedPnlPercent >= 0 ? '+' : ''}
                    {pos.unrealizedPnlPercent.toFixed(2)}%)
                  </strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Trades Summary & Table */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span>历史调单与盈亏记录日志 ({closedTrades.length})</span>
          </h3>
        </div>

        {/* Metric Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#0b0e14] p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">已平仓总净盈亏</div>
            <div
              className={`text-sm font-bold font-mono mt-1 ${
                totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">调单胜率</div>
            <div className="text-sm font-bold font-mono text-amber-400 mt-1">
              {winRate.toFixed(1)}% ({wins}胜 / {losses}负)
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">盈亏比 (Profit Factor)</div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1">
              {profitFactor.toFixed(2)}
            </div>
          </div>

          <div className="bg-[#0b0e14] p-3 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400">已完成交易笔数</div>
            <div className="text-sm font-bold font-mono text-slate-100 mt-1">{totalTrades} 笔</div>
          </div>
        </div>

        {/* Trade History Table */}
        {closedTrades.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            暂无已完成的交易记录。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#0b0e14] text-slate-400 border-b border-slate-800 font-mono">
                <tr>
                  <th className="py-2.5 px-3">时间</th>
                  <th className="py-2.5 px-3">币种/周期</th>
                  <th className="py-2.5 px-3">方向</th>
                  <th className="py-2.5 px-3">触发形态</th>
                  <th className="py-2.5 px-3">开仓价</th>
                  <th className="py-2.5 px-3">平仓价</th>
                  <th className="py-2.5 px-3">平仓原因</th>
                  <th className="py-2.5 px-3 text-right">净盈亏</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {closedTrades
                  .slice()
                  .reverse()
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(t.exitTime).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-200">
                        {t.symbol} <span className="text-[10px] text-slate-400">({t.interval})</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.side === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-amber-300">{t.patternName}</td>
                      <td className="py-2.5 px-3 text-slate-300">${t.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-300">${t.exitPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-400">{t.exitReason}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.netPnl >= 0 ? '+' : ''}${t.netPnl.toFixed(2)} ({t.pnlPercent >= 0 ? '+' : ''}
                        {t.pnlPercent.toFixed(1)}%)
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
