/**
 * Autonomous Live / Paper Trading Bot Engine for Binance Futures
 * Fully handles:
 * - 24/7 background loop
 * - Auto strategy optimization (dynamically selects champion strategy)
 * - Auto order entry (Long / Short)
 * - Auto position exit (TP, SL, Trailing stop, Signal reversal)
 * - Auto position sizing & risk management (margin limits, circuit breaker)
 */

import {
  BacktestConfig,
  ExitReason,
  Kline,
  PositionSide,
  RiskManagementConfig,
  StrategyKey,
  StrategyParams,
} from '../types/trading';
import { fetchBinanceKlines, runMultiStrategyBenchmark } from '../utils/binanceApi';
import { calculateATR } from '../utils/indicators';
import { DEFAULT_STRATEGY_PARAMS, generateAllSignals, STRATEGY_CATALOG } from '../utils/strategies';

export interface ActivePosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  trailingPeakPrice: number;
  liquidationPrice: number;
  strategyUsed: StrategyKey;
}

export interface BotTradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  netPnl: number;
  pnlPercent: number;
  exitReason: ExitReason;
  strategyUsed: StrategyKey;
}

export interface BotStatus {
  isRunning: boolean;
  mode: 'PAPER' | 'LIVE';
  symbol: string;
  interval: string;
  autoSelectChampion: boolean;
  currentStrategy: StrategyKey;
  championStrategy: StrategyKey;
  championStrategyName: string;
  balance: number;
  equity: number;
  peakEquity: number;
  drawdownPercent: number;
  leverage: number;
  activePosition: ActivePosition | null;
  closedTrades: BotTradeRecord[];
  logs: { time: string; level: 'info' | 'warn' | 'success' | 'error'; message: string }[];
  marketRegime: 'TREND' | 'RANGE';
  lastUpdateTime: number;
  riskConfig: RiskManagementConfig;
}

class TradingEngine {
  private isRunning: boolean = false;
  private mode: 'PAPER' | 'LIVE' = 'PAPER';
  private symbol: string = 'BTCUSDT';
  private interval: string = '1h';
  private autoSelectChampion: boolean = true;
  private currentStrategy: StrategyKey = 'ensemble';
  private championStrategy: StrategyKey = 'supertrend';
  private championStrategyName: string = 'SuperTrend + EMA200 动态趋势追踪策略';

  private balance: number = 10000;
  private equity: number = 10000;
  private peakEquity: number = 10000;
  private leverage: number = 5;

  private activePosition: ActivePosition | null = null;
  private closedTrades: BotTradeRecord[] = [];
  private logs: { time: string; level: 'info' | 'warn' | 'success' | 'error'; message: string }[] = [];
  private marketRegime: 'TREND' | 'RANGE' = 'TREND';
  private lastUpdateTime: number = Date.now();

  private riskConfig: RiskManagementConfig = {
    slMode: 'ATR',
    slPercent: 2.0,
    slAtrMultiplier: 2.0,
    tpMode: 'RISK_REWARD',
    tpPercent: 4.0,
    tpRiskRewardRatio: 2.0,
    useTrailingStop: true,
    trailingCallbackPercent: 1.2,
    sizingMode: 'EQUITY_PERCENT',
    positionSizePercent: 25,
    fixedAmountUSDT: 2000,
    riskPerTradePercent: 1.5,
    leverage: 5,
    maxAllowedDrawdownPercent: 25,
  };

  private params: StrategyParams = DEFAULT_STRATEGY_PARAMS;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor() {
    this.addLog('info', '量化自动化交易引擎初始化完成 (准备就绪)');
  }

