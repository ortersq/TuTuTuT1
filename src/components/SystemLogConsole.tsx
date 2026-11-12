import React, { useState } from 'react';
import { LogEntry } from '../server/botEngine';
import { Terminal, Search, Trash2, Filter, Download } from 'lucide-react';

interface SystemLogConsoleProps {
  logs: LogEntry[];
  onRefresh: () => void;
}

export const SystemLogConsole: React.FC<SystemLogConsoleProps> = ({ logs, onRefresh }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);

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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索币种或日志关键字..."
              className="pl-8 pr-3 py-1.5 bg-[#0b0e14] border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 w-48 font-mono"
            />
          </div>

          <button
            onClick={handleExportLogs}
            disabled={isExporting}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? '导出中...' : '📥 导出诊断日志包 (.json)'}</span>
          </button>

          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            刷新日志
          </button>
        </div>
      </div>

      {/* Log Terminal Window */}
      <div className="bg-[#07090e] border border-slate-800/90 rounded-xl p-4 font-mono text-xs h-[550px] overflow-y-auto space-y-2 select-text">
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
  );
};
