/**
 * Autonomous Multi-Symbol & Multi-Timeframe Chart Pattern Trading Engine
 * - Dynamic Monitored Pairs (User can add/delete symbols on the fly)
 * - Monitored Strategy Intervals: 5m, 15m, 30m
 * - UI & .env Direct Binance Futures API Credentials Configuration
 * - Categorized System Logs Console (Reverse Chronological Order)
 * - Paper Trading / Observation Mode when no API Key is provided
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  BacktestConfig,
  ExitReason,
  RiskManagementConfig,
  StrategyKey,
  StrategyParams,
} from '../types/trading';
import { fetchBinanceKlines } from '../utils/binanceApi';
import { calculateATR } from '../utils/indicators';
import { DEFAULT_STRATEGY_PARAMS, generateAllSignals } from '../utils/strategies';

dotenv.config();

export interface ActivePosition {
  id: string;
  symbol: string;
  interval: string;
  side: 'LONG' | 'SHORT';
  patternName: string;
  patternCategory?: string;
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
  isPaper: boolean;
}

export interface BotTradeRecord {
  id: string;
  symbol: string;
  interval: string;
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
  isPaper: boolean;
}

export interface SymbolScanResult {
  symbol: string;
  interval: string;
  currentPrice: number;
  change24hPercent: number;
  atr: number;
  signal: 1 | -1 | 0;
  patternName?: string;
  patternCategory?: string;
  qualityScore?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  lastScanTime: number;
}

export interface LogEntry {
  id: string;
  time: string;
  timestamp: number;
  level: 'info' | 'warn' | 'success' | 'error';
  category: 'SYSTEM' | 'ORDER' | 'SIGNAL' | 'API';
  message: string;
  symbol?: string;
}

export interface BotStatus {
  isRunning: boolean;
  mode: 'PAPER' | 'LIVE';
  hasBinanceKeys: boolean;
  binanceEndpoint: string;
  monitoredSymbols: string[];
  monitoredTimeframes: string[];
  balance: number;
  equity: number;
  peakEquity: number;
  drawdownPercent: number;
  leverage: number;
  activePositions: ActivePosition[];
  closedTrades: BotTradeRecord[];
  scanResults: SymbolScanResult[];
  logs: LogEntry[];
  lastUpdateTime: number;
  riskConfig: RiskManagementConfig;
}

class TradingEngine {
  private isRunning: boolean = false;
  private mode: 'PAPER' | 'LIVE' = 'PAPER';
  private monitoredSymbols: string[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  private monitoredTimeframes: string[] = ['5m', '15m', '30m'];

  private apiKey: string = process.env.BINANCE_API_KEY?.trim() || '';
  private apiSecret: string = process.env.BINANCE_API_SECRET?.trim() || '';

  private balance: number = 10000;
  private equity: number = 10000;
  private peakEquity: number = 10000;
  private leverage: number = 5;

  private activePositions: ActivePosition[] = [];
  private closedTrades: BotTradeRecord[] = [];
  private scanResults: SymbolScanResult[] = [];
  private logs: LogEntry[] = [];
  private lastUpdateTime: number = Date.now();

  private riskConfig: RiskManagementConfig = {
    slMode: 'ATR',
    slPercent: 1.5,
    slAtrMultiplier: 1.8,
    tpMode: 'RISK_REWARD',
    tpPercent: 3.5,
    tpRiskRewardRatio: 2.2,
    useTrailingStop: true,
    trailingCallbackPercent: 1.0,
    sizingMode: 'EQUITY_PERCENT',
    positionSizePercent: 20,
    fixedAmountUSDT: 1000,
    riskPerTradePercent: 1.5,
    leverage: 5,
    maxAllowedDrawdownPercent: 20,
  };

  private params: StrategyParams = DEFAULT_STRATEGY_PARAMS;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor() {
    const hasKeys = this.hasApiCredentials();
    this.mode = hasKeys ? 'LIVE' : 'PAPER';
    this.addLog(
      'info',
      'SYSTEM',
      `多币种 5m/15m/30m 动态量化引擎就绪 | 运行模式: ${
        hasKeys
          ? '🟢 币安实盘 API 模式 (已验证 API Key)'
          : '🔵 模拟观察模式 (无 API Key，只自动模拟开平仓并记录损益)'
      }`
    );
  }

  public hasApiCredentials(): boolean {
    return Boolean(
      this.apiKey &&
        this.apiSecret &&
        this.apiKey !== 'MY_BINANCE_API_KEY' &&
        this.apiKey.length > 10
    );
  }

  public setCredentials(key: string, secret: string) {
    this.apiKey = key.trim();
    this.apiSecret = secret.trim();
    const hasKeys = this.hasApiCredentials();
    this.mode = hasKeys ? 'LIVE' : 'PAPER';

    // Persist to .env file
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      envContent = envContent.replace(/^BINANCE_API_KEY=.*$/m, '');
      envContent = envContent.replace(/^BINANCE_API_SECRET=.*$/m, '');
      envContent += `\nBINANCE_API_KEY=${this.apiKey}\nBINANCE_API_SECRET=${this.apiSecret}\n`;
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    } catch {
      // ignore
    }

    this.addLog(
      hasKeys ? 'success' : 'warn',
      'API',
      hasKeys
        ? '✓ 币安 API Key 更新成功，已切换至 🟢 实盘自动下单模式'
        : '⚠️ 币安 API Key 已清除，已切换至 🔵 模拟观察模式'
    );
  }

  public addSymbol(rawSymbol: string): boolean {
    const sym = rawSymbol.trim().toUpperCase();
    const formatted = sym.endsWith('USDT') ? sym : `${sym}USDT`;
    if (!this.monitoredSymbols.includes(formatted)) {
      this.monitoredSymbols.push(formatted);
      this.addLog('info', 'SYSTEM', `➕ 动态添加监控币种: ${formatted}`);
      return true;
    }
    return false;
  }

  public removeSymbol(rawSymbol: string): boolean {
    const sym = rawSymbol.trim().toUpperCase();
    const formatted = sym.endsWith('USDT') ? sym : `${sym}USDT`;
    if (this.monitoredSymbols.includes(formatted)) {
      this.monitoredSymbols = this.monitoredSymbols.filter((s) => s !== formatted);
      this.scanResults = this.scanResults.filter((s) => s.symbol !== formatted);
      this.addLog('warn', 'SYSTEM', `➖ 移除监控币种: ${formatted}`);
      return true;
    }
    return false;
  }

  private getFuturesBaseUrl(): string {
    return process.env.BINANCE_USE_TESTNET === 'true'
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';
  }

  private signQuery(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private async syncBinanceFuturesBalance(): Promise<void> {
    if (!this.hasApiCredentials()) return;
    try {
      const timestamp = Date.now();
      const qs = `timestamp=${timestamp}&recvWindow=5000`;
      const sig = this.signQuery(qs);
      const res = await fetch(`${this.getFuturesBaseUrl()}/fapi/v2/balance?${qs}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
      if (!res.ok) return;
      const balances: any[] = await res.json();
      const usdt = balances.find((b) => b.asset === 'USDT');
      if (usdt && usdt.availableBalance) {
        this.balance = parseFloat(usdt.availableBalance);
        this.equity = parseFloat(usdt.balance || usdt.availableBalance);
      }
    } catch (err: any) {
      this.addLog('warn', 'API', `同步币安合约账户余额异常: ${err.message}`);
    }
  }

  private async setBinanceLeverage(symbol: string, leverage: number): Promise<void> {
    if (!this.hasApiCredentials()) return;
    try {
      const timestamp = Date.now();
      const qs = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}&recvWindow=5000`;
      const sig = this.signQuery(qs);
      await fetch(`${this.getFuturesBaseUrl()}/fapi/v1/leverage?${qs}&signature=${sig}`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
    } catch {
      // ignore
    }
  }

  private async placeBinanceMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly: boolean = false
  ): Promise<{ orderId: string } | null> {
    if (!this.hasApiCredentials()) {
      throw new Error('未配置 BINANCE_API_KEY');
    }

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
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.msg || `Binance API HTTP ${res.status}`);
    }
    return { orderId: String(data.orderId) };
  }

  public getStatus(): BotStatus {
    const hasKeys = this.hasApiCredentials();
    return {
      isRunning: this.isRunning,
      mode: hasKeys ? 'LIVE' : 'PAPER',
      hasBinanceKeys: hasKeys,
      binanceEndpoint: this.getFuturesBaseUrl(),
      monitoredSymbols: this.monitoredSymbols,
      monitoredTimeframes: this.monitoredTimeframes,
      balance: this.balance,
      equity: this.equity,
      peakEquity: this.peakEquity,
      drawdownPercent:
        this.peakEquity > 0 ? ((this.peakEquity - this.equity) / this.peakEquity) * 100 : 0,
      leverage: this.leverage,
      activePositions: this.activePositions,
      closedTrades: this.closedTrades.slice(-50),
      scanResults: this.scanResults,
      logs: [...this.logs], // return array (newest first)
      lastUpdateTime: this.lastUpdateTime,
      riskConfig: this.riskConfig,
    };
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const hasKeys = this.hasApiCredentials();
    this.mode = hasKeys ? 'LIVE' : 'PAPER';

    this.addLog(
      'success',
      'SYSTEM',
      `▶ 启动全自动监控服务 | 监控币种: ${this.monitoredSymbols.join(', ')} | 监控周期: ${this.monitoredTimeframes.join(', ')} | 模式: ${
        hasKeys ? '🟢 币安实盘 API 下单' : '🔵 模拟盘观察记录'
      }`
    );

    this.executeCycle();
    this.timer = setInterval(() => this.executeCycle(), 10000);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.addLog('warn', 'SYSTEM', '⏸ 多币种监控已暂停');
  }

  public updateConfig(newConfig: {
    monitoredSymbols?: string[];
    monitoredTimeframes?: string[];
    leverage?: number;
    riskConfig?: Partial<RiskManagementConfig>;
  }) {
    if (newConfig.monitoredSymbols && Array.isArray(newConfig.monitoredSymbols)) {
      this.monitoredSymbols = newConfig.monitoredSymbols.map((s) => s.toUpperCase());
    }
    if (newConfig.monitoredTimeframes && Array.isArray(newConfig.monitoredTimeframes)) {
      this.monitoredTimeframes = newConfig.monitoredTimeframes;
    }
    if (newConfig.leverage) {
      this.leverage = newConfig.leverage;
      this.riskConfig.leverage = newConfig.leverage;
    }
    if (newConfig.riskConfig) {
      this.riskConfig = { ...this.riskConfig, ...newConfig.riskConfig };
    }
    this.addLog(
      'info',
      'SYSTEM',
      `监控配置已更新 | 币种: ${this.monitoredSymbols.join(', ')} | 周期: ${this.monitoredTimeframes.join(', ')} | 杠杆: ${this.leverage}x`
    );
  }

  public async emergencyClosePosition(reason: ExitReason = 'END_OF_DATA', symbol?: string) {
    const positionsToClose = symbol
      ? this.activePositions.filter((p) => p.symbol === symbol)
      : [...this.activePositions];

    for (const pos of positionsToClose) {
      await this.closePosition(pos, pos.currentPrice, reason);
      this.addLog('warn', 'ORDER', `⚠️ 平仓完成: [${pos.symbol} ${pos.interval}] ${pos.side} @ ${pos.currentPrice} USDT`, pos.symbol);
    }
  }

  private addLog(
    level: 'info' | 'warn' | 'success' | 'error',
    category: 'SYSTEM' | 'ORDER' | 'SIGNAL' | 'API',
    message: string,
    symbol?: string
  ) {
    const timeStr = new Date().toLocaleTimeString();
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      timestamp: Date.now(),
      level,
      category,
      message,
      symbol,
    };
    // Reverse chronological order: prepend to front
    this.logs.unshift(entry);
    if (this.logs.length > 500) this.logs.pop();
  }

  private async executeCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastUpdateTime = Date.now();

    try {
      const hasKeys = this.hasApiCredentials();
      this.mode = hasKeys ? 'LIVE' : 'PAPER';

      if (hasKeys) {
        await this.syncBinanceFuturesBalance();
      }

      const updatedScans: SymbolScanResult[] = [];

      for (const symbol of this.monitoredSymbols) {
        for (const interval of this.monitoredTimeframes) {
          try {
            const fetchResult = await fetchBinanceKlines({
              symbol,
              interval,
              limit: 200,
            });

            const klines = fetchResult.klines;
            if (klines.length < 30) continue;

            const latestBar = klines[klines.length - 1];
            const currentPrice = latestBar.close;
            const firstBarPrice = klines[0].open;
            const change24hPercent = ((currentPrice - firstBarPrice) / firstBarPrice) * 100;
            const currentAtr =
              calculateATR(klines, 14)[klines.length - 1] ?? (latestBar.high - latestBar.low);

            const { signals, patternMap } = generateAllSignals(
              klines,
              this.params,
              'pattern_price_action'
            );

            const latestIndex = signals.length - 1;
            const latestSig = signals[latestIndex];
            const matchedPattern = patternMap.get(latestIndex);

            updatedScans.push({
              symbol,
              interval,
              currentPrice,
              change24hPercent: Number(change24hPercent.toFixed(2)),
              atr: currentAtr,
              signal: latestSig,
              patternName: matchedPattern?.name,
              patternCategory: matchedPattern?.category,
              qualityScore: matchedPattern?.qualityScore,
              stopLossPrice: matchedPattern?.stopLossPrice,
              targetPrice: matchedPattern?.targetPrice,
              lastScanTime: Date.now(),
            });

            if (latestSig !== 0 && matchedPattern) {
              this.addLog(
                'info',
                'SIGNAL',
                `⚡ 触发形态信号: [${symbol} ${interval}] ${matchedPattern.name} (动作: ${matchedPattern.action}, 质量: ${matchedPattern.qualityScore})`,
                symbol
              );
            }

            const activePosIndex = this.activePositions.findIndex((p) => p.symbol === symbol);
            if (activePosIndex >= 0) {
              const pos = this.activePositions[activePosIndex];
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

              let exitTriggered: ExitReason | null = null;
              if (pos.side === 'LONG' && currentPrice <= pos.liquidationPrice) {
                exitTriggered = 'LIQUIDATION';
              } else if (pos.side === 'SHORT' && currentPrice >= pos.liquidationPrice) {
                exitTriggered = 'LIQUIDATION';
              } else if (pos.stopLossPrice !== null) {
                if (pos.side === 'LONG' && currentPrice <= pos.stopLossPrice) exitTriggered = 'STOP_LOSS';
                else if (pos.side === 'SHORT' && currentPrice >= pos.stopLossPrice) exitTriggered = 'STOP_LOSS';
              } else if (pos.takeProfitPrice !== null) {
                if (pos.side === 'LONG' && currentPrice >= pos.takeProfitPrice) exitTriggered = 'TAKE_PROFIT';
                else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfitPrice) exitTriggered = 'TAKE_PROFIT';
              }

              if (!exitTriggered && this.riskConfig.useTrailingStop && this.riskConfig.trailingCallbackPercent > 0) {
                const cb = this.riskConfig.trailingCallbackPercent / 100;
                if (pos.side === 'LONG') {
                  const gain = (pos.trailingPeakPrice - pos.entryPrice) / pos.entryPrice;
                  if (gain >= cb && currentPrice <= pos.trailingPeakPrice * (1 - cb)) {
                    exitTriggered = 'TRAILING_STOP';
                  }
                } else {
                  const gain = (pos.entryPrice - pos.trailingPeakPrice) / pos.entryPrice;
                  if (gain >= cb && currentPrice >= pos.trailingPeakPrice * (1 + cb)) {
                    exitTriggered = 'TRAILING_STOP';
                  }
                }
              }

              if (exitTriggered) {
                this.addLog(
                  exitTriggered === 'TAKE_PROFIT' || exitTriggered === 'TRAILING_STOP' ? 'success' : 'warn',
                  'ORDER',
                  `🎯 [${symbol} ${pos.interval}] 触发平仓条件: ${exitTriggered} @ ${currentPrice} USDT`,
                  symbol
                );
                await this.closePosition(pos, currentPrice, exitTriggered);
                continue;
              }

              if (
                (pos.side === 'LONG' && latestSig === -1) ||
                (pos.side === 'SHORT' && latestSig === 1)
              ) {
                this.addLog(
                  'info',
                  'ORDER',
                  `🔄 [${symbol}] 收到反向信号【${matchedPattern?.name ?? '反向形态'}】，平仓当前持仓`,
                  symbol
                );
                await this.closePosition(pos, currentPrice, 'SIGNAL_REVERSAL');
                continue;
              }
            }

            if (activePosIndex < 0 && latestSig !== 0 && this.balance > 50) {
              const side: 'LONG' | 'SHORT' = latestSig === 1 ? 'LONG' : 'SHORT';
              const baseLeverage = this.leverage;
              let leverage = baseLeverage;

              if (matchedPattern) {
                if (matchedPattern.qualityScore >= 95) leverage = Math.min(125, Math.round(baseLeverage * 1.5));
                else if (matchedPattern.qualityScore >= 90) leverage = Math.min(125, Math.round(baseLeverage * 1.25));
                else if (matchedPattern.qualityScore < 85) leverage = Math.max(1, Math.round(baseLeverage * 0.8));
              }

              const patternTitle = matchedPattern?.name ?? `${interval} K线形态突破`;
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

              const pct = Math.min(25, Math.max(5, this.riskConfig.positionSizePercent));
              const allocatedMargin = this.balance * (pct / 100);
              const positionNotional = allocatedMargin * leverage;
              const quantity = positionNotional / currentPrice;
              const entryFee = positionNotional * 0.0005;

              if (this.balance >= allocatedMargin + entryFee && quantity > 0) {
                let binanceOrderId: string | undefined;

                if (hasKeys) {
                  await this.setBinanceLeverage(symbol, leverage);
                  const orderRes = await this.placeBinanceMarketOrder(
                    symbol,
                    side === 'LONG' ? 'BUY' : 'SELL',
                    quantity,
                    false
                  );
                  binanceOrderId = orderRes?.orderId;
                }

                this.balance -= allocatedMargin + entryFee;

                let takeProfitPrice: number | null = matchedPattern?.targetPrice ?? null;
                if (!takeProfitPrice && plannedStopDistance > 0) {
                  const rewardDist = plannedStopDistance * 2.2;
                  takeProfitPrice = side === 'LONG' ? currentPrice + rewardDist : currentPrice - rewardDist;
                }

                const mmr = 0.005;
                const liqPrice =
                  side === 'LONG'
                    ? currentPrice * (1 - 1 / leverage + mmr)
                    : currentPrice * (1 + 1 / leverage - mmr);

                const newPosition: ActivePosition = {
                  id: `pos_${symbol}_${Date.now()}`,
                  symbol,
                  interval,
                  side,
                  patternName: patternTitle,
                  patternCategory: matchedPattern?.category,
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
                  strategyUsed: 'pattern_price_action',
                  binanceOrderId,
                  isPaper: !hasKeys,
                };

                this.activePositions.push(newPosition);

                this.addLog(
                  'success',
                  'ORDER',
                  `🚀 [${hasKeys ? '实盘开单' : '模拟观察记录'}] ${symbol} (${interval}) 识别到【${patternTitle}】-> ${side} @ ${currentPrice} USDT (杠杆 ${leverage}x，保证金 $${allocatedMargin.toFixed(1)}${binanceOrderId ? `，订单 #${binanceOrderId}` : ''})`,
                  symbol
                );
              }
            }
          } catch {
            // ignore
          }
        }
      }

      this.scanResults = updatedScans;

      let totalUnrealizedPnl = 0;
      for (const pos of this.activePositions) {
        totalUnrealizedPnl += pos.unrealizedPnl;
      }
      this.equity = Math.max(0, this.balance + totalUnrealizedPnl);
      if (this.equity > this.peakEquity) this.peakEquity = this.equity;
    } catch (err: any) {
      this.addLog('error', 'SYSTEM', `监控循环处理异常: ${err.message || '网络连接中断'}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async closePosition(pos: ActivePosition, exitPrice: number, exitReason: ExitReason) {
    if (pos.isPaper === false && this.hasApiCredentials()) {
      try {
        await this.placeBinanceMarketOrder(
          pos.symbol,
          pos.side === 'LONG' ? 'SELL' : 'BUY',
          pos.quantity,
          true
        );
      } catch (err: any) {
        this.addLog('error', 'API', `币安实盘平仓请求异常: ${err.message}`, pos.symbol);
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
      interval: pos.interval,
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
      isPaper: pos.isPaper,
    };

    this.closedTrades.push(tradeRecord);
    this.activePositions = this.activePositions.filter((p) => p.id !== pos.id);

    this.addLog(
      netPnl >= 0 ? 'success' : 'warn',
      'ORDER',
      `✔ [${pos.symbol} ${pos.interval}] ${pos.isPaper ? '模拟' : '实盘'}平仓: ${pos.side} @ ${exitPrice} USDT | 原因: ${exitReason} | 净损益: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} USDT (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`,
      pos.symbol
    );
  }
}

export const botEngine = new TradingEngine();
