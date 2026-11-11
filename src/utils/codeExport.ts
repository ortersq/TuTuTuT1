import { BacktestResult, StrategyKey } from '../types/trading';

/**
 * Generate TradingView Pine Script v5 code for the strategy
 */
export function generatePineScriptV5(result: BacktestResult): string {
  const { config, metrics } = result;
  const { symbol, interval, risk, params } = config;

  return `//@version=5
// =========================================================================
// Binance Futures Quant Lab - Production Strategy
// Symbol: ${symbol} | Timeframe: ${interval} | Strategy: ${config.strategy}
// Backtest Win Rate: ${metrics.winRatePercent.toFixed(1)}% | Net Return: ${metrics.totalReturnPercent.toFixed(1)}% | Profit Factor: ${metrics.profitFactor.toFixed(2)}
// =========================================================================

strategy("Binance Futures - ${config.strategy.toUpperCase()}", 
     overlay=true, 
     initial_capital=${config.initialCapital}, 
     default_qty_type=strategy.percent_of_equity, 
     default_qty_value=${risk.positionSizePercent}, 
     commission_type=strategy.commission.percent, 
     commission_value=${config.takerFeeRate * 100}, 
     slippage=5)

// --- Risk Management Inputs ---
slMode = input.string("${risk.slMode}", "Stop Loss Mode", options=["PERCENT", "ATR", "NONE"])
slPercent = input.float(${risk.slPercent}, "SL Fixed %", minval=0.1, step=0.1)
slAtrMult = input.float(${risk.slAtrMultiplier}, "SL ATR Multiplier", minval=0.5, step=0.5)

tpMode = input.string("${risk.tpMode}", "Take Profit Mode", options=["PERCENT", "RISK_REWARD", "NONE"])
tpPercent = input.float(${risk.tpPercent}, "TP Fixed %", minval=0.5, step=0.5)
tpRiskReward = input.float(${risk.tpRiskRewardRatio}, "TP Risk:Reward Ratio", minval=1.0, step=0.5)

useTrailing = input.bool(${risk.useTrailingStop}, "Use Trailing Stop")
trailingCallback = input.float(${risk.trailingCallbackPercent}, "Trailing Callback %", minval=0.5, step=0.1)

// --- Indicator & Strategy Parameters ---
stPeriod = input.int(${params.supertrendPeriod}, "SuperTrend Period", group="SuperTrend")
stMult = input.float(${params.supertrendMultiplier}, "SuperTrend Multiplier", group="SuperTrend")
emaPeriod = input.int(${params.supertrendEmaFilter}, "Trend Filter EMA", group="SuperTrend")

dtLookback = input.int(${params.dualThrustLookback}, "Dual Thrust Lookback", group="Dual Thrust")
dtK1 = input.float(${params.dualThrustK1}, "Dual Thrust K1", group="Dual Thrust")
dtK2 = input.float(${params.dualThrustK2}, "Dual Thrust K2", group="Dual Thrust")

bbPeriod = input.int(${params.bbPeriod}, "Bollinger Period", group="Bollinger + RSI")
bbMult = input.float(${params.bbStdDev}, "Bollinger StdDev", group="Bollinger + RSI")
rsiPeriod = input.int(${params.rsiPeriod}, "RSI Period", group="Bollinger + RSI")

// --- Calculations ---
atrVal = ta.atr(14)
emaVal = ta.ema(close, emaPeriod)
[stValue, stDirection] = ta.supertrend(stMult, stPeriod)

// Dual Thrust Channels
hh = ta.highest(high[1], dtLookback)
lc = ta.lowest(close[1], dtLookback)
hc = ta.highest(close[1], dtLookback)
ll = ta.lowest(low[1], dtLookback)
dtRange = math.max(hh - lc, hc - ll)
dtUpper = open + dtK1 * dtRange
dtLower = open - dtK2 * dtRange

// Bollinger & RSI
[bbMid, bbUpper, bbLower] = ta.bb(close, bbPeriod, bbMult)
rsiVal = ta.rsi(close, rsiPeriod)

// --- Signals ---
bool longSignal = false
bool shortSignal = false

#if "${config.strategy}" == "supertrend"
longSignal := ta.crossover(close, stValue) and (close >= emaVal * 0.99)
shortSignal := ta.crossunder(close, stValue) and (close <= emaVal * 1.01)
#elif "${config.strategy}" == "dual_thrust"
longSignal := ta.crossover(close, dtUpper)
shortSignal := ta.crossunder(close, dtLower)
#elif "${config.strategy}" == "bollinger_rsi"
longSignal := (low <= bbLower or rsiVal <= ${params.rsiOversold}) and (rsiVal > rsiVal[1])
shortSignal := (high >= bbUpper or rsiVal >= ${params.rsiOverbought}) and (rsiVal < rsiVal[1])
#else
// Multi-Strategy Ensemble Consensus
float consensusScore = 0.0
if ta.crossover(close, stValue)
    consensusScore += 0.35
if ta.crossunder(close, stValue)
    consensusScore -= 0.35
if close > dtUpper
    consensusScore += 0.25
if close < dtLower
    consensusScore -= 0.25
if (low <= bbLower and rsiVal < 35)
    consensusScore += 0.25
if (high >= bbUpper and rsiVal > 65)
    consensusScore -= 0.25

longSignal := consensusScore >= 0.35
shortSignal := consensusScore <= -0.35
#endif

// --- Orders & Risk Management Execution ---
if longSignal
    strategy.entry("Long", strategy.long)
if shortSignal
    strategy.entry("Short", strategy.short)

// Compute dynamic stop loss and take profit points
var float entryPrice = 0.0
var float stopLossPrice = 0.0
var float takeProfitPrice = 0.0

if (strategy.position_size > 0 and strategy.position_size[1] <= 0)
    entryPrice := close
    if slMode == "PERCENT"
        stopLossPrice := entryPrice * (1 - slPercent / 100)
    else if slMode == "ATR"
        stopLossPrice := entryPrice - (atrVal * slAtrMult)
        
    if tpMode == "PERCENT"
        takeProfitPrice := entryPrice * (1 + tpPercent / 100)
    else if tpMode == "RISK_REWARD"
        takeProfitPrice := entryPrice + (entryPrice - stopLossPrice) * tpRiskReward

if (strategy.position_size < 0 and strategy.position_size[1] >= 0)
    entryPrice := close
    if slMode == "PERCENT"
        stopLossPrice := entryPrice * (1 + slPercent / 100)
    else if slMode == "ATR"
        stopLossPrice := entryPrice + (atrVal * slAtrMult)
        
    if tpMode == "PERCENT"
        takeProfitPrice := entryPrice * (1 - tpPercent / 100)
    else if tpMode == "RISK_REWARD"
        takeProfitPrice := entryPrice - (stopLossPrice - entryPrice) * tpRiskReward

// Exit conditions
if strategy.position_size > 0
    strategy.exit("Long Exit", "Long", stop=stopLossPrice, limit=takeProfitPrice)

if strategy.position_size < 0
    strategy.exit("Short Exit", "Short", stop=stopLossPrice, limit=takeProfitPrice)

// Visual Overlays
plot(stValue, "SuperTrend Stop", color = stDirection == -1 ? color.green : color.red, linewidth = 2)
plot(emaVal, "Trend EMA", color = color.blue, linewidth = 1)
`;
}

