import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { botEngine } from './src/server/botEngine';
import { fetchBinanceKlines } from './src/utils/binanceApi';
import { LOCKED_TARGET_SYMBOLS, normalizeLockedSymbol } from './src/utils/riskAndExecution';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Session tokens store in memory
const activeTokens = new Set<string>();

app.use(express.json());

// Public Auth API: Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = `quant_auth_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    activeTokens.add(token);
    return res.json({ success: true, token, message: '登录成功' });
  }
  return res.status(401).json({ success: false, message: '密码错误，默认密码为 admin123' });
});

// Public Auth API: Verify token
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (token && activeTokens.has(token)) {
    return res.json({ authenticated: true });
  }
  return res.json({ authenticated: false });
});

// Public Auth API: Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (token) activeTokens.delete(token);
  return res.json({ success: true });
});

// Auth Middleware for protected bot endpoints
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '请先登录量化控制台' });
  }
  next();
}

// Protected Bot Status (auto-refreshes live Binance account & positions when API keys are set)
app.get('/api/bot/status', requireAuth, async (req, res) => {
  if (botEngine.hasApiCredentials()) {
    await botEngine.syncLiveAccountIfStale(4000);
  }
  res.json(botEngine.getStatus());
});

// Direct Binance Live Account, Open Positions & Real Equity Endpoint
app.get('/api/binance/live-account', requireAuth, async (req, res) => {
  if (!botEngine.hasApiCredentials()) {
    return res.status(400).json({
      error: 'NO_API_KEYS',
      message: '尚未配置币安实盘 API Key，请在系统设置中输入后连接实盘账户',
    });
  }
  await botEngine.syncLiveAccountIfStale(3000);
  const status = botEngine.getStatus();
  return res.json({
    mode: status.mode,
    hasBinanceKeys: status.hasBinanceKeys,
    liveSyncInfo: status.liveSyncInfo,
    balance: status.balance,
    equity: status.equity,
    peakEquity: status.peakEquity,
    drawdownPercent: status.drawdownPercent,
    leverage: status.leverage,
    monitoredSymbols: status.monitoredSymbols,
    riskMetrics: status.riskMetrics,
    activePositions: status.activePositions,
    equityHistory: status.equityHistory,
    closedTrades: status.closedTrades,
    lastUpdateTime: status.lastUpdateTime,
  });
});

// Force immediate Binance Futures sync (Account, PositionRisk, OpenOrders, Income & UserTrades)
app.post('/api/binance/sync-now', requireAuth, async (req, res) => {
  if (!botEngine.hasApiCredentials()) {
    return res.status(400).json({
      error: 'NO_API_KEYS',
      message: '尚未配置币安 API Key',
    });
  }
  await botEngine.syncLiveAccountNow(true);
  const status = botEngine.getStatus();
  return res.json({
    success: Boolean(status.liveSyncInfo?.syncOk),
    message: status.liveSyncInfo?.syncOk
      ? '实盘资产与持仓数据已同步更新'
      : status.liveSyncInfo?.errorMessage || '实盘账户同步失败',
    status,
  });
});

