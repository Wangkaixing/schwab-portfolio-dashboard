#!/bin/bash

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 Node.js。请先安装 Node.js 22 或更高版本：https://nodejs.org/"
  read -r -p "按回车键退出..."
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "当前 Node.js 版本过低，请安装 Node.js 22 或更高版本。"
  read -r -p "按回车键退出..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "首次启动，正在安装运行依赖..."
  npm ci || {
    echo "依赖安装失败，请检查网络后重试。"
    read -r -p "按回车键退出..."
    exit 1
  }
fi

echo "持仓分析看板正在启动..."
echo "关闭此窗口即可停止本地服务。"
(sleep 3 && open "http://127.0.0.1:3000") &
npm run dev -- --host 127.0.0.1

