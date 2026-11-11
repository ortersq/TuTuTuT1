import React, { useEffect, useState, useRef } from 'react';
import { BotStatus } from '../server/botEngine';
import { StrategyKey } from '../types/trading';
import { STRATEGY_CATALOG } from '../utils/strategies';
import {
  Play,
  Square,
  AlertOctagon,
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Terminal,
  Crown,
} from 'lucide-react';

export const AutoBotPanel: React.FC = () => {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      // Ignored if offline during restart
    }
  };

  useEffect(() => {
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const handleStart = async () => {
    setLoadingAction('start');
    try {
      const res = await fetch('/api/bot/start', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStop = async () => {
    setLoadingAction('stop');
    try {
      const res = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEmergencyClose = async () => {
    if (!confirm('确定要立即平仓当前所有持仓吗？')) return;
    setLoadingAction('close');
    try {
      const res = await fetch('/api/bot/close-position', { method: 'POST' });
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleToggleAutoChampion = async (enabled: boolean) => {
    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSelectChampion: enabled }),
      });
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } catch (err) {}
  };

  const handleStrategyChange = async (key: StrategyKey) => {
    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStrategy: key, autoSelectChampion: false }),
      });
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } catch (err) {}
  };

  if (!status) {
    return (
      <div className="h-80 flex flex-col items-center justify-center text-slate-400 gap-3 bg-[#111726] rounded-xl border border-slate-800">
        <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
        <span className="text-sm">正在连接后端全自动交易执行引擎...</span>
      </div>
    );
  }

  const pos = status.activePosition;

  return (
    <div className="space-y-6">
      {/* 1. Master Control Banner */}
      <div
        className={`border-2 rounded-2xl p-6 transition-colors ${
          status.isRunning
            ? 'bg-gradient-to-r from-emerald-950/40 via-[#111726] to-[#111726] border-emerald-500/50'
            : 'bg-[#111726] border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  status.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  status.isRunning ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {status.isRunning ? '全自动量化机器人运行中 (AUTONOMOUS BOT RUNNING)' : '全自动机器人已暂停 (BOT STOPPED)'}
              </span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              币安合约 24/7 全自动交易执行引擎
            </h2>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              实时直连币安真实行情，后台循环轮询 K 线，<strong>自动寻优锁定最优策略</strong>，发出信号时<strong>自动开多/开空</strong>，并严格按照 ATR 动态止损、目标盈亏比止盈、移动追踪及最大回撤熔断<strong>全自动平仓止盈止损</strong>。
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!status.isRunning ? (
              <button
                onClick={handleStart}
                disabled={loadingAction === 'start'}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>启动全自动量化机器人</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={loadingAction === 'stop'}
                className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>暂停自动交易</span>
              </button>
            )}

            {pos && (
              <button
                onClick={handleEmergencyClose}
                disabled={loadingAction === 'close'}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-rose-300 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
              >
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span>紧急全平当前持仓</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Top Engine HUD Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
        <div className="p-4 bg-[#111726] border border-slate-800 rounded-xl">
          <div className="text-slate-400 font-sans">当前账户权益 (Equity)</div>
          <div className="text-xl font-bold text-white mt-1 tabular-nums">
            ${status.equity.toFixed(2)} USDT
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-sans">
            可用本金: ${status.balance.toFixed(2)}
          </div>
        </div>

        <div className="p-4 bg-[#111726] border border-slate-800 rounded-xl">
          <div className="text-slate-400 font-sans">当前运行最优策略</div>
          <div className="text-base font-bold text-amber-400 mt-1 truncate">
            {status.autoSelectChampion ? `👑 ${status.championStrategyName}` : status.currentStrategy}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-sans">
            状态机判定: {status.marketRegime === 'TREND' ? '单边强趋势' : '箱体震荡'}
          </div>
        </div>

        <div className="p-4 bg-[#111726] border border-slate-800 rounded-xl">
          <div className="text-slate-400 font-sans">标的与杠杆倍数</div>
          <div className="text-xl font-bold text-sky-400 mt-1">
            {status.symbol} · {status.leverage}x
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-sans">
            时间周期: {status.interval}
          </div>
        </div>

        <div className="p-4 bg-[#111726] border border-slate-800 rounded-xl">
          <div className="text-slate-400 font-sans">风控最大回撤熔断</div>
          <div className="text-xl font-bold text-rose-400 mt-1 tabular-nums">
            -{status.drawdownPercent.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-sans">
            熔断安全线: -{status.riskConfig.maxAllowedDrawdownPercent}%
          </div>
        </div>
      </div>

      {/* 3. Real-Time Active Position Card */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between mb-4">
          <span className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>实时合约持仓监控 (Real-Time Position Tracker)</span>
          </span>
          {pos ? (
            <span className="text-emerald-400 text-xs font-mono font-bold animate-pulse">
              ● 正在持仓中
            </span>
          ) : (
            <span className="text-slate-400 text-xs font-mono">
              ○ 当前空仓，正在等待突破信号
            </span>
          )}
        </h3>

        {pos ? (
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1 ${
                    pos.side === 'LONG'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {pos.side === 'LONG' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{pos.side === 'LONG' ? '做多' : '做空'} {pos.leverage}x</span>
                </span>
                <span className="text-base font-bold text-white font-mono">{pos.symbol}</span>
                <span className="text-xs text-slate-400">数量: {pos.quantity.toFixed(4)}</span>
              </div>

              {/* Unrealized PnL */}
              <div className="text-right font-mono">
                <div className="text-xs text-slate-400 font-sans">未实现浮动盈亏</div>
                <div
                  className={`text-2xl font-black tabular-nums ${
                    pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} USDT ({pos.unrealizedPnlPercent >= 0 ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)
                </div>
              </div>
            </div>

            {/* Price Levels Matrix */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                <div className="text-slate-400 font-sans text-[11px]">开仓成本价</div>
                <div className="text-slate-200 font-bold mt-0.5">${pos.entryPrice.toFixed(2)}</div>
              </div>

              <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                <div className="text-slate-400 font-sans text-[11px]">最新标记价</div>
                <div className="text-amber-400 font-bold mt-0.5">${pos.currentPrice.toFixed(2)}</div>
              </div>

              <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                <div className="text-slate-400 font-sans text-[11px]">动态止损价 (SL)</div>
                <div className="text-rose-400 font-bold mt-0.5">
                  {pos.stopLossPrice ? `$${pos.stopLossPrice.toFixed(2)}` : '未设'}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                <div className="text-slate-400 font-sans text-[11px]">目标止盈价 (TP)</div>
                <div className="text-emerald-400 font-bold mt-0.5">
                  {pos.takeProfitPrice ? `$${pos.takeProfitPrice.toFixed(2)}` : '顺势追踪'}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800">
                <div className="text-slate-400 font-sans text-[11px]">强平警戒线</div>
                <div className="text-rose-500 font-bold mt-0.5">${pos.liquidationPrice.toFixed(2)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-xs">
            当前无活跃持仓。机器人正在 24/7 监控 K 线与动量指标，当触发开仓条件时将全自动挂单开仓。
          </div>
        )}
      </div>

      {/* 4. Champion Strategy Selector & Automation Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Strategy Control */}
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>策略自动选择引擎 (Champion Strategy Engine)</span>
            </span>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">开启全自动寻优策略模式</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                实时对 7 大成熟策略跑分，自动切换为在当前市场环境下胜率与盈亏比最高的冠军策略。
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={status.autoSelectChampion}
                onChange={(e) => handleToggleAutoChampion(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400"></div>
            </label>
          </div>

          {!status.autoSelectChampion && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">手动指定执行策略:</label>
              <select
                value={status.currentStrategy}
                onChange={(e) => handleStrategyChange(e.target.value as StrategyKey)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-amber-300 font-medium focus:outline-none cursor-pointer"
              >
                {STRATEGY_CATALOG.map((s) => (
                  <option key={s.key} value={s.key} className="bg-slate-900 text-slate-200">
                    {s.name} ({s.category})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Live Rolling Logs */}
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>机器人实时执行控制台日志 (Live Logs)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">12秒轮询一次</span>
            </div>

            <div className="bg-[#090d16] border border-slate-800 rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1.5 selection:bg-amber-500/30">
              {status.logs.length === 0 ? (
                <div className="text-slate-500">等待日志输出...</div>
              ) : (
                status.logs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    <span className="text-slate-500 mr-2">[{log.time}]</span>
                    <span
                      className={
                        log.level === 'error'
                          ? 'text-rose-400 font-semibold'
                          : log.level === 'warn'
                          ? 'text-amber-400'
                          : log.level === 'success'
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Closed Trades History */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-3">
          机器人历史已平仓订单记录 ({status.closedTrades.length} 笔)
        </h3>

        {status.closedTrades.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            暂无已平仓订单记录。机器人开单后当触及止盈、止损或反向信号平仓时将自动记入此流水表。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold font-sans">
                  <th className="py-2.5 px-3">方向</th>
                  <th className="py-2.5 px-3">开仓时间</th>
                  <th className="py-2.5 px-3">平仓时间</th>
                  <th className="py-2.5 px-3 text-right">开仓价</th>
                  <th className="py-2.5 px-3 text-right">平仓价</th>
                  <th className="py-2.5 px-3 text-right">保证金</th>
                  <th className="py-2.5 px-3 text-right">净盈亏</th>
                  <th className="py-2.5 px-3 text-right">收益率</th>
                  <th className="py-2.5 px-3 font-sans">平仓触发原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {status.closedTrades.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3">
                      <span className={t.side === 'LONG' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {t.side === 'LONG' ? '做多' : '做空'} {t.leverage}x
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {new Date(t.entryTime).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {new Date(t.exitTime).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">${t.entryPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right">${t.exitPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right">${t.marginUsed.toFixed(1)}</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.netPnl >= 0 ? '+' : ''}${t.netPnl.toFixed(2)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      {t.exitReason === 'TAKE_PROFIT'
                        ? '🎯 达到目标止盈'
                        : t.exitReason === 'STOP_LOSS'
                        ? '🛑 触碰止损线'
                        : t.exitReason === 'TRAILING_STOP'
                        ? '✦ 移动追踪回调止盈'
                        : t.exitReason === 'SIGNAL_REVERSAL'
                        ? '🔄 反向信号平仓'
                        : '手动平仓'}
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
