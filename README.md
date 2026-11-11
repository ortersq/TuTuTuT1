# ⚡ Binance Futures Quant Lab (币安合约多合一量化策略回测系统)

![OpenCloudOS 9](https://img.shields.io/badge/OS-OpenCloudOS%209-blue)
![Binance Real Data](https://img.shields.io/badge/Data-100%25%20Binance%20Verified-gold)
![License](https://img.shields.io/badge/License-Apache%202.0-green)

币安合约多合一量化策略回测系统，整合经典 CTA 突破 (Dual Thrust)、动态趋势追踪 (SuperTrend + EMA200)、均值回归 (Bollinger Bands + RSI)、动量量价 (MACD VPA)、波动率网格 (ATR Grid) 以及基于市场状态机（Regime Detection）的自适应融合多因子引擎。

**100% 直连币安官方公共行情接口拉取真实历史 K 线**，绝无任何模拟假数据，提供全套风险管理模块（ATR 动态止损、盈亏比锁利、移动追踪、ATR 风险价值平价仓位）与实盘代码导出（TradingView Pine Script v5 / Python CCXT）。

---

## 🚀 OpenCloudOS 9 (新加坡 / 全球服务器) 一键部署指南

### 方案 A：一键全自动部署脚本 (推荐，原生 Nginx 高性能)

在你的 OpenCloudOS 9 新加坡云主机终端中，执行以下一行命令即可完成从环境安装、SWAP 内存防护、Node.js 20、编译打包到 Nginx 启动全流程：

```bash
# 1. 克隆你的 GitHub 仓库（替换为你的仓库地址）
git clone <YOUR_GITHUB_REPO_URL>.git && cd <REPO_NAME>

# 2. 执行一键部署脚本
sudo bash deploy.sh
```

部署脚本会自动处理以下 OpenCloudOS 9 特有环境因素：
1. **小内存 OOM 防护**：自动检测物理内存，若低于 2GB 则自动配置 2GB SWAP 交换分区，防止 Vite 编译打包时因内存耗尽被系统杀死；
2. **包管理器适配**：使用 OpenCloudOS 9 原生 `dnf` 安装 Nginx、Node.js 20 LTS；
3. **防火墙自动放通**：自动检测 `firewalld` 并放通 TCP 80/443 端口；
4. **SELinux 策略适配**：自动执行 `setsebool -P httpd_can_network_connect 1`，防止 OpenCloudOS 9 默认的严格安全上下文拦截 Web 访问；
5. **新加坡币安专线测速**：自动测试新加坡节点至 `https://data-api.binance.vision` 的直连毫秒级延迟；
6. **开机自启**：配置 `systemctl enable nginx`，确保服务器重启后量化看板无缝自启。

---

### 方案 B：Docker 极速容器化部署 (一行命令)

如果你偏好完全隔离的 Docker 容器环境：

```bash
# 安装 Docker 与 Docker Compose 插件 (OpenCloudOS 9)
sudo dnf install -y dnf-utils
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker

# 进入项目目录并启动
docker compose up -d --build
```
启动后即可在浏览器访问 `http://<你的新加坡服务器IP>`！

---

### 方案 C：CLI 命令行一键拉取币安数据并回测

项目内建独立终端脚本，可直接在服务器后台自动化回测任意币对：

```bash
# 回测 BTCUSDT 1小时周期最近 500 根真实 K 线：
npx tsx scripts/run_binance_backtest.ts --symbol BTCUSDT --interval 1h --candles 500 --leverage 5

# 回测 ETHUSDT 15分钟短线周期：
npx tsx scripts/run_binance_backtest.ts --symbol ETHUSDT --interval 15m --candles 300 --leverage 10
```

---

## 🌐 新加坡节点环境优势与注意事项

1. **币安 API 直连优势**：
   - 新加坡作为全球顶级金融与数据中心枢纽，至币安全球服务器（东京/法兰克福/新加坡本地）的网络物理延迟极低（通常在 10ms ~ 60ms）；
   - 币安官方开放节点 `https://data-api.binance.vision` 与 `https://api.binance.com` 在新加坡均畅通无阻，无需任何境外代理或中转。
2. **云服务器安全组 (Tencent Cloud / AWS)**：
   - 请务必在腾讯云或其他云厂商控制台的 **【安全组 (Security Group)】** 中添加规则：**入方向放通 TCP 80 端口**（如配置 SSL 请放通 443 端口）。
