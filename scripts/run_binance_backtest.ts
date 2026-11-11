/**
 * Binance Futures Multi-Strategy CLI Backtest & Benchmark Script
 * Usage:
 *   npx tsx scripts/run_binance_backtest.ts --symbol BTCUSDT --interval 1h --candles 500
 */

import { fetchBinanceKlines, runMultiStrategyBenchmark } from '../src/utils/binanceApi';
import { BacktestConfig } from '../src/types/trading';
import { DEFAULT_STRATEGY_PARAMS } from '../src/utils/strategies';

async function main() {
  const args = process.argv.slice(2);
  let symbol = 'BTCUSDT';
  let interval = '1h';
  let candleCount = 500;
  let leverage = 5;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) symbol = args[i + 1].toUpperCase();
    if (args[i] === '--interval' && args[i + 1]) interval = args[i + 1];
    if (args[i] === '--candles' && args[i + 1]) candleCount = parseInt(args[i + 1], 10);
    if (args[i] === '--leverage' && args[i + 1]) leverage = parseInt(args[i + 1], 10);
  }

  console.log(`\n=============================================================================`);
  console.log(`  🚀 币安合约多合一量化策略回测终端 (Binance Futures Quant Lab CLI)`);
  console.log(`  交易标的: ${symbol} | 周期: ${interval} | 目标条数: ${candleCount} 根 | 杠杆: ${leverage}x`);
  console.log(`=============================================================================\n`);

  console.log(`[1/3] 正在从币安官方API拉取 ${symbol} ${interval} 真实历史K线数据 (100% Real Binance Data)...`);
  const startTime = Date.now();
  const { klines, audit } = await fetchBinanceKlines({ symbol, interval, limit: candleCount });
  const fetchDuration = Date.now() - startTime;

  console.log(`✓ 成功拉取 ${klines.length} 根 100% 币安真实 K 线 (官方接口耗时 ${fetchDuration}ms)`);
  console.log(`  数据源地址: ${audit.endpointUrl}`);
  console.log(`  时间范围: ${audit.firstCandleIso} -> ${audit.lastCandleIso}`);
  console.log(`  价格区间: 最低 ${audit.lowestPrice} USDT | 最高 ${audit.highestPrice} USDT | 最新价 ${audit.lastPrice} USDT`);
  console.log(`  总计覆盖真实交易次数: ${audit.totalTradesRecorded.toLocaleString()} 笔真实成交\n`);

  console.log(`[2/3] 正在并行执行 6 大成熟量化策略回测与风控模拟...`);

  const baseConfig: BacktestConfig = {
    symbol,
    interval,
    initialCapital: 10000,
    risk: {
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
      leverage,
      maxAllowedDrawdownPercent: 25,
    },
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    slippageRate: 0.0005,
    strategy: 'ensemble',
    params: DEFAULT_STRATEGY_PARAMS,
  };

  const benchmark = runMultiStrategyBenchmark(klines, baseConfig);

  console.log(`✓ 回测完成！所有策略表现横向对比总表:\n`);

  console.table(
    benchmark.results.map((r, idx) => ({
      排名: idx === 0 ? `🏆 第 1 名 (最佳)` : `第 ${idx + 1} 名`,
      策略名称: r.name,
      净收益率: `${r.metrics.totalReturnPercent >= 0 ? '+' : ''}${r.metrics.totalReturnPercent.toFixed(2)}%`,
      胜率: `${r.metrics.winRatePercent.toFixed(1)}%`,
      交易笔数: r.metrics.totalTrades,
      盈亏比: r.metrics.profitFactor.toFixed(2),
      最大回撤: `-${r.metrics.maxDrawdownPercent.toFixed(2)}%`,
      夏普比率: r.metrics.sharpeRatio,
      平均单笔: `${r.metrics.avgTradeReturnPercent.toFixed(2)}%`,
      最大单笔盈利: `+${r.metrics.largestWinningTradePercent.toFixed(1)}%`,
      最大单笔亏损: `${r.metrics.largestLosingTradePercent.toFixed(1)}%`,
    }))
  );

  const champion = benchmark.results[0];
  console.log(`\n=============================================================================`);
  console.log(`  🌟 最佳策略冠军 (Champion Strategy): 【${champion.name}】`);
  console.log(`=============================================================================`);
  console.log(`  • 净收益率: ${champion.metrics.totalReturnPercent >= 0 ? '+' : ''}${champion.metrics.totalReturnPercent.toFixed(2)}% (基准买入持有: ${champion.metrics.benchmarkReturnPercent.toFixed(2)}%)`);
  console.log(`  • 胜率: ${champion.metrics.winRatePercent.toFixed(1)}% (${champion.metrics.winningTrades} 胜 / ${champion.metrics.losingTrades} 负)`);
  console.log(`  • 盈亏比 (Profit Factor): ${champion.metrics.profitFactor.toFixed(2)}`);
  console.log(`  • 最大回撤 (MDD): -${champion.metrics.maxDrawdownPercent.toFixed(2)}%`);
  console.log(`  • 夏普比率 (Sharpe): ${champion.metrics.sharpeRatio} | 索提诺比率 (Sortino): ${champion.metrics.sortinoRatio}`);
  console.log(`  • 建议风控参数:`);
  console.log(`    - 止损: ATR 动态止损 (${baseConfig.risk.slAtrMultiplier}x ATR)`);
  console.log(`    - 止盈: 风险报酬比 1:${baseConfig.risk.tpRiskRewardRatio}`);
  console.log(`    - 移动止盈: 开启 (回调 ${baseConfig.risk.trailingCallbackPercent}%)`);
  console.log(`    - 建议单笔仓位: 账户权益的 20%~30%，杠杆: ${leverage}x`);
  console.log(`=============================================================================\n`);
}

main().catch((err) => {
  console.error('执行失败:', err);
  process.exit(1);
});
