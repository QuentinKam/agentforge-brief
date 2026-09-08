#!/bin/bash
# AgentForge 一键启动脚本（macOS .command）
# 双击或 `bash start.command` 执行：启动后端(:3000) + 前端(:5173)
# 退出方式：聚焦终端按 Ctrl+C，会同时杀掉两个子进程

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}[AgentForge] 启动中...${NC}"
echo "项目根目录: $PROJECT_ROOT"

# 检查 .env
if [ ! -f .env ]; then
  echo -e "${RED}错误：.env 不存在。请先 cp .env.example .env 并填写 AI Provider key${NC}"
  exit 1
fi

# 检查 PG 服务
if ! pg_isready -q 2>/dev/null; then
  echo -e "${RED}错误：PostgreSQL 服务未启动。请先 brew services start postgresql@17${NC}"
  exit 1
fi

# 检查 agentforge 库
if ! psql -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw agentforge; then
  echo -e "${RED}错误：agentforge 数据库不存在。请执行：${NC}"
  echo "  psql -d postgres -c \"CREATE DATABASE agentforge;\""
  echo "  psql -d agentforge -c \"CREATE EXTENSION IF NOT EXISTS vector;\""
  exit 1
fi

# 检查依赖
if [ ! -d node_modules ]; then
  echo -e "${BLUE}[AgentForge] 安装后端依赖...${NC}"
  bun install
fi
if [ ! -d client/node_modules ]; then
  echo -e "${BLUE}[AgentForge] 安装前端依赖...${NC}"
  (cd client && bun install)
fi

# 清理函数：Ctrl+C 时杀子进程
cleanup() {
  echo ""
  echo -e "${RED}[AgentForge] 正在停止服务...${NC}"
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo -e "${GREEN}[AgentForge] 已停止${NC}"
  exit 0
}
trap cleanup INT TERM EXIT

# 启动后端
echo -e "${BLUE}[AgentForge] 启动后端 API（:3000）...${NC}"
bun run dev &
BACKEND_PID=$!

# 等后端起来
sleep 2

# 启动前端
echo -e "${BLUE}[AgentForge] 启动前端 dev server（:5173）...${NC}"
cd client && bun run dev &
FRONTEND_PID=$!
cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}[AgentForge] 启动完成${NC}"
echo -e "${GREEN}  前端：http://localhost:5173${NC}"
echo -e "${GREEN}  后端：http://localhost:3000${NC}"
echo -e "${GREEN}  健康检查：http://localhost:3000/api/health${NC}"
echo -e "${GREEN}  退出：聚焦此终端按 Ctrl+C${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 等待子进程
wait
