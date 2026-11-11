/**
 * Autonomous Chart Pattern Trading Bot Engine for Binance Futures
 * - 100% Real Binance K-line data polling
 * - Pure Chart Pattern & Price Action signal recognition
 * - Historical accuracy self-optimization (auto-selects highest win-rate pattern family)
 * - Direct Binance Futures API (fapi.binance.com) HMAC-SHA256 order execution when BINANCE_API_KEY is configured in .env
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  BacktestConfig,
  ExitReason,
  RiskManagementConfig,
  StrategyKey,
  StrategyParams,
} from '../types/trading';
import { fetchBinanceKlines, runMultiStrategyBenchmark } from '../utils/binanceApi';
import { calculateATR } from '../utils/indicators';
import { DEFAULT_STRATEGY_PARAMS, generateAllSignals } from '../utils/strategies';

dotenv.config();

export interface ActivePosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  patternName: string;
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
  binanceOrderId?: string;
}

export interface BotTradeRecord {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  patternName: string;
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
  hasBinanceKeys: boolean;
  binanceEndpoint: string;
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
  private currentStrategy: StrategyKey = 'pattern_price_action';
  private championStrategy: StrategyKey = 'pattern_price_action';
  private championStrategyName: string = '全形态历史胜率自优引擎';

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
    tpRiskRewardRatio: 2.2,
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
    const hasKeys = this.hasApiCredentials();
    this.addLog(
      'info',
      `形态量化自动交易引擎已就绪 | 币安实盘密钥状态: ${hasKeys ? '已配置 (.env)' : '未配置 (当前使用币安真实行情模拟撮合)'}`
    );
  }

  private hasApiCredentials(): boolean {
    const key = process.env.BINANCE_API_KEY?.trim();
    const secret = process.env.BINANCE_API_SECRET?.trim();
    return Boolean(key && secret && key !== 'MY_BINANCE_API_KEY');
  }

  private getFuturesBaseUrl(): string {
    return process.env.BINANCE_USE_TESTNET === 'true'
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';
  }

  private signQuery(queryString: string): string {
    const secret = process.env.BINANCE_API_SECRET?.trim() || '';
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
  }

  /**
   * Synchronize real USDT balance from Binance Futures account when in LIVE mode
   */
  private async syncBinanceFuturesBalance(): Promise<void> {
    if (!this.hasApiCredentials()) return;
    try {
      const timestamp = Date.now();
      const qs = `timestamp=${timestamp}&recvWindow=5000`;
      const sig = this.signQuery(qs);
      const res = await fetch(`${this.getFuturesBaseUrl()}/fapi/v2/balance?${qs}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY!.trim() },
      });
      if (!res.ok) return;
      const balances: any[] = await res.json();
      const usdt = balances.find((b) => b.asset === 'USDT');
      if (usdt && usdt.availableBalance) {
        this.balance = parseFloat(usdt.availableBalance);
        this.equity = parseFloat(usdt.balance || usdt.availableBalance);
      }
    } catch (err: any) {
      this.addLog('warn', `同步币安合约账户余额异常: ${err.message}`);
    }
  }

  /**
   * Set leverage on Binance Futures when in LIVE mode
   */
  private async setBinanceLeverage(symbol: string, leverage: number): Promise<void> {
    if (!this.hasApiCredentials()) return;
    try {
      const timestamp = Date.now();
      const qs = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}&recvWindow=5000`;
      const sig = this.signQuery(qs);
      await fetch(`${this.getFuturesBaseUrl()}/fapi/v1/leverage?${qs}&signature=${sig}`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY!.trim() },
      });
    } catch {
      // Ignore non-fatal leverage sync errors
    }
  }

  /**
   * Place real signed MARKET order on Binance Futures (fapi.binance.com)
   */
  private async placeBinanceMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly: boolean = false
  ): Promise<{ orderId: string } | null> {
    if (!this.hasApiCredentials()) {
      throw new Error('服务器 .env 未配置 BINANCE_API_KEY 和 BINANCE_API_SECRET');
    }

    // Format quantity to 3 decimal places for BTC/ETH, 1 for others
    const precision = symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 3 : 1;
    const formattedQty = Number(quantity.toFixed(precision));
    if (formattedQty <= 0) {
      throw new Error(`下单数量过小 (${quantity.toFixed(5)})，无法满足币安合约最小下单精度`);
    }

    const timestamp = Date.now();
    const qs = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${formattedQty}${
      reduceOnly ? '&reduceOnly=true' : ''
    }&timestamp=${timestamp}&recvWindow=5000`;
    const sig = this.signQuery(qs);

    const res = await fetch(`${this.getFuturesBaseUrl()}/fapi/v1/order?${qs}&signature=${sig}`, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY!.trim() },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.msg || `Binance API HTTP ${res.status}`);
    }
    return { orderId: String(data.orderId) };
  }

  public getStatus(): BotStatus {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      hasBinanceKeys: this.hasApiCredentials(),
      binanceEndpoint: this.getFuturesBaseUrl(),
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
      closedTrades: this.closedTrades.slice(-50),
      logs: this.logs.slice(-60),
      marketRegime: this.marketRegime,
      lastUpdateTime: this.lastUpdateTime,
      riskConfig: this.riskConfig,
    };
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.addLog(
      'success',
      `▶ 启动形态量化自动机器人: ${this.symbol} (${this.interval} 周期，杠杆 ${this.leverage}x，模式: ${
        this.mode === 'LIVE' ? '币安实盘 API 下单' : '币安真实行情模拟'
      })`
    );

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
    this.addLog('warn', '⏸ 形态量化机器人已暂停运行');
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
    if (newConfig.mode) {
      if (newConfig.mode === 'LIVE' && !this.hasApiCredentials()) {
        this.addLog(
          'warn',
          '⚠️ 切换到实盘模式提示: 请在服务器 .env 文件中填入 BINANCE_API_KEY 与 BINANCE_API_SECRET 以启用币安合约真实下单'
        );
      }
      this.mode = newConfig.mode;
    }
    if (newConfig.autoSelectChampion !== undefined) this.autoSelectChampion = newConfig.autoSelectChampion;
    if (newConfig.currentStrategy) this.currentStrategy = newConfig.currentStrategy;
    if (newConfig.riskConfig) {
      this.riskConfig = { ...this.riskConfig, ...newConfig.riskConfig };
    }
    this.addLog(
      'info',
      `配置已更新: ${this.symbol} | ${this.interval} | 杠杆 ${this.leverage}x | 自动寻优形态: ${
        this.autoSelectChampion ? '开启' : '关闭'
      }`
    );
  }

  public async emergencyClosePosition(reason: ExitReason = 'END_OF_DATA') {
    if (!this.activePosition) return;
    const pos = this.activePosition;
    await this.closePosition(pos.currentPrice, reason);
    this.addLog('warn', `⚠️ 手动/紧急平仓完成: ${pos.side} @ ${pos.currentPrice} USDT`);
  }

  private addLog(level: 'info' | 'warn' | 'success' | 'error', message: string) {
    const timeStr = new Date().toLocaleTimeString();
    this.logs.push({ time: timeStr, level, message });
    if (this.logs.length > 200) this.logs.shift();
  }

  private async executeCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastUpdateTime = Date.now();

    try {
      if (this.mode === 'LIVE' && this.hasApiCredentials()) {
        await this.syncBinanceFuturesBalance();
      }

      // 1. Fetch 100% real historical K-lines from Binance official API
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
      const currentPrice = latestBar.close;
      const currentAtr = calculateATR(klines, 14)[klines.length - 1] ?? (latestBar.high - latestBar.low);

      // 2. Auto Pattern Family Optimization: Benchmark pattern families on recent real K-lines
      if (this.autoSelectChampion) {
        const dummyConfig: BacktestConfig = {
          symbol: this.symbol,
          interval: this.interval,
          initialCapital: 10000,
          risk: this.riskConfig,
          makerFeeRate: 0.0002,
          takerFeeRate: 0.0005,
          slippageRate: 0.0005,
          strategy: 'pattern_price_action',
          params: this.params,
        };

        const bench = runMultiStrategyBenchmark(klines, dummyConfig);
        const best = bench.results[0];
        if (best.key !== this.championStrategy) {
          this.championStrategy = best.key;
          this.championStrategyName = best.name;
          this.addLog(
            'success',
            `👑 历史数据自优完成，锁定当前最高胜率形态组合: 【${best.name}】(历史胜率: ${best.metrics.winRatePercent.toFixed(1)}%, 盈亏比: ${best.metrics.profitFactor.toFixed(2)})`
          );
        }
      }

      const activeStrategyKey = this.autoSelectChampion ? this.championStrategy : this.currentStrategy;

      // 3. Update active position mark price & evaluate SL / TP / Trailing Stop
      if (this.activePosition) {
        const pos = this.activePosition;
        pos.currentPrice = currentPrice;

        if (pos.side === 'LONG') {
          pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
        } else {
          pos.unrealizedPnl = (pos.entryPrice - currentPrice) * pos.quantity;
        }
        pos.unrealizedPnlPercent = (pos.unrealizedPnl / pos.marginUsed) * 100;

        if (pos.side === 'LONG' && currentPrice > pos.trailingPeakPrice) {
          pos.trailingPeakPrice = currentPrice;
        } else if (pos.side === 'SHORT' && currentPrice < pos.trailingPeakPrice) {
          pos.trailingPeakPrice = currentPrice;
        }

        if (pos.side === 'LONG' && currentPrice <= pos.liquidationPrice) {
          this.addLog('error', `🚨 触发多单强平保护线，强制平仓！`);
          await this.closePosition(currentPrice, 'LIQUIDATION');
          return;
        } else if (pos.side === 'SHORT' && currentPrice >= pos.liquidationPrice) {
          this.addLog('error', `🚨 触发空单强平保护线，强制平仓！`);
          await this.closePosition(currentPrice, 'LIQUIDATION');
          return;
        }

        if (pos.stopLossPrice !== null) {
          if (pos.side === 'LONG' && currentPrice <= pos.stopLossPrice) {
            this.addLog('warn', `🛑 触发形态结构止损: ${currentPrice} <= ${pos.stopLossPrice.toFixed(2)} USDT`);
            await this.closePosition(currentPrice, 'STOP_LOSS');
            return;
          } else if (pos.side === 'SHORT' && currentPrice >= pos.stopLossPrice) {
            this.addLog('warn', `🛑 触发形态结构止损: ${currentPrice} >= ${pos.stopLossPrice.toFixed(2)} USDT`);
            await this.closePosition(currentPrice, 'STOP_LOSS');
            return;
          }
        }

        if (pos.takeProfitPrice !== null) {
          if (pos.side === 'LONG' && currentPrice >= pos.takeProfitPrice) {
            this.addLog('success', `🎯 触发形态目标止盈: ${currentPrice} >= ${pos.takeProfitPrice.toFixed(2)} USDT`);
            await this.closePosition(currentPrice, 'TAKE_PROFIT');
            return;
          } else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfitPrice) {
            this.addLog('success', `🎯 触发形态目标止盈: ${currentPrice} <= ${pos.takeProfitPrice.toFixed(2)} USDT`);
            await this.closePosition(currentPrice, 'TAKE_PROFIT');
            return;
          }
        }

        if (this.riskConfig.useTrailingStop && this.riskConfig.trailingCallbackPercent > 0) {
          const cb = this.riskConfig.trailingCallbackPercent / 100;
          if (pos.side === 'LONG') {
            const gain = (pos.trailingPeakPrice - pos.entryPrice) / pos.entryPrice;
            if (gain >= cb) {
              const stopLine = pos.trailingPeakPrice * (1 - cb);
              if (currentPrice <= stopLine) {
                this.addLog('success', `✦ 触发移动追踪止盈: 价格自峰值回撤达到 ${this.riskConfig.trailingCallbackPercent}%，锁定利润平仓！`);
                await this.closePosition(currentPrice, 'TRAILING_STOP');
                return;
              }
            }
          } else {
            const gain = (pos.entryPrice - pos.trailingPeakPrice) / pos.entryPrice;
            if (gain >= cb) {
              const stopLine = pos.trailingPeakPrice * (1 + cb);
              if (currentPrice >= stopLine) {
                this.addLog('success', `✦ 触发移动追踪止盈: 空头自低点反弹达到 ${this.riskConfig.trailingCallbackPercent}%，锁定利润平仓！`);
                await this.closePosition(currentPrice, 'TRAILING_STOP');
                return;
              }
            }
          }
        }
      }

      const unrealizedTotal = this.activePosition ? this.activePosition.unrealizedPnl : 0;
      this.equity = Math.max(0, this.balance + unrealizedTotal);
      if (this.equity > this.peakEquity) this.peakEquity = this.equity;

      const currentDD =
        this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0;
      if (
        this.riskConfig.maxAllowedDrawdownPercent > 0 &&
        currentDD >= this.riskConfig.maxAllowedDrawdownPercent
      ) {
        this.addLog(
          'error',
          `🛑 触发账户最大回撤熔断保护 (${currentDD.toFixed(1)}% >= ${this.riskConfig.maxAllowedDrawdownPercent}%)，暂停新开仓！`
        );
        return;
      }

      // 4. Evaluate Chart Pattern Signal on latest closed/live K-line
      const { signals, patternMap, regimes } = generateAllSignals(
        klines,
        this.params,
        activeStrategyKey
      );
      const latestIndex = signals.length - 1;
      const latestSig = signals[latestIndex];
      const matchedPattern = patternMap.get(latestIndex);
      this.marketRegime = regimes[latestIndex];

      // 5. Reversal Exit if opposite pattern confirmed
      if (this.activePosition) {
        if (
          (this.activePosition.side === 'LONG' && latestSig === -1) ||
          (this.activePosition.side === 'SHORT' && latestSig === 1)
        ) {
          this.addLog(
            'info',
            `🔄 检测到反向形态【${matchedPattern?.name ?? '反向形态'}】，先平仓当前 ${this.activePosition.side} 头寸`
          );
          await this.closePosition(currentPrice, 'SIGNAL_REVERSAL');
        }
      }

      // 6. Auto Open Position on Verified Chart Pattern
      if (!this.activePosition && latestSig !== 0 && this.balance > 50) {
        const side: 'LONG' | 'SHORT' = latestSig === 1 ? 'LONG' : 'SHORT';
        const baseLeverage = this.leverage;
        let leverage = baseLeverage;
        if (matchedPattern) {
          if (matchedPattern.qualityScore >= 95) {
            leverage = Math.min(125, Math.round(baseLeverage * 1.5));
          } else if (matchedPattern.qualityScore >= 90) {
            leverage = Math.min(125, Math.round(baseLeverage * 1.25));
          } else if (matchedPattern.qualityScore < 85) {
            leverage = Math.max(1, Math.round(baseLeverage * 0.8));
          }
        }
        const patternTitle = matchedPattern?.name ?? 'K线高胜率形态突破';

        let stopLossPrice: number | null = matchedPattern?.stopLossPrice ?? null;
        let plannedStopDistance = stopLossPrice ? Math.abs(currentPrice - stopLossPrice) : 0;

        if (!stopLossPrice) {
          if (this.riskConfig.slMode === 'PERCENT' && this.riskConfig.slPercent > 0) {
            plannedStopDistance = currentPrice * (this.riskConfig.slPercent / 100);
            stopLossPrice = side === 'LONG' ? currentPrice - plannedStopDistance : currentPrice + plannedStopDistance;
          } else if (this.riskConfig.slMode === 'ATR' && this.riskConfig.slAtrMultiplier > 0) {
            plannedStopDistance = currentAtr * this.riskConfig.slAtrMultiplier;
            stopLossPrice = side === 'LONG' ? currentPrice - plannedStopDistance : currentPrice + plannedStopDistance;
          }
        }

        let allocatedMargin = 0;
        if (this.riskConfig.sizingMode === 'FIXED_AMOUNT') {
          const targetNotional = Math.min(this.riskConfig.fixedAmountUSDT, this.balance * leverage);
          allocatedMargin = targetNotional / leverage;
        } else if (this.riskConfig.sizingMode === 'RISK_PARITY_ATR') {
          const dollarRisk = this.balance * (this.riskConfig.riskPerTradePercent / 100);
          const dist = plannedStopDistance > 0 ? plannedStopDistance : currentAtr * 2;
          const targetQty = dist > 0 ? dollarRisk / dist : 0;
          allocatedMargin = Math.min(this.balance * 0.9, (targetQty * currentPrice) / leverage);
        } else {
          const pct = Math.min(100, Math.max(5, this.riskConfig.positionSizePercent));
          allocatedMargin = this.balance * (pct / 100);
        }

        const positionNotional = allocatedMargin * leverage;
        const quantity = positionNotional / currentPrice;
        const entryFee = positionNotional * 0.0005;

        if (this.balance >= allocatedMargin + entryFee && quantity > 0) {
          let binanceOrderId: string | undefined;

          if (this.mode === 'LIVE') {
            if (!this.hasApiCredentials()) {
              this.addLog(
                'error',
                `❌ 形态【${patternTitle}】已触发，但服务器 .env 未配置 BINANCE_API_KEY，无法向币安发送实盘订单！`
              );
              return;
            }
            await this.setBinanceLeverage(this.symbol, leverage);
            const orderRes = await this.placeBinanceMarketOrder(
              this.symbol,
              side === 'LONG' ? 'BUY' : 'SELL',
              quantity,
              false
            );
            binanceOrderId = orderRes?.orderId;
          }

          this.balance -= allocatedMargin + entryFee;

          let takeProfitPrice: number | null = matchedPattern?.targetPrice ?? null;
          if (!takeProfitPrice) {
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
          }

          const mmr = 0.005;
          const liqPrice =
            side === 'LONG'
              ? currentPrice * (1 - 1 / leverage + mmr)
              : currentPrice * (1 + 1 / leverage - mmr);

          this.activePosition = {
            id: `bot_pos_${Date.now()}`,
            symbol: this.symbol,
            side,
            patternName: patternTitle,
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
            binanceOrderId,
          };

          this.addLog(
            'success',
            `🚀 【形态触发自动开单】: 识别到【${patternTitle}】-> ${side} ${this.symbol} @ ${currentPrice} USDT (杠杆 ${leverage}x，保证金 $${allocatedMargin.toFixed(1)}，结构止损: ${stopLossPrice ? stopLossPrice.toFixed(2) : '无'}，目标止盈: ${takeProfitPrice ? takeProfitPrice.toFixed(2) : '无'}${binanceOrderId ? `，币安订单号 #${binanceOrderId}` : ''})`
          );
        }
      }
    } catch (err: any) {
      this.addLog('error', `轮询或币安下单异常: ${err.message || '网络连接超时'}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async closePosition(exitPrice: number, exitReason: ExitReason) {
    if (!this.activePosition) return;
    const pos = this.activePosition;

    if (this.mode === 'LIVE' && this.hasApiCredentials()) {
      try {
        await this.placeBinanceMarketOrder(
          pos.symbol,
          pos.side === 'LONG' ? 'SELL' : 'BUY',
          pos.quantity,
          true
        );
      } catch (err: any) {
        this.addLog('error', `币安实盘平仓请求异常: ${err.message}`);
      }
    }

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
      patternName: pos.patternName,
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
      `✔ 【形态交易平仓】: [${pos.patternName}] ${pos.side} 平仓价 ${exitPrice} USDT | 原因: ${exitReason} | 净盈亏: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} USDT (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`
    );
  }
}

export const botEngine = new TradingEngine();
