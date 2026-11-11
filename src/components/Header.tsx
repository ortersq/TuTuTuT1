import React from 'react';
import { Activity, Play, RefreshCw, Shield, ListOrdered, Sparkles } from 'lucide-react';

export type ActiveTab = 'overview' | 'patterns' | 'autobot' | 'risk' | 'trades';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isLoading: boolean;
  onRunBacktest: () => void;
  symbol: string;
  interval: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isLoading,
  onRunBacktest,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0e131f] border-b border-slate-800 shrink-0">
      {/* Zone 1: Brand wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
          ⚡
        </div>
        <a href="/" className="text-base font-bold tracking-tight text-white whitespace-nowrap">
          币安合约 · K线图形形态量化系统
        </a>
      </div>

      {/* Zone 2: Focused navigation */}
      <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'overview'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>历史形态回测看板</span>
        </button>

        <button
          onClick={() => setActiveTab('patterns')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'patterns'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'text-amber-400/90 hover:text-amber-300 font-medium'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>图形形态库 & 胜率自优</span>
        </button>

        <button
          onClick={() => setActiveTab('autobot')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'autobot'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-emerald-400/90 hover:text-emerald-300 font-medium'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>币安自动开仓机器人</span>
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'risk'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>止盈止损与仓位风控</span>
        </button>

        <button
          onClick={() => setActiveTab('trades')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap py-1 cursor-pointer ${
            activeTab === 'trades'
              ? 'text-amber-400 font-semibold border-b-2 border-amber-400'
              : 'hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>形态开平仓明细</span>
        </button>
      </nav>

      {/* Zone 3: Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onRunBacktest}
          disabled={isLoading}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>拉取中...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>拉取币安真实数据回测</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