// Downloadable Full Diagnostic & Log Export Endpoint
app.get('/api/bot/export-diagnostic-logs', requireAuth, (req, res) => {
  const status = botEngine.getStatus();
  const exportData = {
    exportTime: new Date().toISOString(),
    mode: status.mode,
    hasBinanceKeys: status.hasBinanceKeys,
    liveSyncInfo: status.liveSyncInfo,
    balance: status.balance,
    equity: status.equity,
    riskMetrics: status.riskMetrics,
    marketCorrelation: status.marketCorrelation,
    strategyScreener: status.strategyScreener,
    portfolioAllocation: status.portfolioAllocation,
    portfolioBasket: status.portfolioBasket,
    arbitrageOpportunities: status.arbitrageOpportunities,
    systemMetrics: status.systemMetrics,
    learningGeneration: status.learningGeneration,
    patternLearningStats: status.patternLearningStats,
    timeframeDiagnostic: status.timeframeDiagnostic,
    monitoredSymbols: status.monitoredSymbols,
    monitoredTimeframes: status.monitoredTimeframes,
    riskConfig: status.riskConfig,
    activePositions: status.activePositions,
    closedTrades: status.closedTrades,
    logs: status.logs,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=binance_quant_diagnostic_${Date.now()}.json`
  );
  res.send(JSON.stringify(exportData, null, 2));
});

// Protected Bot Start
app.post('/api/bot/start', requireAuth, (req, res) => {
  botEngine.start();
  res.json({ success: true, message: '监控已启动', status: botEngine.getStatus() });
});

// Protected Bot Stop
app.post('/api/bot/stop', requireAuth, (req, res) => {
  botEngine.stop();
  res.json({ success: true, message: '监控已暂停', status: botEngine.getStatus() });
});

// Protected Bot Config
app.post('/api/bot/config', requireAuth, (req, res) => {
  botEngine.updateConfig(req.body);
  res.json({ success: true, message: '配置已更新', status: botEngine.getStatus() });
});

// Protected Test Emergency Notification Route
app.post('/api/bot/test-notification', requireAuth, async (req, res) => {
  const sent = await botEngine.sendEmergencyNotification(
    '手动测试紧急风控预警推送',
    '此消息为手动测试紧急风控预警推送接口，证明 Telegram Bot / Webhook 告警通道已成功通畅挂载！'
  );
  res.json({ success: true, sent, status: botEngine.getStatus() });
});

// Protected Add Monitored Symbol (strictly restricted to locked 5 contracts)
app.post('/api/bot/symbols/add', requireAuth, (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter required' });
  const locked = normalizeLockedSymbol(symbol);
  if (!locked) {
    return res.status(400).json({
      success: false,
      error: 'SYMBOL_LOCKED',
      message: `监控范围已锁定为 5 个核心合约 (${LOCKED_TARGET_SYMBOLS.join(', ')})，禁止添加 ${symbol}`,
      status: botEngine.getStatus(),
    });
  }
  const added = botEngine.addSymbol(locked);
  res.json({ success: added, status: botEngine.getStatus() });
});

// Protected Remove Monitored Symbol
app.post('/api/bot/symbols/remove', requireAuth, (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter required' });
  const removed = botEngine.removeSymbol(symbol);
  res.json({ success: removed, status: botEngine.getStatus() });
});

// Protected Update Binance API Credentials
app.post('/api/bot/credentials', requireAuth, async (req, res) => {
  const { apiKey, apiSecret } = req.body || {};
  await botEngine.setCredentials(apiKey || '', apiSecret || '');
  res.json({ success: true, message: 'API 密钥已保存并同步账户状态', status: botEngine.getStatus() });
});

// Protected Emergency Close Position
app.post('/api/bot/close-position', requireAuth, async (req, res) => {
  const { symbol } = req.body || {};
  await botEngine.emergencyClosePosition('END_OF_DATA', symbol);
  res.json({ success: true, message: '仓位已平仓', status: botEngine.getStatus() });
});

// Protected Portfolio One-Click Close All Positions (losing first, cancels residual exchange SL/TP orders, sets anti-reopen cooldown)
app.post('/api/bot/close-all', requireAuth, async (req, res) => {
  const result = await botEngine.closeAllPositions('MANUAL_CLOSE_ALL');
  res.json({
    success: true,
    closedCount: result.closedCount,
    netRealizedBeforeClose: result.netRealizedBeforeClose,
    message:
      result.closedCount > 0
        ? `已按先亏后盈顺序全平 ${result.closedCount} 笔持仓并撤销所有挂单`
        : '当前无活跃持仓',
    status: botEngine.getStatus(),
  });
});

// Protected Root-Cause Anomaly One-Click Fix Route
app.post('/api/bot/fix-anomaly', requireAuth, async (req, res) => {
  const { action } = req.body || {};
  let message = '已执行异常修复操作';

  if (action === 'RESET_DRAWDOWN_LOCK') {
    botEngine.resetDrawdownLock();
    message = '已校准回撤峰值基准线并解除回撤锁仓限制';
  } else if (action === 'CLEAR_COOLDOWN') {
    botEngine.clearCooldowns();
    message = '已解除全平冷却锁并校准开仓质量门槛';
  } else if (action === 'OPTIMIZE_SMALL_CAPITAL') {
    botEngine.optimizeSmallCapitalConfig();
    message = '已切换小资金自适应配比 (单笔风控 ≤ 2%, 杠杆上限 ≤ 5x)';
  } else if (action === 'SYNC_ACCOUNT') {
    if (botEngine.hasApiCredentials()) {
      await botEngine.syncLiveAccountNow(true);
    }
    await botEngine.refreshMarketPreview();
    message = '已重新执行交易所接口同步与盘口行情扫描';
  } else {
    return res.status(400).json({ success: false, message: '未知修复动作类型' });
  }

  return res.json({
    success: true,
    message,
    status: botEngine.getStatus(),
  });
});

// Proxy Binance Klines
app.get('/api/binance/klines', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || 'BTCUSDT';
    const interval = (req.query.interval as string) || '1h';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 300;

    const data = await fetchBinanceKlines({ symbol, interval, limit });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取K线失败' });
  }
});

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const distIndex = path.resolve(distPath, 'index.html');
  const hasBuiltDist = fs.existsSync(distIndex);

  if (!hasBuiltDist) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(distIndex);
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (reqUrl.pathname !== '/ws/bot-status') {
        socket.destroy();
        return;
      }
      const token = (reqUrl.searchParams.get('token') || '').trim();
      if (!token || !activeTokens.has(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let isAlive = true;
    ws.on('pong', () => {
      isAlive = true;
    });

    // 1. Immediate initial authoritative state hydration
    try {
      ws.send(JSON.stringify({ type: 'status:init', status: botEngine.getStatus() }));
    } catch {
      // ignore
    }

    if (botEngine.hasApiCredentials()) {
      botEngine.syncLiveAccountIfStale(3000).catch(() => {});
    }

    // 2. Push subsequent delta/full status events in real time without polling
    const unsubscribe = botEngine.subscribe((statusSnapshot) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'status:update', status: statusSnapshot }));
        } catch {
          // ignore
        }
      }
    });

    const heartbeatTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!isAlive) {
        ws.terminate();
        return;
      }
      isAlive = false;
      try {
        ws.ping();
      } catch {
        // ignore
      }
    }, 25_000);
    heartbeatTimer.unref?.();

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=============================================================================`);
    console.log(`  🚀 币安合约多币种 5m/15m/30m 自动量化与 WebSocket 实时推送服务已启动`);
    console.log(`  服务端口: http://0.0.0.0:${PORT} (WS: /ws/bot-status)`);
    console.log(`  公网访问登录保护: 开启 (默认密码: admin123 或 ADMIN_PASSWORD)`);
    console.log(`=============================================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});
