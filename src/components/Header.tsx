import React from 'react';
import { Activity, Shield, ListOrdered, Play, Pause, Key } from 'lucide-react';

export type ActiveTab = 'monitor' | 'positions' | 'settings';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isRunning: boolean;
  hasBinanceKeys: boolean;
  onToggleBot: () => void;
  activePositionsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isRunning,
  hasBinanceKeys,
  onToggleBot,
  activePositionsCount,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0e131f] border-b border-slate-800 shrink-0">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
          ⚡
        </div>
        <div>
          <a href="/" className="text-base font-bold tracking-tight text-white whitespace-nowrap block">
            币安合约 · 多币种 5m/15m/30m 自动量化
          </a>
          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
            <span>BTC · ETH · SOL · BNB</span>
            <span>·</span>
            {hasBinanceKeys ? (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <Key className="w-3 h-3" />
                🟢 币安 API 已连接 (实盘模式)
              </span>
            ) : (
              <span className="text-sky-400 font-medium">
                🔵 模拟观察模式 (无 API Key，记录模拟损益)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2: Navigation Tabs */}
      <nav className="flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'monitor'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>多币种 5m/15m/30m 监控中心</span>
        </button>

        <button
          onClick={() => setActiveTab('positions')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'positions'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>持仓与量化日志</span>
          {activePositionsCount > 0 && (
            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 font-bold rounded-full text-[10px]">
              {activePositionsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'settings'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>监控与 API 配置</span>
        </button>
      </nav>

      {/* Zone 3: Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleBot}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer ${
            isRunning
              ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40'
              : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>⏸ 暂停量化监控</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>▶ 启动多币种自动监控</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
