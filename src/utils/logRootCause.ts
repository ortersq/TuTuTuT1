export type RootCauseCategoryId =
  | 'API_CIRCUIT_OR_GEO'
  | 'RISK_CIRCUIT_BREAKER'
  | 'BALANCE_OR_MIN_NOTIONAL'
  | 'LIQUIDITY_SLIPPAGE'
  | 'STRATEGY_FILTER_OR_COOLDOWN'
  | 'SYMBOL_UNAVAILABLE';

export type RootCauseFixActionType =
  | 'SYNC_ACCOUNT'
  | 'RESET_DRAWDOWN_LOCK'
  | 'CLEAR_COOLDOWN'
  | 'OPTIMIZE_SMALL_CAPITAL'
  | 'RELAX_QUALITY_THRESHOLD'
  | 'OPEN_SETTINGS';

export interface LogEntryLike {
  id: string;
  time: string;
  timestamp: number;
  level: 'info' | 'warn' | 'success' | 'error';
  category: 'SYSTEM' | 'ORDER' | 'SIGNAL' | 'API';
  message: string;
  symbol?: string;
}

export interface LogRootCauseContext {
  isDrawdownLocked?: boolean;
  isCircuitBreakerActive?: boolean;
  hasBinanceKeys?: boolean;
  syncOk?: boolean;
  lastSyncError?: string;
  equity?: number;
  cooldownActiveUntil?: number | null;
}

export interface LogRootCauseFixAction {
  type: RootCauseFixActionType;
  label: string;
  description: string;
}

export interface LogRootCauseItem {
  id: RootCauseCategoryId;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  count: number;
  symbols: string[];
  latestTime: string;
  latestTimestamp: number;
  latestMessage: string;
  explanation: string;
  filterKeyword: string;
  fixAction: LogRootCauseFixAction;
}

export interface LogRootCauseReport {
  totalAnalyzedLogs: number;
  blockingEventsCount: number;
  primaryBlockerTitle: string;
  primaryBlockerSummary: string;
  items: LogRootCauseItem[];
}

interface RuleDefinition {
  id: RootCauseCategoryId;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  patterns: RegExp[];
  explanation: string;
  filterKeyword: string;
  fixAction: LogRootCauseFixAction;
}

