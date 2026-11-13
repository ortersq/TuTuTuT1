import React, { useMemo, useState } from 'react';
import { BotStatus, LogEntry } from '../server/botEngine';
import {
  Terminal,
  Search,
  Download,
  ShieldAlert,
  Wrench,
  CheckCircle2,
  Filter,
  RotateCcw,
} from 'lucide-react';
import {
  analyzeLogRootCauses,
  RootCauseFixActionType,
} from '../utils/logRootCause';

interface SystemLogConsoleProps {
  logs: LogEntry[];
  status?: BotStatus | null;
  onRefresh: () => void;
  onExecuteFix?: (action: RootCauseFixActionType) => Promise<{ success: boolean; message: string } | void>;
}

export const SystemLogConsole: React.FC<SystemLogConsoleProps> = ({
  logs,
  status,
  onRefresh,
  onExecuteFix,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [activeFixType, setActiveFixType] = useState<RootCauseFixActionType | null>(null);
  const [fixFeedback, setFixFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const rootCauseReport = useMemo(
    () =>
      analyzeLogRootCauses(logs, {
        hasBinanceKeys: status?.hasBinanceKeys,
        syncOk: status?.liveSyncInfo?.syncOk,
        lastSyncError: status?.liveSyncInfo?.errorMessage,
        isDrawdownLocked: status?.riskMetrics?.isDrawdownLocked,
        isCircuitBreakerActive: status?.marketCorrelation?.isCircuitBreakerActive,
        equity: status?.equity,
        cooldownActiveUntil: status?.portfolioBasket?.cooldownActiveUntil,
      }),
    [logs, status]
  );

  const handleExportLogs = async () => {
    const token = localStorage.getItem('quant_auth_token');
    if (!token) return;
    setIsExporting(true);
    try {
      const res = await fetch('/api/bot/export-diagnostic-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `binance_quant_diagnostic_log_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch {
      // ignore
    } finally {
      setIsExporting(false);
    }
  };

  const handleTriggerFix = async (actionType: RootCauseFixActionType) => {
    if (!onExecuteFix) return;
    setActiveFixType(actionType);
    setFixFeedback(null);
    try {
      const res = await onExecuteFix(actionType);
      if (res && res.message) {
        setFixFeedback({ success: res.success, message: res.message });
      }
    } finally {
      setActiveFixType(null);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (selectedCategory !== 'ALL' && log.category !== selectedCategory) return false;
    if (selectedLevel !== 'ALL' && log.level !== selectedLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.category.toLowerCase().includes(q) ||
        (log.symbol && log.symbol.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Anomaly Root-Cause Tracer Panel */}
      <section
        aria-label="异常溯源诊断工具"
        className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            {rootCauseReport.items.length > 0 ? (
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                异常溯源诊断中心 (未触发交易原因自动定位 & 一键修复)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {rootCauseReport.primaryBlockerSummary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`px-2.5 py-1 rounded-lg border font-semibold ${
                rootCauseReport.items.length > 0
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              }`}
            >
              {rootCauseReport.items.length > 0
                ? `检出 ${rootCauseReport.items.length} 类阻断项 (${rootCauseReport.blockingEventsCount} 次事件)`
                : '链路正常 (0 阻断异常)'}
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setSelectedLevel('ALL');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>清除溯源筛选</span>
              </button>
            )}
          </div>
        </div>

        {fixFeedback && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between ${
              fixFeedback.success
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-200'
            }`}
          >
            <span>{fixFeedback.message}</span>
            <button
              type="button"
              onClick={() => setFixFeedback(null)}
              className="font-bold opacity-80 hover:opacity-100 cursor-pointer"
            >
              关闭
            </button>
          </div>
        )}

        {rootCauseReport.items.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              已扫描最近 {rootCauseReport.totalAnalyzedLogs} 条运行日志：未检测到 API 熔断、流动性匮乏、保证金限制或回撤锁仓导致漏单。
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {rootCauseReport.items.map((item) => {
              const sevStyle =
                item.severity === 'CRITICAL'
                  ? 'border-rose-500/40 bg-rose-950/15'
                  : item.severity === 'HIGH'
                  ? 'border-amber-500/40 bg-amber-950/15'
                  : 'border-sky-500/30 bg-[#0b0e14]';
              const badgeStyle =
                item.severity === 'CRITICAL'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : item.severity === 'HIGH'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-sky-500/20 text-sky-300 border-sky-500/40';
              const isFixing = activeFixType === item.fixAction.type;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 space-y-2.5 flex flex-col justify-between ${sevStyle}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-bold text-slate-100 leading-snug">
                        {item.title}
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${badgeStyle}`}
                      >
                        {item.severity} · {item.count} 次
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {item.explanation}
                    </p>

                    <div className="p-2 rounded-lg bg-[#07090e] border border-slate-800/80 text-[11px] font-mono text-slate-400 break-all">
                      <span className="text-slate-500">[{item.latestTime}] </span>
                      <span>{item.latestMessage}</span>
                    </div>

                    {item.symbols.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-slate-500">受影响合约:</span>
                        {item.symbols.map((sym) => (
                          <span
                            key={sym}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold"
                          >
                            {sym}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('ALL');
                        setSelectedLevel('ALL');
                        setSearchQuery(item.filterKeyword);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Filter className="w-3 h-3" />
                      <span>定位相关日志</span>
                    </button>

                    {onExecuteFix && (
                      <button
                        type="button"
                        disabled={isFixing}
                        onClick={() => handleTriggerFix(item.fixAction.type)}
                        title={item.fixAction.description}
                        className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>{isFixing ? '正在修复...' : item.fixAction.label}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Log Terminal Card */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Header & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100">核心系统运行与交易日志</h3>
            <span className="text-xs text-slate-400 font-mono">
              (共 {filteredLogs.length} 条记录 · 倒序实时排列)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-[#0b0e14] p-1 rounded-xl border border-slate-800 text-xs">
              {['ALL', 'SYSTEM', 'ORDER', 'SIGNAL', 'API'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat === 'ALL'
                    ? '全部分类'
                    : cat === 'SYSTEM'
                    ? '系统'
                    : cat === 'ORDER'
                    ? '开平仓'
                    : cat === 'SIGNAL'
                    ? '信号'
                    : '接口'}
                </button>
              ))}
            </div>

            {/* Level Filter */}
            <select
              aria-label="按日志级别筛选"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="bg-[#0b0e14] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">全部级别 (Info/Warn/Error)</option>
              <option value="info">Info (提示)</option>
              <option value="success">Success (成功)</option>
              <option value="warn">Warn (警告)</option>
              <option value="error">Error (错误)</option>
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                aria-label="搜索币种或日志关键字"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索币种或日志关键字..."
                className="pl-8 pr-3 py-1.5 bg-[#0b0e14] border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 w-48 font-mono"
              />
            </div>

            <button
              type="button"
              onClick={handleExportLogs}
              disabled={isExporting}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? '导出中...' : '📥 导出诊断日志包 (.json)'}</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              刷新日志
            </button>
          </div>
        </div>

        {/* Log Terminal Window */}
        <div className="bg-[#07090e] border border-slate-800/90 rounded-xl p-4 font-mono text-xs h-[500px] overflow-y-auto space-y-2 select-text">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600">
              未检索到匹配的系统日志记录。
            </div>
          ) : (
            filteredLogs.map((log) => {
              let levelBadge = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
              if (log.level === 'success') levelBadge = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
              else if (log.level === 'warn') levelBadge = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
              else if (log.level === 'error') levelBadge = 'text-rose-400 bg-rose-500/10 border-rose-500/30';

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-slate-900/50 transition-colors border-b border-slate-800/30 leading-relaxed"
                >
                  <span className="text-slate-500 shrink-0 text-[11px] font-mono mt-0.5">
                    [{log.time}]
                  </span>

                  <span className={`px-1.5 py-0.2 rounded border text-[10px] font-bold shrink-0 ${levelBadge}`}>
                    {log.level.toUpperCase()}
                  </span>

                  <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] shrink-0 font-semibold">
                    {log.category}
                  </span>

                  {log.symbol && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                      {log.symbol}
                    </span>
                  )}

                  <span
                    className={`flex-1 break-all ${
                      log.level === 'error'
                        ? 'text-rose-300 font-semibold'
                        : log.level === 'success'
                        ? 'text-emerald-300 font-semibold'
                        : log.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
