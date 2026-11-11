#!/usr/bin/env bash
# ==============================================================================
# Binance Futures Quant Lab & Auto Bot - OpenCloudOS 9 一键部署脚本 (Port 3000, No Docker)
# 支持系统: OpenCloudOS 9 / TencentOS / CentOS Stream 9 / RHEL 9 / Rocky Linux 9
# 运行环境: 原生 Node.js 20 LTS + PM2 守护进程 (24小时不中断自动寻优策略、自动开单平仓)
# 默认服务端口: 3000
# ==============================================================================

set -e
trap 'echo -e "\n${RED}[部署中断] 脚本在第 $LINENO 行发生异常。请查看上方错误信息。${NC}"' ERR

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

PORT=3000
APP_NAME="binance-quant-bot"

echo -e "${CYAN}=============================================================================${NC}"
echo -e "${CYAN}  🤖 币安合约多合一量化策略回测与全自动实盘机器人 - 一键原生部署${NC}"
echo -e "${CYAN}  服务端口: ${YELLOW}${PORT}${CYAN} (无需 Docker · 原生 PM2 进程守护 · 开机自启)${NC}"
echo -e "${CYAN}  系统环境: OpenCloudOS 9 (新加坡 / 全球云服务器)${NC}"
echo -e "${CYAN}=============================================================================${NC}\n"

# 1. 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[错误] 请使用 root 用户或 sudo 执行此脚本：sudo bash deploy.sh${NC}"
  exit 1
fi

# 2. 系统环境检测
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo -e "${BLUE}[1/6] 系统检测:${NC} ${PRETTY_NAME:-$NAME} (内核: $(uname -r))"
else
  echo -e "${YELLOW}[警告] 未能检测到标准 os-release，将按 RHEL/CentOS 规范执行安装${NC}"
fi

# 3. 内存与 SWAP 交换空间检查 (关键：物理内存低于 4GB 且无 SWAP 时必须创建，防止构建时 OOM 崩溃)
echo -e "\n${BLUE}[2/6] 检查服务器物理内存与 SWAP 交换空间...${NC}"
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_SWAP_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
TOTAL_SWAP_MB=$((TOTAL_SWAP_KB / 1024))

echo -e "  • 当前物理内存: ${GREEN}${TOTAL_RAM_MB} MB${NC}"
echo -e "  • 当前 SWAP 分区: ${GREEN}${TOTAL_SWAP_MB} MB${NC}"

if [ "$TOTAL_RAM_MB" -lt 4096 ] && [ "$TOTAL_SWAP_MB" -lt 1024 ]; then
  echo -e "${YELLOW}  [优化] 检测到物理内存为 ${TOTAL_RAM_MB}MB 且无足够 SWAP，正在配置 2GB SWAP 交换空间以防构建时 OOM 内存溢出...${NC}"
  if [ ! -f /swapfile ]; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    echo -e "${GREEN}  ✓ 2GB SWAP 创建并启用成功${NC}"
  elif ! swapon --show | grep -q '/swapfile'; then
    swapon /swapfile || true
    echo -e "${GREEN}  ✓ 挂载已有 SWAP 成功${NC}"
  fi
fi

# 4. 安装基础依赖、Node.js 20 LTS 与 PM2
echo -e "\n${BLUE}[3/6] 安装系统基础库、Node.js 20 LTS、PM2 与 tsx 执行引擎...${NC}"
dnf install -y curl wget git tar gcc-c++ make

NEED_NODE_INSTALL=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE_INSTALL=1
else
  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    NEED_NODE_INSTALL=1
  fi
fi

if [ "$NEED_NODE_INSTALL" -eq 1 ]; then
  echo -e "  • 正在安装 Node.js 20 LTS (NodeSource)..."
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  dnf install -y nodejs
fi

echo -e "  • Node.js: ${GREEN}$(node -v)${NC} | NPM: ${GREEN}$(npm -v)${NC}"

# 安装 PM2 和 tsx 全局工具
echo -e "  • 检查并配置全局 PM2 与 tsx 运行环境..."
npm install -g pm2 tsx --no-fund --no-audit

echo -e "  • PM2 版本: ${GREEN}$(pm2 -v)${NC}"

# 5. 编译构建与依赖安装
echo -e "\n${BLUE}[4/6] 安装项目依赖并编译生产前端资源...${NC}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo -e "  • 正在执行 npm install (优化参数防冲突与网络超时)..."
npm install --no-audit --no-fund --legacy-peer-deps
echo -e "${GREEN}  ✓ 依赖安装成功${NC}"

