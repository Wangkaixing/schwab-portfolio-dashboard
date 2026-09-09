#!/bin/bash

set -e

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$(cd "$SOURCE_DIR/.." && pwd)/schwab-portfolio-dashboard-public"
EXPECTED_REMOTE="https://github.com/Wangkaixing/schwab-portfolio-dashboard.git"

finish() {
  if [ -t 0 ]; then
    echo
    read -r -p "按回车键关闭窗口..."
  fi
}
trap finish EXIT

if [ ! -d "$PUBLIC_DIR/.git" ]; then
  echo "未找到干净的 GitHub 仓库副本：$PUBLIC_DIR"
  exit 1
fi

ACTUAL_REMOTE=$(git -C "$PUBLIC_DIR" remote get-url origin 2>/dev/null || true)
if [ "$ACTUAL_REMOTE" != "$EXPECTED_REMOTE" ]; then
  echo "目标仓库地址不匹配，已停止更新。"
  echo "当前地址：$ACTUAL_REMOTE"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub 尚未登录，请先在终端执行：gh auth login"
  exit 1
fi

if ! git -C "$PUBLIC_DIR" diff --quiet || ! git -C "$PUBLIC_DIR" diff --cached --quiet; then
  echo "公开仓库副本存在未提交修改，已停止更新，请先处理这些修改。"
  exit 1
fi

echo "正在获取 GitHub 上的最新版本..."
git -C "$PUBLIC_DIR" pull --rebase origin main

echo "正在同步公开源代码..."
rsync -a --delete \
  --exclude='.git' \
  --exclude='.openai' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.vinext' \
  --exclude='.wrangler' \
  --exclude='app/transactions.json' \
  --exclude='public/data/transactions.json' \
  --exclude='.env*' \
  --exclude='*.pem' \
  "$SOURCE_DIR/" "$PUBLIC_DIR/"

git -C "$PUBLIC_DIR" add -A

SENSITIVE_FILES=$(git -C "$PUBLIC_DIR" diff --cached --name-only | grep -E '(^|/)(transactions.*\.json|\.env[^/]*|[^/]*\.pem)$' || true)
if [ -n "$SENSITIVE_FILES" ]; then
  git -C "$PUBLIC_DIR" reset >/dev/null
  echo "发现可能包含隐私的数据文件，已停止提交："
  echo "$SENSITIVE_FILES"
  exit 1
fi

if git -C "$PUBLIC_DIR" diff --cached --quiet; then
  echo "没有需要更新的内容。"
  exit 0
fi

COMMIT_MESSAGE="Update dashboard $(date '+%Y-%m-%d %H:%M')"
git -C "$PUBLIC_DIR" commit -m "$COMMIT_MESSAGE"
git -C "$PUBLIC_DIR" push origin main

echo "更新完成：$EXPECTED_REMOTE"
