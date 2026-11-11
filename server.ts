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

app.use(express.json());

// API: Bot Status
app.get('/api/bot/status', (req, res) => {
  res.json(botEngine.getStatus());
});

// API: Start Bot
app.post('/api/bot/start', (req, res) => {
  botEngine.start();
  res.json({ success: true, message: '机器人已启动', status: botEngine.getStatus() });
});

// API: Stop Bot
app.post('/api/bot/stop', (req, res) => {
  botEngine.stop();
  res.json({ success: true, message: '机器人已暂停', status: botEngine.getStatus() });
});

// API: Update Bot Config
app.post('/api/bot/config', (req, res) => {
  botEngine.updateConfig(req.body);
  res.json({ success: true, message: '配置已更新', status: botEngine.getStatus() });
});

// API: Emergency Close Position
app.post('/api/bot/close-position', (req, res) => {
  botEngine.emergencyClosePosition('END_OF_DATA');
  res.json({ success: true, message: '仓位已平仓', status: botEngine.getStatus() });
});

// API: Proxy Binance Klines
app.get('/api/binance/klines', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || 'BTCUSDT';
    const interval = (req.query.interval as string) || '1h';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;

    const data = await fetchBinanceKlines({ symbol, interval, limit });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取K线失败' });
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve(__dirname, 'dist'));

  if (!isProduction) {
    // In development, mount Vite dev server middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist/
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=============================================================================`);
    console.log(`  🚀 币安合约多合一量化策略回测与全自动交易服务已启动`);
    console.log(`  服务端口: http://0.0.0.0:${PORT} (Node.js & Express Native)`);
    console.log(`  自动最优策略选择 · 自动开单 · 自动平仓 · 自动仓位风控 已集成`);
    console.log(`=============================================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});
