#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ID="appgprj_6a9e535073ac8191a532ae886c62a7e8"
RESULT_FILE="$(mktemp /tmp/schwab-gpt-site-publish.XXXXXX)"

finish() {
  rm -f "$RESULT_FILE"
  if [ -t 0 ]; then
    echo
    read -r -p "按回车键关闭窗口..."
  fi
}
trap finish EXIT

cd "$PROJECT_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "未找到 Codex CLI，请先安装或打开 Codex 应用。"
  exit 1
fi

if ! codex login status 2>&1 | grep -q "Logged in"; then
  echo "Codex 尚未登录，请先在终端执行：codex login"
  exit 1
fi

if ! grep -q "\"project_id\": \"$PROJECT_ID\"" .openai/hosting.json; then
  echo "GPT Sites 项目 ID 不匹配，已停止发布。"
  exit 1
fi

echo "[1/5] 正在执行生产构建..."
npm run build

echo "[2/5] 正在暂存允许发布的源码..."
git add -u
git add \
  .env.example \
  .gitignore \
  .openai/hosting.json \
  README.md \
  app \
  components \
  hooks \
  lib \
  package.json \
  package-lock.json \
  public \
  tsconfig.json \
  一键发布到GPT站点-macOS.command

SENSITIVE_FILES="$(git diff --cached --name-only | grep -v '^\.env\.example$' | grep -E '(^|/)(Individual_.*\.json|transactions.*\.json|\.env($|\.)|.*\.pem$|delta\.jpg$)' || true)"
if [ -n "$SENSITIVE_FILES" ]; then
  git reset >/dev/null
  echo "发现可能包含隐私的数据文件，已取消暂存并停止发布："
  echo "$SENSITIVE_FILES"
  exit 1
fi

if git diff --cached -- . ':!.env.example' | grep -Eq '(FINNHUB_API_KEY|TWELVE_DATA_API_KEY)=[A-Za-z0-9_-]{12,}'; then
  git reset >/dev/null
  echo "暂存内容疑似包含 API Key，已取消暂存并停止发布。"
  exit 1
fi

if git diff --cached --quiet; then
  echo "没有新的源码修改；将检查并发布当前提交。"
else
  echo "本次将提交以下文件："
  git diff --cached --name-only
  COMMIT_MESSAGE="Update GPT Site $(date '+%Y-%m-%d %H:%M')"
  git commit -m "$COMMIT_MESSAGE"
fi

COMMIT_SHA="$(git rev-parse --verify HEAD)"
echo "[3/5] 当前提交：$COMMIT_SHA"
echo "[4/5] 正在获取短期凭证并发布 GPT Site..."

PROMPT="发布当前项目到现有 GPT Site。严格遵守以下要求：
1. 读取 .openai/hosting.json，并且只使用其中已有的 project_id ${PROJECT_ID}，禁止创建新站点。
2. 不修改任何本地源码、不创建额外提交、不改变站点访问权限或环境变量。
3. 当前 HEAD 完整 SHA 是 ${COMMIT_SHA}。创建短期 source repository write credential，将 HEAD 推送到凭证指定分支。
4. 推送成功后，用这个完整 SHA 保存 Site version。
5. 当前站点是 owner-only，使用 private deploy 发布该版本，并轮询到 succeeded 或 failed。
6. 成功时最后一行必须严格输出：PUBLISH_SUCCEEDED <站点URL>
7. 失败时最后一行必须严格输出：PUBLISH_FAILED <简短原因>"

codex exec \
  --approve-for-me \
  --ephemeral \
  -C "$PROJECT_DIR" \
  -o "$RESULT_FILE" \
  "$PROMPT"

echo "[5/5] 发布结果："
cat "$RESULT_FILE"

if ! grep -q '^PUBLISH_SUCCEEDED https://' "$RESULT_FILE"; then
  echo "未收到明确的发布成功结果，请保留当前提交并在 Codex 中检查站点状态。"
  exit 1
fi

echo "GPT 站点发布完成。"