const ROOT_CAUSE_RULES: RuleDefinition[] = [
  {
    id: 'API_CIRCUIT_OR_GEO',
    title: 'API 熔断 / 接口鉴权或网络受限',
    severity: 'CRITICAL',
    patterns: [
      /同步失败/i,
      /实盘下单失败/i,
      /实盘平仓异常/i,
      /Service unavailable from a restricted location/i,
      /HTTP\s*(401|403|418|429|451|5\d\d)/i,
      /-2015\b|-1021\b|-1022\b/,
      /Invalid API-key|Timestamp for this request|API 密钥/i,
      /未能获取币安|无法从币安官方接口/i,
    ],
    explanation:
      '交易所 API 鉴权拒绝、IP 地区受限 (451)、时间偏差 (-1021) 或触发频率限制，导致引擎为保护资金自动阻断实盘开仓。',
    filterKeyword: '同步失败',
    fixAction: {
      type: 'SYNC_ACCOUNT',
      label: '一键重连并同步实盘账户',
      description: '立即重新握手校验币安 Futures API 状态并刷新可用余额与持仓',
    },
  },
  {
    id: 'RISK_CIRCUIT_BREAKER',
    title: '大盘剧烈共振 / 回撤熔断锁仓',
    severity: 'CRITICAL',
    patterns: [
      /风险熔断防线触发/i,
      /回撤熔断锁仓/i,
      /触发回撤硬熔断/i,
      /账户总回撤.*已触及熔断/i,
      /全局大盘剧烈共振熔断/i,
      /停止新开仓/i,
    ],
    explanation:
      '市场波动爆发倍率或账户总回撤超过风控阈值，系统强制降低杠杆并锁死新开仓位以防极端单边行情冲洗。',
    filterKeyword: '熔断',
    fixAction: {
      type: 'RESET_DRAWDOWN_LOCK',
      label: '一键校准回撤基准线并解锁',
      description: '以当前真实账户净值重置峰值回撤基准线（不放大杠杆），恢复正常信号监听',
    },
  },
  {
    id: 'BALANCE_OR_MIN_NOTIONAL',
    title: '余额 / 保证金占用上限或最小名义价值拦截',
    severity: 'HIGH',
    patterns: [
      /可用保证金不足/i,
      /Margin is insufficient/i,
      /-2019\b|-4164\b/,
      /minNotional|最小名义价值/i,
      /安全缓冲不足|保证金占用率/i,
      /已达.*上限|暂缓开单/i,
      /跳过开单.*资金|实际资金不足/i,
    ],
    explanation:
      '剩余可用保证金低于 22% 安全缓冲线，或单笔风险预算折算后的下单名义价值低于交易所最低要求（如 BTCUSDT ≥ $100）。',
    filterKeyword: '保证金',
    fixAction: {
      type: 'OPTIMIZE_SMALL_CAPITAL',
      label: '一键切换小资金自适应风控配比',
      description: '将单笔风控占比校准为 2% / 保证金比例 25%（不超 5x 杠杆），自动优先可成交合约',
    },
  },
  {
    id: 'LIQUIDITY_SLIPPAGE',
    title: '订单簿流动性不足 / 滑点保护执行切换',
    severity: 'MEDIUM',
    patterns: [
      /流动性不足/i,
      /Order Book|盘口深度/i,
      /冰山单|ICEBERG/i,
      /TWAP/i,
      /滑点/i,
    ],
    explanation:
      '监控到盘口深度偏薄或短时波动过快，智能执行模块主动拆分为冰山单 / 限价防滑点执行，或暂缓市价追单。',
    filterKeyword: '流动性',
    fixAction: {
      type: 'SYNC_ACCOUNT',
      label: '一键刷新盘口深度与委托状态',
      description: '同步交易所挂单簿与当前执行引擎状态，清理滞留探测',
    },
  },
  {
    id: 'STRATEGY_FILTER_OR_COOLDOWN',
    title: '策略质量门限 / 7日淘汰 / 冷静期拦截',
    severity: 'MEDIUM',
    patterns: [
      /已自动淘汰/i,
      /严格过滤弱信号/i,
      /提高开仓门槛/i,
      /反手信号.*拒绝/i,
      /全平冷却期内|冷却期/i,
      /RL.*收紧防线/i,
    ],
    explanation:
      '出现 K 线形态信号但被策略自优评级 (< C 级)、强化学习高质量门限 (≥90分)、跨周期反转保护或平仓冷却机制拦截。',
    filterKeyword: '门槛',
    fixAction: {
      type: 'CLEAR_COOLDOWN',
      label: '一键解除平仓冷却并重校准门限',
      description: '清除多空冷却锁定并将开仓质量门槛复位至均衡区间，允许符合趋势的高胜率信号正常进场',
    },
  },
  {
    id: 'SYMBOL_UNAVAILABLE',
    title: '合约暂未上市或交易对被交易所下线',
    severity: 'MEDIUM',
    patterns: [
      /-1121\b/,
      /Invalid symbol/i,
      /暂未查到/i,
      /暂未上市/i,
      /暂未开放该合约/i,
    ],
    explanation:
      '币安 USDT-M Futures `/fapi/v1/exchangeInfo` 中未返回该交易对（或地区节点不支持），系统已自动跳过以避免报错阻塞。',
    filterKeyword: '暂未',
    fixAction: {
      type: 'OPEN_SETTINGS',
      label: '一键核对合约白名单与 API 设置',
      description: '前往「动态币种 & API 配置」检查交易所接口连接与可交易合约列表',
    },
  },
];