echo -e "  • 正在打包前端静态资源 (Vite build)..."
NODE_OPTIONS="--max-old-space-size=2048" npm run build
echo -e "${GREEN}  ✓ 前端编译打包完成${NC}"

# 6. 配置防火墙与开放 3000 端口
echo -e "\n${BLUE}[5/6] 检查防火墙并放通 ${PORT} 端口...${NC}"
if systemctl is-active --quiet firewalld; then
  firewall-cmd --zone=public --add-port=${PORT}/tcp --permanent >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  echo -e "${GREEN}  ✓ 本机 Firewalld ${PORT} 端口已放行${NC}"
else
  echo -e "  • Firewalld 未启用，跳过本机端口放通。"
fi

# 7. 通过 PM2 启动服务并设置开机自启
echo -e "\n${BLUE}[6/6] 配置 PM2 启动 24/7 量化交易守护进程...${NC}"
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true

# 清理占用 3000 端口的旧进程或冲突服务 (防止 EADDRINUSE)
echo -e "  • 检查并清理占用 ${PORT} 端口的冲突进程..."
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
OLD_PIDS=$(ss -lptn "sport = :${PORT}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
if [ -n "$OLD_PIDS" ]; then
  for pid in $OLD_PIDS; do
    kill -9 "$pid" >/dev/null 2>&1 || true
  done
fi
sleep 1

# 直接使用 tsx 启动 server.ts，避免 npm 包装层产生孤儿进程
PORT=$PORT NODE_ENV=production pm2 start ./node_modules/.bin/tsx --name "$APP_NAME" -- server.ts
pm2 save

# 设置开机自启
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# 等待 3 秒检查健康状态
sleep 3
HEALTH_CHECK=$(curl -s "http://127.0.0.1:${PORT}/api/bot/status" || echo "failed")

if [[ "$HEALTH_CHECK" == *"isRunning"* ]]; then
  echo -e "${GREEN}  ✓ 本地服务健康自检通过 (HTTP 200 OK，机器人状态正常)${NC}"
else
  echo -e "${RED}  ✕ 警告: 端口 ${PORT} 自检异常，请执行 pm2 logs ${APP_NAME} 查看详情${NC}"
fi

# 获取公网 IP
SERVER_IP=$(curl -s -4 ifconfig.me || curl -s -4 ip.sb || curl -s -4 api.ipify.org || hostname -I | awk '{print $1}')

echo -e "\n${GREEN}=============================================================================${NC}"
echo -e "${GREEN}  🎉 币安合约多合一量化策略与自动化机器人已成功部署至 OpenCloudOS 9！${NC}"
echo -e "${GREEN}=============================================================================${NC}"
echo -e "  • 控制台 Web 访问地址: ${CYAN}http://${SERVER_IP}:${PORT}${NC}"
echo -e "  • 运行模式: ${GREEN}原生 Node.js + PM2 守护 (无需 Docker，端口 ${PORT})${NC}"
echo -e "  • 核心自动化特性已就绪:"
echo -e "    1. ${MAGENTA}自动寻优最优策略${NC}: 状态机实时识别单边趋势/箱体震荡，自动锁定表现最佳策略"
echo -e "    2. ${MAGENTA}自动信号开单${NC}: 突破或均值极值触发时自动开多/开空"
echo -e "    3. ${MAGENTA}全自动平仓止盈止损${NC}: ATR 动态止损、盈亏比锁利、移动追踪、反向信号平仓"
echo -e "    4. ${MAGENTA}智能仓位管理${NC}: 动态保证金核算与最大回撤熔断保护"
echo -e "\n  • 常用管理命令:"
echo -e "    - 查看机器人实时日志: ${YELLOW}pm2 logs ${APP_NAME}${NC}"
echo -e "    - 查看运行状态:       ${YELLOW}pm2 status${NC}"
echo -e "    - 重启量化服务:       ${YELLOW}pm2 restart ${APP_NAME}${NC}"
echo -e "    - 停止量化服务:       ${YELLOW}pm2 stop ${APP_NAME}${NC}"
echo -e "\n${YELLOW}⚠️ 腾讯云/云服务商安全组提示:${NC}"
echo -e "  请确保在云厂商后台控制台【安全组】中开放入方向 ${GREEN}TCP ${PORT}${NC} 端口。"
echo -e "${GREEN}=============================================================================${NC}\n"
