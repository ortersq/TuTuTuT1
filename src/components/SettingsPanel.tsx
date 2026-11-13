import React, { useState, useEffect } from 'react';
import { BotStatus } from '../server/botEngine';
import {
  Key,
  Sliders,
  Check,
  Plus,
  Trash2,
  Shield,
  Zap,
  TrendingUp,
  Target,
  Flame,
  Info,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Layers,
  Lock,
} from 'lucide-react';
import { LOCKED_TARGET_SYMBOLS } from '../utils/riskAndExecution';

interface SettingsPanelProps {
  status: BotStatus | null;
  onAddSymbol: (symbol: string) => Promise<void>;
  onRemoveSymbol: (symbol: string) => Promise<void>;
  onSaveCredentials: (apiKey: string, apiSecret: string) => Promise<void>;
  onUpdateConfig: (config: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
    riskConfig?: any;
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

  // Symbol management strictly locked to core 5 contracts

  // Timeframe and leverage state
  const monitoredSymbols = status?.monitoredSymbols || [...LOCKED_TARGET_SYMBOLS];
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(
    status?.monitoredTimeframes || ['5m', '15m', '30m']
  );
  const [leverage, setLeverage] = useState<number>(status?.leverage || 5);
  const [positionSizePercent, setPositionSizePercent] = useState<number>(
    status?.riskConfig?.positionSizePercent ?? 20
  );
  const [riskPerTradePercent, setRiskPerTradePercent] = useState<number>(
    status?.riskConfig?.riskPerTradePercent ?? 2.0
  );
  const [maxAllowedDrawdownPercent, setMaxAllowedDrawdownPercent] = useState<number>(
    status?.riskConfig?.maxAllowedDrawdownPercent ?? 20
  );
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Trailing stop loss configuration state
  const currentRisk = status?.riskConfig;
  const [useTrailingStop, setUseTrailingStop] = useState<boolean>(
    currentRisk?.useTrailingStop ?? true
  );
  const [trailingActivationPercent, setTrailingActivationPercent] = useState<number>(
    currentRisk?.trailingActivationPercent ?? 0.8
  );
  const [trailingCallbackPercent, setTrailingCallbackPercent] = useState<number>(
    currentRisk?.trailingCallbackPercent ?? 0.45
  );
  const [trailingStepPercent, setTrailingStepPercent] = useState<number>(
    currentRisk?.trailingStepPercent ?? 0.5
  );
  const [trailingActivationUsdt, setTrailingActivationUsdt] = useState<number>(
    currentRisk?.trailingActivationUsdt ?? 25
  );
  const [trailingSavedSuccess, setTrailingSavedSuccess] = useState<boolean>(false);

  // Portfolio Basket Take-Profit configuration state
  const currentBasket = currentRisk?.portfolioBasket;
  const [basketEnabled, setBasketEnabled] = useState<boolean>(currentBasket?.enabled ?? true);
  const [basketMinNetPct, setBasketMinNetPct] = useState<number>(
    currentBasket?.minNetProfitPercent ?? 1.5
  );
  const [basketMinNetUsdt, setBasketMinNetUsdt] = useState<number>(
    currentBasket?.minNetProfitUsdt ?? 1.0
  );
  const [basketTrailingRetracePct, setBasketTrailingRetracePct] = useState<number>(
    currentBasket?.trailingRetracePercent ?? 30
  );
  const [basketCooldownMins, setBasketCooldownMins] = useState<number>(
    currentBasket?.cooldownMinutes ?? 20
  );
  const [basketSavedSuccess, setBasketSavedSuccess] = useState<boolean>(false);

  // Sync state if status updates
  useEffect(() => {
    if (status?.leverage) {
      setLeverage(status.leverage);
    }
    if (status?.riskConfig) {
      setPositionSizePercent(status.riskConfig.positionSizePercent ?? 20);
      setRiskPerTradePercent(status.riskConfig.riskPerTradePercent ?? 2.0);
      setMaxAllowedDrawdownPercent(status.riskConfig.maxAllowedDrawdownPercent ?? 20);
      setUseTrailingStop(status.riskConfig.useTrailingStop ?? true);
      setTrailingActivationPercent(status.riskConfig.trailingActivationPercent ?? 0.8);
      setTrailingCallbackPercent(status.riskConfig.trailingCallbackPercent ?? 0.45);
      setTrailingStepPercent(status.riskConfig.trailingStepPercent ?? 0.5);
      setTrailingActivationUsdt(status.riskConfig.trailingActivationUsdt ?? 25);
      if (status.riskConfig.portfolioBasket) {
        setBasketEnabled(status.riskConfig.portfolioBasket.enabled ?? true);
        setBasketMinNetPct(status.riskConfig.portfolioBasket.minNetProfitPercent ?? 1.5);
        setBasketMinNetUsdt(status.riskConfig.portfolioBasket.minNetProfitUsdt ?? 1.0);
        setBasketTrailingRetracePct(status.riskConfig.portfolioBasket.trailingRetracePercent ?? 30);
        setBasketCooldownMins(status.riskConfig.portfolioBasket.cooldownMinutes ?? 20);
      }
    }
  }, [status?.riskConfig, status?.leverage]);

  const coreFiveContracts = [...LOCKED_TARGET_SYMBOLS];

  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingKeys(true);
    setKeySuccessMsg(null);
    try {
      await onSaveCredentials(apiKey, apiSecret);
      setKeySuccessMsg('✓ 币安 API Key 已保存！正在检验实时合约账户同步状态...');
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
      riskConfig: {
        positionSizePercent,
        riskPerTradePercent,
        maxAllowedDrawdownPercent,
      },
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Trailing stop loss presets
  const applyPreset = (preset: 'aggressive' | 'balanced' | 'swing') => {
    if (preset === 'aggressive') {
      setUseTrailingStop(true);
      setTrailingActivationPercent(0.5);
      setTrailingCallbackPercent(0.35);
      setTrailingStepPercent(0.3);
      setTrailingActivationUsdt(20);
    } else if (preset === 'balanced') {
      setUseTrailingStop(true);
      setTrailingActivationPercent(0.8);
      setTrailingCallbackPercent(0.45);
      setTrailingStepPercent(0.5);
      setTrailingActivationUsdt(25);
    } else if (preset === 'swing') {
      setUseTrailingStop(true);
      setTrailingActivationPercent(1.5);
      setTrailingCallbackPercent(0.8);
      setTrailingStepPercent(0.8);
      setTrailingActivationUsdt(50);
    }
  };

  const handleSaveTrailingStop = () => {
    onUpdateConfig({
      riskConfig: {
        useTrailingStop,
        trailingActivationPercent,
        trailingCallbackPercent,
        trailingStepPercent,
        trailingActivationUsdt,
      },
    });
    setTrailingSavedSuccess(true);
    setTimeout(() => setTrailingSavedSuccess(false), 3000);
  };

  const handleSavePortfolioBasket = () => {
    onUpdateConfig({
      riskConfig: {
        portfolioBasket: {
          enabled: basketEnabled,
          minNetProfitPercent: basketMinNetPct,
          minNetProfitUsdt: basketMinNetUsdt,
          takerFeeRate: 0.0005,
          slippageBufferRate: 0.0005,
          trailingRetracePercent: basketTrailingRetracePct,
          cooldownMinutes: basketCooldownMins,
        },
      },
    });
    setBasketSavedSuccess(true);
    setTimeout(() => setBasketSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Trailing Stop-Loss & Profit Reversion Protection (User Requested Feature) */}
      <div className="bg-[#111726] border border-amber-500/50 rounded-2xl p-5 space-y-5 shadow-xl shadow-amber-500/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>移动追踪止盈与防利润回吐风控 (Dynamic Trailing Stop-Loss)</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  彻底解决倒亏痛点
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                当价格顺势推演盈利时，动态追踪线上拉锁定收益；行情回撤时坚决自动平仓，严防 +$30~+$80 浮盈回吐为负！
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-2.5 bg-[#0b0e14] px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">移动追踪总开关:</span>
            <button
              type="button"
              onClick={() => setUseTrailingStop(!useTrailingStop)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                useTrailingStop ? 'bg-amber-400' : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  useTrailingStop ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <span
              className={`text-xs font-mono font-bold ${
                useTrailingStop ? 'text-amber-400' : 'text-slate-500'
              }`}
            >
              {useTrailingStop ? '已开启' : '已关闭'}
            </span>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>一键快速应用策略预设:</span>
            </span>
            <span className="text-[11px] text-slate-400">点击自动填充推荐参数</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => applyPreset('aggressive')}
              className="p-3 bg-[#0b0e14] hover:bg-slate-800/80 border border-rose-500/30 rounded-xl text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-rose-300 group-hover:text-rose-200 flex items-center justify-between">
                <span>🏎️ 敏捷防插针型 (激进)</span>
                <span className="text-[10px] font-mono text-slate-400">0.5% / 0.35%</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                浮盈超 0.5% 即刻激活保本，回撤 0.35% 坚决锁利，专治美盘极端插针回吐！
              </div>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('balanced')}
              className="p-3 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/50 rounded-xl text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200 flex items-center justify-between">
                <span>⚖️ 稳健推荐型 (标准)</span>
                <span className="text-[10px] font-mono text-amber-400 font-bold">0.8% / 0.45%</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-1">
                兼顾利润充分奔跑冲刺与回撤防守，浮盈达 +$25 稳稳锁定成本，官方推荐。
              </div>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('swing')}
              className="p-3 bg-[#0b0e14] hover:bg-slate-800/80 border border-cyan-500/30 rounded-xl text-left transition-all cursor-pointer group"
            >
              <div className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200 flex items-center justify-between">
                <span>🚀 单边宽幅波段型 (顺势)</span>
                <span className="text-[10px] font-mono text-slate-400">1.5% / 0.80%</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                容忍正常波幅洗盘，冲高 1.5% 后启动宽步长追踪，搏取 2.5x 以上超额盈亏比。
              </div>
            </button>
          </div>
        </div>

        {/* Detailed Slider Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          {/* Activation Threshold */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-amber-400" />
                <span>1. 追踪激活阈值 (Activation Threshold)</span>
              </label>
              <span className="text-sm font-bold text-amber-400 font-mono">
                {trailingActivationPercent.toFixed(2)}%
              </span>
            </div>

            <input
              type="range"
              min="0.2"
              max="3.0"
              step="0.05"
              value={trailingActivationPercent}
              onChange={(e) => setTrailingActivationPercent(parseFloat(e.target.value))}
              disabled={!useTrailingStop}
              className="w-full accent-amber-400 cursor-pointer disabled:opacity-50"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>高灵敏 0.2%</span>
              <span className="text-slate-500 font-mono">当前: +{trailingActivationPercent}% 激活</span>
              <span>宽容度 3.0%</span>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/60">
              💡 当行情顺势推动，未结收益率达到 <strong>+{trailingActivationPercent}%</strong> 时，移动追踪正式激活，系统<strong>瞬间将止损线移至成本保本价</strong>，消除亏损可能！
            </div>
          </div>

          {/* Step Distance / Callback Distance */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>2. 回撤回调步长 (Step Distance / Callback)</span>
              </label>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {trailingCallbackPercent.toFixed(2)}%
              </span>
            </div>

            <input
              type="range"
              min="0.15"
              max="2.0"
              step="0.05"
              value={trailingCallbackPercent}
              onChange={(e) => setTrailingCallbackPercent(parseFloat(e.target.value))}
              disabled={!useTrailingStop}
              className="w-full accent-emerald-400 cursor-pointer disabled:opacity-50"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>极紧密 0.15%</span>
              <span className="text-slate-500 font-mono">当前: 回调 {trailingCallbackPercent}% 平仓</span>
              <span>宽松 2.0%</span>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/60">
              💡 价格创出新高后，若发生回落并触碰到 <strong>-{trailingCallbackPercent}%</strong> 动态防守线，系统立即市价平仓锁定净利润，<strong>杜绝利润回吐</strong>！
            </div>
          </div>
        </div>

        {/* Secondary USDT Safety Lock */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>资金维度激活点 (USDT Profit Trigger)</span>
              <span className="text-sm font-bold font-mono text-cyan-400">${trailingActivationUsdt} USDT</span>
            </div>
            <input
              type="range"
              min="10"
              max="80"
              step="5"
              value={trailingActivationUsdt}
              onChange={(e) => setTrailingActivationUsdt(parseInt(e.target.value, 10))}
              disabled={!useTrailingStop}
              className="w-full accent-cyan-400 cursor-pointer disabled:opacity-50"
            />
            <div className="text-[11px] text-slate-400">
              无论涨幅多少，单笔持仓浮盈只要触及 <strong>${trailingActivationUsdt} USDT</strong>，强制触发保本防线。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>动态阶梯步进 (Rachet Step Distance)</span>
              <span className="text-sm font-bold font-mono text-amber-400">{trailingStepPercent.toFixed(2)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              value={trailingStepPercent}
              onChange={(e) => setTrailingStepPercent(parseFloat(e.target.value))}
              disabled={!useTrailingStop}
              className="w-full accent-amber-400 cursor-pointer disabled:opacity-50"
            />
            <div className="text-[11px] text-slate-400">
              行情每进一步推进 <strong>{trailingStepPercent}%</strong>，防守线相应上提一级，只进不退。
            </div>
          </div>
        </div>

        {/* Visual Live Demonstration Card */}
        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs space-y-1.5">
          <div className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>当前参数实盘推演效果举例 (基于 BTC 当前 $68,000 做多开仓):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono pt-1 text-slate-300">
            <div className="bg-[#0b0e14] p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">1. 激活阶段</span>
              价格达到 <strong className="text-amber-400">${(68000 * (1 + trailingActivationPercent / 100)).toFixed(1)}</strong> (+{trailingActivationPercent}%)，止损立即提到成本 $68,102，实现 0 亏损风险。
            </div>
            <div className="bg-[#0b0e14] p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">2. 冲高追踪</span>
              若冲至 <strong className="text-emerald-400">$69,200</strong>，动态保护线自动提至 <strong className="text-emerald-300">${(69200 * (1 - trailingCallbackPercent / 100)).toFixed(1)}</strong>。
            </div>
            <div className="bg-[#0b0e14] p-2 rounded border border-slate-800">
              <span className="text-slate-500 block">3. 自动锁利</span>
              行情插针回踩触及保护线即刻平仓，<strong className="text-emerald-400">稳稳锁定 +$70 USDT 利润</strong>，告别倒亏！
            </div>
          </div>
        </div>

        {/* Save Trailing Stop Button */}
        <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveTrailingStop}
            className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>保存并应用移动追踪止盈参数</span>
          </button>
          {trailingSavedSuccess && (
            <span className="text-xs text-emerald-400 font-medium">
              ✓ 移动追踪止损参数已即刻同步至策略引擎！
            </span>
          )}
        </div>
      </div>

      {/* 1.5 Portfolio Basket Net Take-Profit Configuration */}
      <div className="bg-[#111726] border border-emerald-500/40 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                组合篮子净利智能全平设置 (Portfolio Basket Take-Profit)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                多笔持仓（如盈利单+亏损单混持）自动扣除双向吃单手续费 (0.10%) 与市价滑点缓冲 (0.05%) 后，结合震荡/趋势行情自动决定全平或顺风追踪。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-[#0b0e14] px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">自动篮子止盈:</span>
            <button
              type="button"
              onClick={() => setBasketEnabled(!basketEnabled)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                basketEnabled ? 'bg-emerald-400' : 'bg-slate-700'
              }`}
            >
              <div
                className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  basketEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <span
              className={`text-xs font-mono font-bold ${
                basketEnabled ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {basketEnabled ? '已开启' : '已关闭'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-300">
              <span>扣费后最低净收益率门槛 (占总保证金 %)</span>
              <span className="text-emerald-400 font-mono font-bold">{basketMinNetPct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="8.0"
              step="0.5"
              value={basketMinNetPct}
              onChange={(e) => setBasketMinNetPct(parseFloat(e.target.value))}
              disabled={!basketEnabled}
              className="w-full accent-emerald-400 cursor-pointer disabled:opacity-50"
            />
            <div className="text-[11px] text-slate-400">
              只有全平并扣除开平双边手续费和滑点后，净收益 ≥ 总保证金 <strong>{basketMinNetPct.toFixed(1)}%</strong> 才触发。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-300">
              <span>扣费后最低绝对净利门槛 (USDT)</span>
              <span className="text-emerald-400 font-mono font-bold">${basketMinNetUsdt.toFixed(1)} USDT</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="30"
              step="0.5"
              value={basketMinNetUsdt}
              onChange={(e) => setBasketMinNetUsdt(parseFloat(e.target.value))}
              disabled={!basketEnabled}
              className="w-full accent-emerald-400 cursor-pointer disabled:opacity-50"
            />
            <div className="text-[11px] text-slate-400">
              小资金保底净入袋线：实得净利需同时超过 <strong>${basketMinNetUsdt.toFixed(1)} USDT</strong>，避免几毛钱频繁进出。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-300">
              <span>单边趋势篮子追踪回撤平仓比例</span>
              <span className="text-amber-400 font-mono font-bold">{basketTrailingRetracePct}%</span>
            </div>
            <input
              type="range"
              min="15"
              max="50"
              step="5"
              value={basketTrailingRetracePct}
              onChange={(e) => setBasketTrailingRetracePct(parseInt(e.target.value, 10))}
              disabled={!basketEnabled}
              className="w-full accent-amber-400 cursor-pointer disabled:opacity-50"
            />
            <div className="text-[11px] text-slate-400">
              顺势趋势单暂不全平让利润奔跑；若总净利从峰值回吐达 <strong>{basketTrailingRetracePct}%</strong>，立即整体全平锁利。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-300">
              <span>全平后防原地复开冷却时长</span>
              <span className="text-cyan-400 font-mono font-bold">{basketCooldownMins} 分钟</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={basketCooldownMins}
              onChange={(e) => setBasketCooldownMins(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="text-[11px] text-slate-400">
              全平后锁定 <strong>{basketCooldownMins} 分钟</strong>不再开同周期新仓，防止下一根 10 秒轮询原地反复交手续费。
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSavePortfolioBasket}
            className="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>保存并应用组合篮子全平策略</span>
          </button>
          {basketSavedSuccess && (
            <span className="text-xs text-emerald-400 font-medium">
              ✓ 组合篮子净利止盈参数已实时生效！
            </span>
          )}
        </div>
      </div>

      {/* 2. Locked Core 5-Contract Maintenance */}
      <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>实盘锁定核心监控合约 (BTC / ETH / XAU / NVDA / CL)</span>
          </h3>
          <span className="text-xs text-amber-300 font-mono bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
            白名单锁定 {monitoredSymbols.length}/5 合约
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          为确保实盘资金安全与相关性收敛控制，后端引擎与接口已强制锁定仅允许监控与交易核心 5 个标的目标合约，严禁非白名单合约误触发开单。
        </p>

        {/* Current Active Monitored Symbols Pills */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">当前激活的核心监控合约:</label>
          <div className="flex flex-wrap gap-2">
            {monitoredSymbols.map((sym) => (
              <div
                key={sym}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b0e14] border border-amber-500/40 rounded-xl text-xs font-bold text-amber-300"
              >
                <span>{sym}</span>
                {monitoredSymbols.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveSymbol(sym)}
                    title="暂停监控该合约"
                    className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Locked Core Whitelist Toggle & Restore */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[11px] text-slate-400">核心 5 合约开关白名单:</label>
            <button
              type="button"
              onClick={() => onUpdateConfig({ monitoredSymbols: coreFiveContracts })}
              className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-500/40 cursor-pointer"
            >
              ⚡ 一键锁定并激活全部 5 个目标合约
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {coreFiveContracts.map((sym) => {
              const isAdded = monitoredSymbols.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => {
                    if (isAdded) {
                      if (monitoredSymbols.length > 1) onRemoveSymbol(sym);
                    } else {
                      onAddSymbol(sym);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
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

      {/* 3. Front-End Binance API Key Management */}
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

          {status?.hasBinanceKeys && status?.liveSyncInfo && (
            <div
              className={`p-3 rounded-xl text-xs border flex items-center gap-2 ${
                status.liveSyncInfo.syncOk
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {status.liveSyncInfo.syncOk
                  ? `✅ 交易所实盘连通验证成功！钱包余额 $${status.liveSyncInfo.walletBalance.toFixed(2)} | 可用保证金 $${status.liveSyncInfo.availableBalance.toFixed(2)} | 净值 $${status.liveSyncInfo.marginBalance.toFixed(2)}`
                  : `⚠️ 实盘 API 校验提示: ${status.liveSyncInfo.errorMessage}`}
              </span>
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

      {/* 4. Timeframes & Leverage Configuration */}
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

        {/* Leverage & Live Total-Equity Risk Allocation Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">最大杠杆硬上限 (只降不升):</label>
              <span className="text-sm font-bold text-amber-400 font-mono">{leverage}x</span>
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
            <div className="text-[11px] text-slate-400">
              高波动/高风险期算法只会向下减仓降杠杆，绝不突破 <strong>{leverage}x</strong> 上限。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">单笔基础资金占用比 (占总净值):</label>
              <span className="text-sm font-bold text-cyan-400 font-mono">{positionSizePercent}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={positionSizePercent}
              onChange={(e) => setPositionSizePercent(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="text-[11px] text-slate-400">
              基于实盘总资产动态分配保证金，全账户保证金总占用硬顶 78%，保留 ≥22% 安全缓冲。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">单笔止损最大亏损限额 (占总净值):</label>
              <span className="text-sm font-bold text-emerald-400 font-mono">{riskPerTradePercent.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.2"
              value={riskPerTradePercent}
              onChange={(e) => setRiskPerTradePercent(parseFloat(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="text-[11px] text-slate-400">
              结合实时止损距离硬限制开仓手数，确保打损最大亏损不超过总资产的 <strong>{riskPerTradePercent.toFixed(1)}%</strong>。
            </div>
          </div>

          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">账户最大回撤锁仓红线 (Kill-Switch):</label>
              <span className="text-sm font-bold text-rose-400 font-mono">{maxAllowedDrawdownPercent}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="40"
              step="1"
              value={maxAllowedDrawdownPercent}
              onChange={(e) => setMaxAllowedDrawdownPercent(parseInt(e.target.value, 10))}
              className="w-full accent-rose-400 cursor-pointer"
            />
            <div className="text-[11px] text-slate-400">
              净值回撤触及 <strong>{maxAllowedDrawdownPercent}%</strong> 自动锁死停止开新仓并推送紧急预警。
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveTimeframesAndLeverage}
            className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            保存周期、杠杆与风控红线设置
          </button>
          {savedSuccess && (
            <span className="text-xs text-emerald-400 font-medium">✓ 实盘周期与仓位风控配置已生效！</span>
          )}
        </div>
      </div>
    </div>
  );
};
