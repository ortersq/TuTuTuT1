import React, { useState } from 'react';
import { BotStatus } from '../server/botEngine';
import { Key, Sliders, Check, Plus, Trash2, Shield, Lock, Terminal } from 'lucide-react';

interface SettingsPanelProps {
  status: BotStatus | null;
  onAddSymbol: (symbol: string) => Promise<void>;
  onRemoveSymbol: (symbol: string) => Promise<void>;
  onSaveCredentials: (apiKey: string, apiSecret: string) => Promise<void>;
  onUpdateConfig: (config: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
  }) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  status,
  onAddSymbol,
  onRemoveSymbol,
  onSaveCredentials,
  onUpdateConfig,
}) => {
  // Credentials state
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');
  const [isSavingKeys, setIsSavingKeys] = useState<boolean>(false);
  const [keySuccessMsg, setKeySuccessMsg] = useState<string | null>(null);

  // Symbol input state
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');
  const [isAddingSymbol, setIsAddingSymbol] = useState<boolean>(false);

  // Timeframe and leverage state
  const monitoredSymbols = status?.monitoredSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(
    status?.monitoredTimeframes || ['5m', '15m', '30m']
  );
  const [leverage, setLeverage] = useState<number>(status?.leverage || 5);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const presetSymbols = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'DOGEUSDT',
    'XRPUSDT',
    'AVAXUSDT',
    'PEPEUSDT',
    'NEARUSDT',
    'ADAUSDT',
    'SUIUSDT',
    'LINKUSDT',
  ];

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingKeys(true);
    setKeySuccessMsg(null);
    try {
      await onSaveCredentials(apiKey, apiSecret);
      setKeySuccessMsg('✓ 币安 API Key 已成功保存并同步应用！');
      setApiKey('');
      setApiSecret('');
    } catch {
      setKeySuccessMsg('❌ 保存 API Key 失败，请重试');
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleClearKeys = async () => {
    setIsSavingKeys(true);
    try {
      await onSaveCredentials('', '');
      setKeySuccessMsg('✓ API Key 已清除，切换为模拟盘观察模式');
    } catch {
      // ignore
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleAddSymbolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSymbolInput.trim()) return;
    setIsAddingSymbol(true);
    try {
      await onAddSymbol(customSymbolInput.trim());
      setCustomSymbolInput('');
    } finally {
      setIsAddingSymbol(false);
    }
  };

  const toggleTimeframe = (tf: string) => {
    if (selectedTimeframes.includes(tf)) {
      if (selectedTimeframes.length === 1) return;
      setSelectedTimeframes(selectedTimeframes.filter((item) => item !== tf));
    } else {
      setSelectedTimeframes([...selectedTimeframes, tf]);
    }
  };

  const handleSaveTimeframesAndLeverage = () => {
    onUpdateConfig({
      monitoredTimeframes: selectedTimeframes,
      leverage,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Dynamic Symbol Maintenance */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>动态监控币种维护 (支持任意币安合约)</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            当前实时监控 {monitoredSymbols.length} 个币种
          </span>
        </div>

        {/* Current Active Monitored Symbols Pills */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">当前已添加的监控币种:</label>
          <div className="flex flex-wrap gap-2">
            {monitoredSymbols.map((sym) => (
              <div
                key={sym}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b0e14] border border-amber-500/40 rounded-xl text-xs font-bold text-amber-300"
              >
                <span>{sym}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSymbol(sym)}
                  title="删除币种"
                  className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Add Symbol Form */}
        <form onSubmit={handleAddSymbolSubmit} className="flex items-center gap-2 pt-2">
          <input
            type="text"
            value={customSymbolInput}
            onChange={(e) => setCustomSymbolInput(e.target.value)}
            placeholder="输入币种名称 (例如: DOGEUSDT 或 PEPE)"
            className="flex-1 px-4 py-2 bg-[#0b0e14] border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono"
          />
          <button
            type="submit"
            disabled={isAddingSymbol || !customSymbolInput.trim()}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>添加币种</span>
          </button>
        </form>

        {/* Quick Add Presets */}
        <div className="space-y-1.5 pt-2">
          <label className="text-[11px] text-slate-400">一键快捷添加热门币种:</label>
          <div className="flex flex-wrap gap-1.5">
            {presetSymbols.map((sym) => {
              const isAdded = monitoredSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => {
                    if (isAdded) onRemoveSymbol(sym);
                    else onAddSymbol(sym);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    isAdded
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      : 'bg-[#0b0e14] text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {isAdded ? `✓ ${sym}` : `+ ${sym}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Front-End Binance API Key Management */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <span>前台添加与维护币安 API Key</span>
          </h3>
          <span
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              status?.hasBinanceKeys
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
            }`}
          >
            {status?.hasBinanceKeys ? '🟢 API 实盘下单已就绪' : '🔵 模拟观察模式'}
          </span>
        </div>

        <form onSubmit={handleSaveKeys} className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Binance API Key:</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={status?.hasBinanceKeys ? '●●●●●●●●●●●●●●●● (已配置，如需修改请输入新Key)' : '请输入币安 API Key'}
                className="w-full px-4 py-2.5 bg-[#0b0e14] border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Binance API Secret:</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder={status?.hasBinanceKeys ? '●●●●●●●●●●●●●●●● (已加密隐藏)' : '请输入币安 API Secret'}
                className="w-full px-4 py-2.5 bg-[#0b0e14] border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>
          </div>

          {keySuccessMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-medium">
              {keySuccessMsg}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSavingKeys || !apiKey.trim() || !apiSecret.trim()}
              className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm"
            >
              {isSavingKeys ? '保存中...' : '保存并应用 API 密钥'}
            </button>

            {status?.hasBinanceKeys && (
              <button
                type="button"
                onClick={handleClearKeys}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                清除 Key (切换至模拟盘)
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 3. Timeframes & Leverage Configuration */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span>监控周期与风控杠杆配置</span>
          </h3>
        </div>

        {/* Timeframes */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">监控周期:</label>
          <div className="grid grid-cols-3 gap-3">
            {['5m', '15m', '30m'].map((tf) => {
              const isChecked = selectedTimeframes.includes(tf);
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => toggleTimeframe(tf)}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    isChecked
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-[#0b0e14] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{tf} 周期</span>
                  {isChecked && <Check className="w-4 h-4 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Leverage Slider */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">杠杆倍数:</label>
            <span className="text-sm font-bold text-amber-400 font-mono">{leverage}x 杠杆</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value, 10))}
            className="w-full accent-amber-400 cursor-pointer"
          />
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={handleSaveTimeframesAndLeverage}
            className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            保存周期与杠杆设置
          </button>
          {savedSuccess && (
            <span className="text-xs text-emerald-400 font-medium">✓ 配置更新成功！</span>
          )}
        </div>
      </div>
    </div>
  );
};
