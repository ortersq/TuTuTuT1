import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { botEngine } from './src/server/botEngine';
import { fetchBinanceKlines } from './src/utils/binanceApi';

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

// Protected Bot Status
app.get('/api/bot/status', requireAuth, (req, res) => {
  res.json(botEngine.getStatus());
});

// Downloadable Full Diagnostic & Log Export Endpoint
app.get('/api/bot/export-diagnostic-logs', requireAuth, (req, res) => {
  const status = botEngine.getStatus();
  const exportData = {
    exportTime: new Date().toISOString(),
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

// Protected Add Monitored Symbol
app.post('/api/bot/symbols/add', requireAuth, (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter required' });
  const added = botEngine.addSymbol(symbol);
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
app.post('/api/bot/credentials', requireAuth, (req, res) => {
  const { apiKey, apiSecret } = req.body || {};
  botEngine.setCredentials(apiKey || '', apiSecret || '');
  res.json({ success: true, message: 'API 密钥已保存', status: botEngine.getStatus() });
});

// Protected Emergency Close Position
app.post('/api/bot/close-position', requireAuth, (req, res) => {
  const { symbol } = req.body || {};
  botEngine.emergencyClosePosition('END_OF_DATA', symbol);
  res.json({ success: true, message: '仓位已平仓', status: botEngine.getStatus() });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=============================================================================`);
    console.log(`  🚀 币安合约多币种 5m/15m/30m 自动量化与密码保护服务已启动`);
    console.log(`  服务端口: http://0.0.0.0:${PORT}`);
    console.log(`  公网访问登录保护: 开启 (默认密码: admin123 或 ADMIN_PASSWORD)`);
    console.log(`=============================================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});
