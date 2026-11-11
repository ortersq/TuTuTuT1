import React, { useState } from 'react';
import { BotStatus } from '../server/botEngine';
import { Shield, Key, Sliders, Check, Terminal } from 'lucide-react';

interface SettingsPanelProps {
  status: BotStatus | null;
  onUpdateConfig: (config: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
  }) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  status,
  onUpdateConfig,
}) => {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(
    status?.monitoredSymbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
  );
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(
    status?.monitoredTimeframes || ['5m', '15m', '30m']
  );
  const [leverage, setLeverage] = useState<number>(status?.leverage || 5);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const availableSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  const availableTimeframes = ['5m', '15m', '30m'];

  const toggleSymbol = (s: string) => {
    if (selectedSymbols.includes(s)) {
      if (selectedSymbols.length === 1) return; // keep at least 1
      setSelectedSymbols(selectedSymbols.filter((item) => item !== s));
    } else {
      setSelectedSymbols([...selectedSymbols, s]);
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

  const handleSave = () => {
    onUpdateConfig({
      monitoredSymbols: selectedSymbols,
      monitoredTimeframes: selectedTimeframes,
      leverage,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Binance API Key Connection Status & Setup Guide */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <span>币安合约 API 实盘密钥配置</span>
          </h3>
          <span
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              status?.hasBinanceKeys
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
            }`}
          >
            {status?.hasBinanceKeys ? '🟢 API 实盘下单已就绪' : '🔵 模拟调单与观测模式'}
          </span>
        </div>

        {status?.hasBinanceKeys ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 space-y-1.5">
            <div className="font-bold">✓ 币安 HMAC-SHA256 实盘 API 密钥已自动加载！</div>
            <div>
              系统将在 5m / 15m / 30m 形态触发时自动向币安合约接口发送市价开仓与平仓订单，请确保合约账户中具备充足 USDT 保证金。
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-slate-300">
            <p>
              当前未在服务器 `.env` 文件中填入币安 API 密钥，系统已自动启用<strong>模拟调单观测模式</strong>。在此模式下，系统会在 5m/15m/30m 信号触发时模拟调单开仓与平仓，并在右侧日志中记录真实的浮动盈亏，方便您跑一段时间观察盈亏情况！
            </p>

            <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-slate-200">
              <div className="text-amber-400 font-bold flex items-center gap-1.5 text-xs">
                <Terminal className="w-3.5 h-3.5" />
                <span>在服务器上配置币安实盘 API Key 方法 (1分钟完成):</span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-1">
                <div>1. SSH 登录 OpenCloudOS 服务器，编辑 `.env` 文件:</div>
                <div className="bg-slate-900 p-2 rounded text-amber-300 font-mono">
                  nano .env
                </div>
                <div>2. 写入您的币安合约 Key 与 Secret:</div>
                <div className="bg-slate-900 p-2 rounded text-emerald-300 font-mono">
                  BINANCE_API_KEY=your_actual_binance_api_key
                  <br />
                  BINANCE_API_SECRET=your_actual_binance_api_secret
                </div>
                <div>3. 重启 PM2 量化服务即可开启实盘:</div>
                <div className="bg-slate-900 p-2 rounded text-amber-300 font-mono">
                  pm2 restart binance-quant-bot
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Monitored Pairs & Timeframes Configuration */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>监控币种与周期策略配置</span>
          </h3>
        </div>

        {/* Monitored Pairs */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">监控主流币种 (多选):</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {availableSymbols.map((sym) => {
              const isChecked = selectedSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymbol(sym)}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    isChecked
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-[#0b0e14] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{sym}</span>
                  {isChecked && <Check className="w-4 h-4 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Monitored Timeframes */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">
            策略监控周期 (只专注 5m / 15m / 30m):
          </label>
          <div className="grid grid-cols-3 gap-3">
            {availableTimeframes.map((tf) => {
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
                  <span>{tf} K线周期</span>
                  {isChecked && <Check className="w-4 h-4 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Leverage Slider */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">基础杠杆倍数:</label>
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
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>1x (低杠杆)</span>
            <span>5x (推荐)</span>
            <span>10x</span>
            <span>20x (高风险)</span>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-3 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            保存监控配置
          </button>
          {savedSuccess && (
            <span className="text-xs text-emerald-400 font-medium">✓ 配置保存成功！已生效</span>
          )}
        </div>
      </div>
    </div>
  );
};