/**
 * Generate Python ccxt Binance Futures Automated Trading Bot script
 */
export function generatePythonBotScript(result: BacktestResult): string {
  const { config, metrics } = result;
  return `"""
=============================================================================
Binance Futures Multi-Strategy Algorithmic Trading Bot (Python / CCXT)
Symbol: ${config.symbol} | Leverage: ${config.risk.leverage}x | Strategy: ${config.strategy}
Historical Win Rate: ${metrics.winRatePercent.toFixed(1)}% | Profit Factor: ${metrics.profitFactor.toFixed(2)}
=============================================================================
"""

import time
import ccxt
import pandas as pd
import numpy as np

# 1. Binance Futures API Initialization
api_key = "YOUR_BINANCE_API_KEY"
secret = "YOUR_BINANCE_SECRET_KEY"

exchange = ccxt.binance({
    'apiKey': api_key,
    'secret': secret,
    'enableRateLimit': True,
    'options': {
        'defaultType': 'future',  # USDT-M Perpetual Futures
    }
})

SYMBOL = "${config.symbol}"
TIMEFRAME = "${config.interval}"
LEVERAGE = ${config.risk.leverage}
POSITION_SIZE_PCT = ${config.risk.positionSizePercent / 100}

# Risk Management
SL_PERCENT = ${config.risk.slPercent / 100}
TP_PERCENT = ${config.risk.tpPercent / 100}
USE_TRAILING = ${config.risk.useTrailingStop ? 'True' : 'False'}
TRAILING_CALLBACK = ${config.risk.trailingCallbackPercent / 100}

def set_futures_leverage():
    try:
        response = exchange.fapiPrivate_post_leverage({
            'symbol': SYMBOL.replace('/', ''),
            'leverage': LEVERAGE
        })
        print(f"Leverage set to {LEVERAGE}x: {response}")
    except Exception as e:
        print(f"Error setting leverage: {e}")

def fetch_klines(limit=100):
    bars = exchange.fetch_ohlcv(SYMBOL, timeframe=TIMEFRAME, limit=limit)
    df = pd.DataFrame(bars, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    return df

def calculate_supertrend(df, period=10, multiplier=3.0):
    hl2 = (df['high'] + df['low']) / 2
    df['tr'] = np.maximum(
        df['high'] - df['low'],
        np.maximum(abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1)))
    )
    df['atr'] = df['tr'].rolling(window=period).mean()
    
    df['upperband'] = hl2 + (multiplier * df['atr'])
    df['lowerband'] = hl2 - (multiplier * df['atr'])
    df['in_uptrend'] = True

    for i in range(1, len(df)):
        if df['close'].iloc[i] > df['upperband'].iloc[i-1]:
            df.loc[df.index[i], 'in_uptrend'] = True
        elif df['close'].iloc[i] < df['lowerband'].iloc[i-1]:
            df.loc[df.index[i], 'in_uptrend'] = False
        else:
            df.loc[df.index[i], 'in_uptrend'] = df['in_uptrend'].iloc[i-1]
            if df['in_uptrend'].iloc[i] and df['lowerband'].iloc[i] < df['lowerband'].iloc[i-1]:
                df.loc[df.index[i], 'lowerband'] = df['lowerband'].iloc[i-1]
            if not df['in_uptrend'].iloc[i] and df['upperband'].iloc[i] > df['upperband'].iloc[i-1]:
                df.loc[df.index[i], 'upperband'] = df['upperband'].iloc[i-1]
    return df

def run_trading_cycle():
    print(f"\\n--- Checking Binance Futures Signals for {SYMBOL} ---")
    df = fetch_klines(100)
    df = calculate_supertrend(df, period=${config.params.supertrendPeriod}, multiplier=${config.params.supertrendMultiplier})
    df['ema200'] = df['close'].ewm(span=${config.params.supertrendEmaFilter}, adjust=False).mean()

    latest = df.iloc[-1]
    prev = df.iloc[-2]

    # Signal Check
    bullish_flip = latest['in_uptrend'] and not prev['in_uptrend'] and latest['close'] >= latest['ema200'] * 0.99
    bearish_flip = not latest['in_uptrend'] and prev['in_uptrend'] and latest['close'] <= latest['ema200'] * 1.01

    current_price = latest['close']
    print(f"Price: {current_price} | Uptrend: {latest['in_uptrend']} | EMA200: {latest['ema200']:.2f}")

    if bullish_flip:
        print(">>> LONG SIGNAL TRIGGERED <<<")
        # Place market order & OCO TP/SL brackets
    elif bearish_flip:
        print(">>> SHORT SIGNAL TRIGGERED <<<")
        # Place market short order & brackets

if __name__ == '__main__':
    print("Starting Binance Futures Algorithmic Bot...")
    set_futures_leverage()
    while True:
        try:
            run_trading_cycle()
            time.sleep(60)  # Polling interval
        except Exception as e:
            print(f"Execution error: {e}")
            time.sleep(10)
`;
}

