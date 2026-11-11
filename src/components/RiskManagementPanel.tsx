import React from 'react';
import { BacktestMetrics, RiskManagementConfig, StopLossMode, TakeProfitMode, PositionSizeMode } from '../types/trading';
import { Shield, ShieldAlert, Sliders, CheckCircle2, AlertTriangle, Crosshair, DollarSign } from 'lucide-react';

interface RiskManagementPanelProps {
  risk: RiskManagementConfig;
  setRisk: (updater: (prev: RiskManagementConfig) => RiskManagementConfig) => void;
  metrics: BacktestMetrics;
  onApplyAndRerun: () => void;
}

export const RiskManagementPanel: React.FC<RiskManagementPanelProps> = ({
  risk,
  setRisk,
  metrics,
  onApplyAndRerun,
}) => {
  return (
    <div className="space-y-6">
      {/* Risk Architecture Header */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>全天候合约风控中台 (Risk Management Central Engine)</span>
            </div>
            <h2 className="text-xl font-bold text-white">自定义止损、止盈与智能仓位风控模块</h2>
            <p className="text-xs text-slate-400 mt-1">
              合约交易的本质是胜率与赔率的乘积管理。通过科学的 ATR 波动率止损、盈亏比锁利与风险价值仓位分配，杜绝单笔极端亏损与爆仓风险。
            </p>
          </div>

          <button
            onClick={onApplyAndRerun}
            className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>应用风控参数并重新回测</span>
          </button>
        </div>
      </div>

      {/* Grid of Risk Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Module 1: Stop-Loss (止损管理) */}
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>止损控制 (Stop-Loss)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                已触发 {metrics.slTriggersCount} 次
              </span>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-lg mb-4 text-xs font-medium">
              {(['ATR', 'PERCENT', 'NONE'] as StopLossMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRisk((r) => ({ ...r, slMode: mode }))}
                  className={`py-1.5 rounded transition-colors cursor-pointer text-center ${
                    risk.slMode === mode
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 'ATR' ? 'ATR 波动率' : mode === 'PERCENT' ? '固定百分比' : '不设静态'}
                </button>
              ))}
            </div>

            {/* Specific Parameters */}
            {risk.slMode === 'ATR' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">ATR 止损倍数:</span>
                  <span className="font-mono font-bold text-amber-400 tabular-nums">
                    {risk.slAtrMultiplier}x ATR
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="4.0"
                  step="0.1"
                  value={risk.slAtrMultiplier}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, slAtrMultiplier: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  推荐设置 1.8x ~ 2.5x ATR。随市场真实波动率自动调节，单边行情防扫损，震荡行情控亏损。
                </p>
              </div>
            )}

            {risk.slMode === 'PERCENT' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">固定止损比例:</span>
                  <span className="font-mono font-bold text-rose-400 tabular-nums">
                    {risk.slPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="8.0"
                  step="0.1"
                  value={risk.slPercent}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, slPercent: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-rose-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  按入场价固定百分比硬性止损，适合高频剥头皮或固定点数止损模型。
                </p>
              </div>
            )}

            {risk.slMode === 'NONE' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                ⚠️ 注意：关闭静态止损将完全依赖策略反向信号或交易所强平平仓。
              </div>
            )}
          </div>
        </div>

        {/* Module 2: Take-Profit & Trailing (止盈与移动止盈) */}
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-emerald-400" />
                <span>止盈控制 (Take-Profit)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                已触发 {metrics.tpTriggersCount} 次
              </span>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-lg mb-4 text-xs font-medium">
              {(['RISK_REWARD', 'PERCENT', 'NONE'] as TakeProfitMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRisk((r) => ({ ...r, tpMode: mode }))}
                  className={`py-1.5 rounded transition-colors cursor-pointer text-center ${
                    risk.tpMode === mode
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 'RISK_REWARD' ? '风险报酬比' : mode === 'PERCENT' ? '固定比例' : '顺势平仓'}
                </button>
              ))}
            </div>

            {risk.tpMode === 'RISK_REWARD' && (
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">盈亏比目标 (Risk:Reward):</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    1 : {risk.tpRiskRewardRatio}
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="4.0"
                  step="0.25"
                  value={risk.tpRiskRewardRatio}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, tpRiskRewardRatio: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>
            )}

            {risk.tpMode === 'PERCENT' && (
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">固定止盈比例:</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {risk.tpPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="15.0"
                  step="0.5"
                  value={risk.tpPercent}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, tpPercent: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>
            )}

            {/* Trailing Stop Toggle */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={risk.useTrailingStop}
                    onChange={(e) =>
                      setRisk((r) => ({ ...r, useTrailingStop: e.target.checked }))
                    }
                    className="rounded accent-amber-400 w-3.5 h-3.5"
                  />
                  <span>开启移动追踪止盈 (Trailing Stop)</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">
                  触发: {metrics.trailingTriggersCount} 次
                </span>
              </div>

              {risk.useTrailingStop && (
                <div className="space-y-1.5 pl-5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">极值回调平仓比例:</span>
                    <span className="font-mono font-bold text-amber-400 tabular-nums">
                      {risk.trailingCallbackPercent}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={risk.trailingCallbackPercent}
                    onChange={(e) =>
                      setRisk((r) => ({
                        ...r,
                        trailingCallbackPercent: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Module 3: Position Sizing (仓位大小与杠杆管理) */}
        <div className="bg-[#111726] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-sky-400" />
                <span>仓位与资金管理 (Position Sizing)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                杠杆 {risk.leverage}x
              </span>
            </div>

            {/* Sizing Mode */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-lg mb-4 text-xs font-medium">
              {(['EQUITY_PERCENT', 'FIXED_AMOUNT', 'RISK_PARITY_ATR'] as PositionSizeMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    onClick={() => setRisk((r) => ({ ...r, sizingMode: mode }))}
                    className={`py-1.5 rounded transition-colors cursor-pointer text-center text-[11px] ${
                      risk.sizingMode === mode
                        ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode === 'EQUITY_PERCENT'
                      ? '账户比例'
                      : mode === 'FIXED_AMOUNT'
                      ? '固定金额'
                      : 'ATR 风险平价'}
                  </button>
                )
              )}
            </div>

            {risk.sizingMode === 'EQUITY_PERCENT' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">单笔投入账户权益比例:</span>
                  <span className="font-mono font-bold text-sky-400 tabular-nums">
                    {risk.positionSizePercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={risk.positionSizePercent}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, positionSizePercent: parseInt(e.target.value, 10) }))
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">
                  复利模式：随账户净值增长动态放大仓位，亏损时自动缩小仓位。
                </p>
              </div>
            )}

            {risk.sizingMode === 'FIXED_AMOUNT' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">单笔固定名义本金:</span>
                  <span className="font-mono font-bold text-sky-400 tabular-nums">
                    ${risk.fixedAmountUSDT} USDT
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="10000"
                  step="500"
                  value={risk.fixedAmountUSDT}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, fixedAmountUSDT: parseInt(e.target.value, 10) }))
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>
            )}

            {risk.sizingMode === 'RISK_PARITY_ATR' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">单笔风险限额 (账户净值):</span>
                  <span className="font-mono font-bold text-amber-400 tabular-nums">
                    {risk.riskPerTradePercent}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.5"
                  value={risk.riskPerTradePercent}
                  onChange={(e) =>
                    setRisk((r) => ({ ...r, riskPerTradePercent: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-500">
                  机构级风险价值模型：每笔交易最多亏损本金 {risk.riskPerTradePercent}%，根据 ATR 止损距离自动反求合约持仓量。
                </p>
              </div>
            )}

            {/* Circuit Breaker */}
            <div className="pt-3 mt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">最大允许回撤熔断线:</span>
                <span className="font-mono font-bold text-rose-400 tabular-nums">
                  {risk.maxAllowedDrawdownPercent}%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                当账户整体回撤达到此阈值时，自动暂停新开仓位，防止极端行情黑天鹅穿仓。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Metrics Summary Card */}
      <div className="bg-[#111726] border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>风险管理实效审计 (Risk Management Impact on Returns)</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
            <div className="text-slate-400 text-[11px]">爆仓次数 (Liquidations)</div>
            <div className="text-base font-bold text-emerald-400 mt-1">
              {metrics.liquidationsCount} 次 (0% 穿仓)
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">杠杆强平线严格保护</div>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
            <div className="text-slate-400 text-[11px]">单笔最大盈利 / 亏损</div>
            <div className="text-base font-bold text-slate-200 mt-1">
              <span className="text-emerald-400">+{metrics.largestWinningTradePercent.toFixed(1)}%</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-rose-400">{metrics.largestLosingTradePercent.toFixed(1)}%</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">盈亏比截断效应显著</div>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
            <div className="text-slate-400 text-[11px]">最大连续亏损次数</div>
            <div className="text-base font-bold text-amber-400 mt-1">
              {metrics.maxConsecutiveLosses} 次
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">在可承受风险预算内</div>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
            <div className="text-slate-400 text-[11px]">累计手续费与滑点成本</div>
            <div className="text-base font-bold text-slate-300 mt-1">
              ${metrics.totalFeesPaid.toFixed(1)} USDT
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">币安 VIP0 费率模拟</div>
          </div>
        </div>
      </div>
    </div>
  );
};