  public getStatus(): BotStatus {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      symbol: this.symbol,
      interval: this.interval,
      autoSelectChampion: this.autoSelectChampion,
      currentStrategy: this.currentStrategy,
      championStrategy: this.championStrategy,
      championStrategyName: this.championStrategyName,
      balance: this.balance,
      equity: this.equity,
      peakEquity: this.peakEquity,
      drawdownPercent:
        this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0,
      leverage: this.leverage,
      activePosition: this.activePosition,
      closedTrades: this.closedTrades.slice(-50), // Last 50 trades
      logs: this.logs.slice(-60), // Last 60 logs
      marketRegime: this.marketRegime,
      lastUpdateTime: this.lastUpdateTime,
      riskConfig: this.riskConfig,
    };
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.addLog('success', `▶ 启动自动化实盘机器人: ${this.symbol} (${this.interval} 周期，杠杆 ${this.leverage}x)`);
    // Run immediately then schedule loop every 12 seconds
    this.executeCycle();
    this.timer = setInterval(() => this.executeCycle(), 12000);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.addLog('warn', '⏸ 自动化交易机器人已暂停运行');
  }

  public updateConfig(newConfig: {
    symbol?: string;
    interval?: string;
    leverage?: number;
    mode?: 'PAPER' | 'LIVE';
    autoSelectChampion?: boolean;
    currentStrategy?: StrategyKey;
    riskConfig?: Partial<RiskManagementConfig>;
  }) {
    if (newConfig.symbol) this.symbol = newConfig.symbol.toUpperCase();
    if (newConfig.interval) this.interval = newConfig.interval;
    if (newConfig.leverage) {
      this.leverage = newConfig.leverage;
      this.riskConfig.leverage = newConfig.leverage;
    }
    if (newConfig.mode) this.mode = newConfig.mode;
    if (newConfig.autoSelectChampion !== undefined) this.autoSelectChampion = newConfig.autoSelectChampion;
    if (newConfig.currentStrategy) this.currentStrategy = newConfig.currentStrategy;
    if (newConfig.riskConfig) {
      this.riskConfig = { ...this.riskConfig, ...newConfig.riskConfig };
    }
    this.addLog('info', `配置已更新: ${this.symbol} | ${this.interval} | 杠杆 ${this.leverage}x | 自动最优: ${this.autoSelectChampion ? '开启' : '关闭'}`);
  }

  public emergencyClosePosition(reason: ExitReason = 'END_OF_DATA') {
    if (!this.activePosition) return;
    const pos = this.activePosition;
    this.closePosition(pos.currentPrice, reason);
    this.addLog('warn', `⚠️ 手动/紧急平仓成功: ${pos.side} @ ${pos.currentPrice} USDT`);
  }

  private addLog(level: 'info' | 'warn' | 'success' | 'error', message: string) {
    const timeStr = new Date().toLocaleTimeString();
    this.logs.push({ time: timeStr, level, message });
    if (this.logs.length > 200) this.logs.shift();
  }

  /**
   * Main autonomous trading loop
   */
  private async executeCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastUpdateTime = Date.now();

    try {
      // 1. Fetch live historical K-lines from Binance official API
      const fetchResult = await fetchBinanceKlines({
        symbol: this.symbol,
        interval: this.interval,
        limit: 300,
      });

      const klines = fetchResult.klines;
      if (klines.length < 30) {
        this.addLog('warn', 'K线数量不足，等待下个周期获取数据...');
        return;
      }

      const latestBar = klines[klines.length - 1];
      const prevBar = klines[klines.length - 2];
      const currentPrice = latestBar.close;
      const currentAtr = calculateATR(klines, 14)[klines.length - 1] ?? (latestBar.high - latestBar.low);

      // 2. Auto Strategy Optimization: Benchmark 6 strategies to select current champion
      if (this.autoSelectChampion) {
        const dummyConfig: BacktestConfig = {
          symbol: this.symbol,
          interval: this.interval,
          initialCapital: 10000,
          risk: this.riskConfig,
          makerFeeRate: 0.0002,
          takerFeeRate: 0.0005,
          slippageRate: 0.0005,
          strategy: 'ensemble',
          params: this.params,
        };

        const bench = runMultiStrategyBenchmark(klines, dummyConfig);
        const best = bench.results[0];
        if (best.key !== this.championStrategy) {
          this.championStrategy = best.key;
          this.championStrategyName = best.name;
          this.addLog(
            'success',
            `👑 市场状态变化，系统自动切换为当前最优策略: 【${best.name}】(实盘回测胜率: ${best.metrics.winRatePercent.toFixed(1)}%, 盈亏比: ${best.metrics.profitFactor.toFixed(2)})`
          );
        }
      }

      const activeStrategyKey = this.autoSelectChampion ? this.championStrategy : this.currentStrategy;

      // 3. Update active position mark price and check Stop Loss / Take Profit / Trailing
      if (this.activePosition) {
        const pos = this.activePosition;
        pos.currentPrice = currentPrice;

        // Unrealized PnL
        if (pos.side === 'LONG') {
          pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
        } else {
          pos.unrealizedPnl = (pos.entryPrice - currentPrice) * pos.quantity;
        }
        pos.unrealizedPnlPercent = (pos.unrealizedPnl / pos.marginUsed) * 100;

        // Trailing Peak Price update
        if (pos.side === 'LONG' && currentPrice > pos.trailingPeakPrice) {
          pos.trailingPeakPrice = currentPrice;
        } else if (pos.side === 'SHORT' && currentPrice < pos.trailingPeakPrice) {
          pos.trailingPeakPrice = currentPrice;
        }

        // Check Liquidation Protection
        if (pos.side === 'LONG' && currentPrice <= pos.liquidationPrice) {
          this.addLog('error', `🚨 触发多单强平预警保护，系统已强制止损防穿仓！`);
          this.closePosition(currentPrice, 'LIQUIDATION');
          return;
        } else if (pos.side === 'SHORT' && currentPrice >= pos.liquidationPrice) {
          this.addLog('error', `🚨 触发空单强平预警保护，系统已强制止损防穿仓！`);
          this.closePosition(currentPrice, 'LIQUIDATION');
          return;
        }

        // Check Stop Loss
        if (pos.stopLossPrice !== null) {
          if (pos.side === 'LONG' && currentPrice <= pos.stopLossPrice) {
            this.addLog('warn', `🛑 触发多头止损点: ${currentPrice} <= ${pos.stopLossPrice.toFixed(2)} USDT`);
            this.closePosition(currentPrice, 'STOP_LOSS');
            return;
          } else if (pos.side === 'SHORT' && currentPrice >= pos.stopLossPrice) {
            this.addLog('warn', `🛑 触发空头止损点: ${currentPrice} >= ${pos.stopLossPrice.toFixed(2)} USDT`);
            this.closePosition(currentPrice, 'STOP_LOSS');
            return;
          }
        }

        // Check Take Profit
        if (pos.takeProfitPrice !== null) {
          if (pos.side === 'LONG' && currentPrice >= pos.takeProfitPrice) {
            this.addLog('success', `🎯 触发多头目标止盈: ${currentPrice} >= ${pos.takeProfitPrice.toFixed(2)} USDT`);
            this.closePosition(currentPrice, 'TAKE_PROFIT');
            return;
          } else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfitPrice) {
            this.addLog('success', `🎯 触发空头目标止盈: ${currentPrice} <= ${pos.takeProfitPrice.toFixed(2)} USDT`);
            this.closePosition(currentPrice, 'TAKE_PROFIT');
            return;
          }
        }

        // Check Trailing Stop
        if (this.riskConfig.useTrailingStop && this.riskConfig.trailingCallbackPercent > 0) {
          const cb = this.riskConfig.trailingCallbackPercent / 100;
          if (pos.side === 'LONG') {
            const gain = (pos.trailingPeakPrice - pos.entryPrice) / pos.entryPrice;
            if (gain >= cb) {
              const stopLine = pos.trailingPeakPrice * (1 - cb);
              if (currentPrice <= stopLine) {
                this.addLog('success', `✦ 触发移动追踪止盈: 价格自峰值回撤达到 ${this.riskConfig.trailingCallbackPercent}%，锁定利润出局！`);
                this.closePosition(currentPrice, 'TRAILING_STOP');
                return;
              }
            }
          } else {
            const gain = (pos.entryPrice - pos.trailingPeakPrice) / pos.entryPrice;
            if (gain >= cb) {
              const stopLine = pos.trailingPeakPrice * (1 + cb);
              if (currentPrice >= stopLine) {
                this.addLog('success', `✦ 触发移动追踪止盈: 空头自低点反弹达到 ${this.riskConfig.trailingCallbackPercent}%，锁定利润出局！`);
                this.closePosition(currentPrice, 'TRAILING_STOP');
                return;
              }
            }
          }
        }
      }

      // Update total equity
      const unrealizedTotal = this.activePosition ? this.activePosition.unrealizedPnl : 0;
      this.equity = Math.max(0, this.balance + unrealizedTotal);
      if (this.equity > this.peakEquity) this.peakEquity = this.equity;

      // Circuit Breaker check
      const currentDD =
        this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0;
      if (
        this.riskConfig.maxAllowedDrawdownPercent > 0 &&
        currentDD >= this.riskConfig.maxAllowedDrawdownPercent
      ) {
        this.addLog('error', `🛑 触发账户整体回撤熔断线 (${currentDD.toFixed(1)}% >= ${this.riskConfig.maxAllowedDrawdownPercent}%)，自动暂停新开单！`);
        return;
      }

      // 4. Calculate Signals from selected strategy
      const allSignals = generateAllSignals(klines, this.params);
      let strategySignals = allSignals.ensemble;
      if (activeStrategyKey === 'pattern_price_action') strategySignals = allSignals.patternPriceAction;
      else if (activeStrategyKey === 'supertrend') strategySignals = allSignals.supertrend;
      else if (activeStrategyKey === 'dual_thrust') strategySignals = allSignals.dualThrust;
      else if (activeStrategyKey === 'bollinger_rsi') strategySignals = allSignals.bollingerRsi;
      else if (activeStrategyKey === 'macd_vpa') strategySignals = allSignals.macdVpa;
      else if (activeStrategyKey === 'grid_atr') strategySignals = allSignals.gridAtr;

      const latestSig = strategySignals[strategySignals.length - 1];
      this.marketRegime = allSignals.regimes[allSignals.regimes.length - 1];

      // 5. Signal Reversal Exit
      if (this.activePosition) {
        if (
          (this.activePosition.side === 'LONG' && latestSig === -1) ||
          (this.activePosition.side === 'SHORT' && latestSig === 1)
        ) {
          this.addLog('info', `🔄 策略出现反向开单信号，先平仓当前 ${this.activePosition.side} 头寸`);
          this.closePosition(currentPrice, 'SIGNAL_REVERSAL');
        }
      }

      // 6. Auto Open Position on Signal
      if (!this.activePosition && latestSig !== 0 && this.balance > 50) {
        const side: 'LONG' | 'SHORT' = latestSig === 1 ? 'LONG' : 'SHORT';
        const leverage = this.leverage;

        // Auto Position Sizing
        let allocatedMargin = 0;
        let plannedStopDistance = 0;

        // SL price calculation
        let stopLossPrice: number | null = null;
        if (this.riskConfig.slMode === 'PERCENT' && this.riskConfig.slPercent > 0) {
          plannedStopDistance = currentPrice * (this.riskConfig.slPercent / 100);
          stopLossPrice = side === 'LONG' ? currentPrice - plannedStopDistance : currentPrice + plannedStopDistance;
        } else if (this.riskConfig.slMode === 'ATR' && this.riskConfig.slAtrMultiplier > 0) {
          plannedStopDistance = currentAtr * this.riskConfig.slAtrMultiplier;
          stopLossPrice = side === 'LONG' ? currentPrice - plannedStopDistance : currentPrice + plannedStopDistance;
        }

        // Margin calculation
        if (this.riskConfig.sizingMode === 'FIXED_AMOUNT') {
          const targetNotional = Math.min(this.riskConfig.fixedAmountUSDT, this.balance * leverage);
          allocatedMargin = targetNotional / leverage;
        } else if (this.riskConfig.sizingMode === 'RISK_PARITY_ATR') {
          const dollarRisk = this.balance * (this.riskConfig.riskPerTradePercent / 100);
          const dist = plannedStopDistance > 0 ? plannedStopDistance : currentAtr * 2;
          const targetQty = dist > 0 ? dollarRisk / dist : 0;
          allocatedMargin = Math.min(this.balance * 0.9, (targetQty * currentPrice) / leverage);
        } else {
          // EQUITY_PERCENT
          const pct = Math.min(100, Math.max(5, this.riskConfig.positionSizePercent));
          allocatedMargin = this.balance * (pct / 100);
        }

        const positionNotional = allocatedMargin * leverage;
        const quantity = positionNotional / currentPrice;
        const entryFee = positionNotional * 0.0005; // 0.05% taker fee

        if (this.balance >= allocatedMargin + entryFee && quantity > 0) {
          this.balance -= allocatedMargin + entryFee;

          // TP price calculation
          let takeProfitPrice: number | null = null;
          if (this.riskConfig.tpMode === 'PERCENT' && this.riskConfig.tpPercent > 0) {
            takeProfitPrice =
              side === 'LONG'
                ? currentPrice * (1 + this.riskConfig.tpPercent / 100)
                : currentPrice * (1 - this.riskConfig.tpPercent / 100);
          } else if (
            this.riskConfig.tpMode === 'RISK_REWARD' &&
            this.riskConfig.tpRiskRewardRatio > 0 &&
            plannedStopDistance > 0
          ) {
            const rewardDist = plannedStopDistance * this.riskConfig.tpRiskRewardRatio;
            takeProfitPrice = side === 'LONG' ? currentPrice + rewardDist : currentPrice - rewardDist;
          }

          // Liquidation Price calculation
          const mmr = 0.005;
          const liqPrice =
            side === 'LONG'
              ? currentPrice * (1 - 1 / leverage + mmr)
              : currentPrice * (1 + 1 / leverage - mmr);

          this.activePosition = {
            id: `bot_pos_${Date.now()}`,
            symbol: this.symbol,
            side,
            entryTime: Date.now(),
            entryPrice: currentPrice,
            currentPrice,
            quantity,
            leverage,
            marginUsed: allocatedMargin,
            unrealizedPnl: 0,
            unrealizedPnlPercent: 0,
            stopLossPrice,
            takeProfitPrice,
            trailingPeakPrice: currentPrice,
            liquidationPrice: Math.max(0, liqPrice),
            strategyUsed: activeStrategyKey,
          };

          this.addLog(
            'success',
            `🚀 【自动开单成功】: ${side} ${this.symbol} @ ${currentPrice} USDT (杠杆 ${leverage}x，保证金 $${allocatedMargin.toFixed(1)}，止损: ${stopLossPrice ? stopLossPrice.toFixed(1) : '无'}，止盈: ${takeProfitPrice ? takeProfitPrice.toFixed(1) : '无'})`
          );
        }
      }
    } catch (err: any) {
      this.addLog('error', `交易轮询发生异常: ${err.message || '网络连接超时'}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private closePosition(exitPrice: number, exitReason: ExitReason) {
    if (!this.activePosition) return;
    const pos = this.activePosition;

    const exitNotional = pos.quantity * exitPrice;
    const exitFee = exitNotional * (exitReason === 'TAKE_PROFIT' ? 0.0002 : 0.0005);
    let grossPnl = 0;
    if (pos.side === 'LONG') {
      grossPnl = (exitPrice - pos.entryPrice) * pos.quantity;
    } else {
      grossPnl = (pos.entryPrice - exitPrice) * pos.quantity;
    }

    let netPnl = grossPnl - exitFee;
    if (exitReason === 'LIQUIDATION') {
      netPnl = -pos.marginUsed;
    }

    const pnlPercent = (netPnl / pos.marginUsed) * 100;
    this.balance += pos.marginUsed + netPnl;
    this.equity = this.balance;

    const tradeRecord: BotTradeRecord = {
      id: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryTime: pos.entryTime,
      exitTime: Date.now(),
      entryPrice: pos.entryPrice,
      exitPrice,
      quantity: pos.quantity,
      leverage: pos.leverage,
      marginUsed: pos.marginUsed,
      netPnl,
      pnlPercent,
      exitReason,
      strategyUsed: pos.strategyUsed,
    };

    this.closedTrades.push(tradeRecord);
    this.activePosition = null;

    this.addLog(
      netPnl >= 0 ? 'success' : 'warn',
      `✔ 【自动平仓结算】: ${pos.side} 平仓价 ${exitPrice} USDT | 原因: ${exitReason} | 净盈亏: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} USDT (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`
    );
  }
}

// Export singleton instance
export const botEngine = new TradingEngine();