export function analyzeLogRootCauses(
  logs: LogEntryLike[],
  context: LogRootCauseContext = {}
): LogRootCauseReport {
  const buckets = new Map<
    RootCauseCategoryId,
    {
      rule: RuleDefinition;
      count: number;
      symbols: Set<string>;
      latestTime: string;
      latestTimestamp: number;
      latestMessage: string;
    }
  >();

  for (const log of logs) {
    // Only analyze error/warn or explicit blocking/filter notes
    const isCandidate =
      log.level === 'error' ||
      log.level === 'warn' ||
      /熔断|拦截|拒绝|不足|淘汰|冷却|受限|失败/.test(log.message);
    if (!isCandidate) continue;

    for (const rule of ROOT_CAUSE_RULES) {
      if (rule.patterns.some((rx) => rx.test(log.message))) {
        const existing = buckets.get(rule.id);
        if (!existing) {
          const symbols = new Set<string>();
          if (log.symbol) symbols.add(log.symbol);
          buckets.set(rule.id, {
            rule,
            count: 1,
            symbols,
            latestTime: log.time,
            latestTimestamp: log.timestamp,
            latestMessage: log.message,
          });
        } else {
          existing.count += 1;
          if (log.symbol) existing.symbols.add(log.symbol);
          if (log.timestamp >= existing.latestTimestamp) {
            existing.latestTimestamp = log.timestamp;
            existing.latestTime = log.time;
            existing.latestMessage = log.message;
          }
        }
        break;
      }
    }
  }

  // Synthesize active runtime context blockers even if logs were scrolled or cleared
  const synthNow = Date.now();
  const synthTimeStr = new Date(synthNow).toLocaleTimeString('zh-CN', { hour12: false });

  if (context.hasBinanceKeys && context.syncOk === false && !buckets.has('API_CIRCUIT_OR_GEO')) {
    const rule = ROOT_CAUSE_RULES.find((r) => r.id === 'API_CIRCUIT_OR_GEO')!;
    buckets.set(rule.id, {
      rule,
      count: 1,
      symbols: new Set<string>(),
      latestTime: synthTimeStr,
      latestTimestamp: synthNow,
      latestMessage: context.lastSyncError || '实盘 API 同步未就绪，已暂停实盘开仓',
    });
  }

  if (
    (context.isDrawdownLocked || context.isCircuitBreakerActive) &&
    !buckets.has('RISK_CIRCUIT_BREAKER')
  ) {
    const rule = ROOT_CAUSE_RULES.find((r) => r.id === 'RISK_CIRCUIT_BREAKER')!;
    buckets.set(rule.id, {
      rule,
      count: 1,
      symbols: new Set<string>(),
      latestTime: synthTimeStr,
      latestTimestamp: synthNow,
      latestMessage: context.isDrawdownLocked
        ? '当前账户处于回撤熔断锁仓状态，已禁止开新单'
        : '全局市场共振熔断防线处于激活状态',
    });
  }

  const severityRank: Record<'CRITICAL' | 'HIGH' | 'MEDIUM', number> = {
    CRITICAL: 3,
    HIGH: 2,
    MEDIUM: 1,
  };

  const items: LogRootCauseItem[] = Array.from(buckets.values())
    .map((b) => ({
      id: b.rule.id,
      title: b.rule.title,
      severity: b.rule.severity,
      count: b.count,
      symbols: Array.from(b.symbols),
      latestTime: b.latestTime,
      latestTimestamp: b.latestTimestamp,
      latestMessage: b.latestMessage,
      explanation: b.rule.explanation,
      filterKeyword: b.rule.filterKeyword,
      fixAction: b.rule.fixAction,
    }))
    .sort((a, b) => {
      const sevDiff = severityRank[b.severity] - severityRank[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.count - a.count || b.latestTimestamp - a.latestTimestamp;
    });

  const blockingEventsCount = items.reduce((sum, item) => sum + item.count, 0);

  return {
    totalAnalyzedLogs: logs.length,
    blockingEventsCount,
    primaryBlockerTitle: items[0]?.title || '系统运行链路畅通，未检出阻塞型异常',
    primaryBlockerSummary:
      items[0]?.explanation ||
      '当前日志中未发现 API 熔断、流动性匮乏、保证金不足或风控锁仓等阻塞交易原因，系统正按 5m/15m/30m 策略信号正常待命。',
    items,
  };
}
