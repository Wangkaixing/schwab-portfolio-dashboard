#!/bin/bash

cd "$(dirname "$0")" || exit 1

if [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
else
  NODE_BIN="$(command -v node)"
fi

if [ -z "$NODE_BIN" ] || [ ! -f "node_modules/vinext/dist/cli.js" ]; then
  echo "未找到已安装的运行依赖。"
  echo "请确认整个 schwab-dashboard 文件夹未被移动或删减。"
  read -r -p "按回车键退出..."
  exit 1
fi

echo "持仓分析看板正在启动..."
echo "本地地址：http://localhost:3000"
echo "关闭此窗口即可停止本地服务。"

if curl -fsS --max-time 2 "http://localhost:3000" >/dev/null 2>&1; then
  echo "检测到看板已经运行，正在打开浏览器..."
  open "http://localhost:3000"
  exit 0
fi

(
  for _ in {1..30}; do
    if curl -fsS --max-time 1 "http://localhost:3000" >/dev/null 2>&1; then
      open "http://localhost:3000"
      exit 0
    fi
    sleep 1
  done
) &

exec "$NODE_BIN" node_modules/vinext/dist/cli.js dev --hostname localhost --port 3000