/**
 * Generate formatted Markdown / Text Executive Backtest Report
 */
export function generateMarkdownReport(result: BacktestResult): string {
  const { config, metrics, trades, marketRegimeStats } = result;

  return `# 币安合约多合一量化策略回测报告

## 1. 基础信息与风控概览
- **标的交易对**: ${config.symbol} (${config.interval} 周期)
- **初始本金**: ${metrics.initialCapital.toLocaleString()} USDT
- **期末净值**: ${metrics.finalEquity.toFixed(2)} USDT
- **杠杆倍数**: ${config.risk.leverage}x
- **止损模式**: ${config.risk.slMode} (${config.risk.slMode === 'PERCENT' ? `${config.risk.slPercent}%` : `${config.risk.slAtrMultiplier}x ATR`})
- **止盈模式**: ${config.risk.tpMode} (${config.risk.tpMode === 'PERCENT' ? `${config.risk.tpPercent}%` : `1:${config.risk.tpRiskRewardRatio} 盈亏比`})
- **移动止盈**: ${config.risk.useTrailingStop ? `已开启 (${config.risk.trailingCallbackPercent}% 回撤)` : '未开启'}
- **仓位管理**: ${config.risk.sizingMode}

## 2. 收益与风险核心指标 (Performance KPIs)
| 指标 | 策略表现 | 基准对比 (买入持有) |
| :--- | :--- | :--- |
| **净收益率 (Total Return)** | **${metrics.totalReturnPercent >= 0 ? '+' : ''}${metrics.totalReturnPercent.toFixed(2)}%** | ${metrics.benchmarkReturnPercent >= 0 ? '+' : ''}${metrics.benchmarkReturnPercent.toFixed(2)}% |
| **超额收益 (Alpha)** | **${metrics.alphaPercent >= 0 ? '+' : ''}${metrics.alphaPercent.toFixed(2)}%** | - |
| **年化复合收益率 (CAGR)** | **${metrics.cagrPercent.toFixed(2)}%** | - |
| **最大回撤 (Max Drawdown)** | **-${metrics.maxDrawdownPercent.toFixed(2)}%** | - |
| **夏普比率 (Sharpe Ratio)** | **${metrics.sharpeRatio}** | - |
| **索提诺比率 (Sortino Ratio)**| **${metrics.sortinoRatio}** | - |
| **卡玛比率 (Calmar Ratio)** | **${metrics.calmarRatio}** | - |

## 3. 交易胜率与盈亏比统计
- **总交易笔数**: ${metrics.totalTrades} 笔
- **盈利交易**: ${metrics.winningTrades} 笔 (胜率: **${metrics.winRatePercent.toFixed(1)}%**)
- **亏损交易**: ${metrics.losingTrades} 笔
- **多单统计**: ${metrics.longTrades} 笔 (多单胜率: ${metrics.longWinRatePercent.toFixed(1)}%)
- **空单统计**: ${metrics.shortTrades} 笔 (空单胜率: ${metrics.shortWinRatePercent.toFixed(1)}%)
- **盈亏比 (Profit Factor)**: **${metrics.profitFactor.toFixed(2)}**
- **平均每笔收益率**: ${metrics.avgTradeReturnPercent.toFixed(2)}%
- **单笔最大盈利**: +${metrics.largestWinningTradePercent.toFixed(2)}%
- **单笔最大亏损**: ${metrics.largestLosingTradePercent.toFixed(2)}%
- **最大连续亏损次数**: ${metrics.maxConsecutiveLosses} 次
- **强平爆仓次数**: ${metrics.liquidationsCount} 次 (杠杆风控保护)

## 4. 风控与平仓原因分布
- **止损触发次数**: ${metrics.slTriggersCount} 次
- **止盈触发次数**: ${metrics.tpTriggersCount} 次
- **移动追踪止盈触发**: ${metrics.trailingTriggersCount} 次
- **累计交易手续费**: ${metrics.totalFeesPaid.toFixed(2)} USDT

## 5. 市场状态机分布
- **趋势行情占比 (Trending)**: ${marketRegimeStats.trendingBarsPercent.toFixed(1)}%
- **震荡盘整占比 (Consolidation)**: ${marketRegimeStats.consolidationBarsPercent.toFixed(1)}%
`;
}
