# Schwab Portfolio Dashboard

面向嘉信交易记录的个人资产与定投看板。交易数据由用户导入并保存在当前浏览器，不随源码上传。

> “真实现金成本”和 FIFO 盈亏用于个人复盘，不能替代嘉信税务成本、1099-B 或专业税务意见。
<img width="550" height="380" alt="image" src="https://github.com/user-attachments/assets/902e8cf4-0750-40b6-86e1-4daee626c612" />
<img width="550" height="380" alt="image" src="https://github.com/user-attachments/assets/37f3e5cc-28f5-479a-891b-bbffb71931bf" />

## 如果出现信息不全或者其他问题，请在本地问问聪明的codex怎么解决。

## 本地部署教程（macOS / Windows）

> 按顺序照做即可，人工或 AI agent 都适用。整个过程只需要联网一次（下载依赖），之后本地离线可用。

### 0. 前置条件：安装 Node.js 22+

本项目要求 **Node.js 22.13.0 或更高版本**（推荐 22 LTS 或 24 LTS）。先确认版本：

```bash
node -v
```

若未安装或版本低于 22.13.0：

- **macOS**：从 <https://nodejs.org> 下载 LTS 安装包，或用 Homebrew：`brew install node`
- **Windows**：从 <https://nodejs.org> 下载 LTS 安装包（`.msi`），安装时勾选“Add to PATH”

安装后重开终端，再次 `node -v` 确认。

### 1. 获取代码

```bash
git clone https://github.com/Wangkaixing/schwab-portfolio-dashboard.git
cd schwab-portfolio-dashboard
```

（若下载的是压缩包，解压后 `cd` 进入整个文件夹即可，不要移动或删减其中文件。）

### 2. 安装依赖

```bash
npm ci
```

- 这一步会下载一个较大的 Cloudflare `workerd` 运行时二进制（约 66 MB）。**网络较差时容易在此中断**。
- 仓库已内置 `.npmrc`（自动加大重试次数与超时），大多数情况能自动重试成功。
- 如果仍然失败（常见报错 `ECONNRESET` / `network aborted`），**直接重跑 `npm ci` 即可**。注意 `npm ci` 失败会回滚删除 `node_modules`，所以“看起来装了一半又没了”是正常现象，重跑就好。换用稳定网络或代理会更顺利。

### 3. 配置环境变量文件

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
copy .env.example .env.local
```

行情 API Key 是**可选**的：不填也能启动看板并导入、查看交易数据，只是“更新行情/更新指标”两个按钮拉不到数据。如何申请见下方 [行情接口配置](#行情接口配置)。

### 4. 启动看板

```bash
npm run dev
```

看到如下输出即为成功：

```
  ➜  Local:   http://127.0.0.1:3000/
```

浏览器打开 **<http://127.0.0.1:3000>**，通过页面的“更新 JSON”导入嘉信交易记录（不同日期区间的文件会自动合并并去重）。按 `Ctrl + C` 停止服务。

macOS 用户也可直接双击项目里的 `直接启动看板-macOS.command`，Windows 用户双击 `启动看板-Windows.bat`，脚本会自动装依赖并打开浏览器。

### 常见问题排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `sh: vinext: command not found` | 依赖没装好或 `node_modules` 被回滚删除 | 重新执行 `npm ci`，成功后再 `npm run dev` |
| `npm ci` 报 `ECONNRESET` / `network aborted` | 下载 workerd 二进制时网络中断 | 换稳定网络/代理后重跑 `npm ci`（仓库已配置自动重试） |
| `Could not resolve './.openai/hosting.json'` | 该文件由部署工具生成，本地缺失 | 已在 `vite.config.ts` 内置缺省回退，更新到最新代码即可；无需手动创建 |
| 浏览器打不开 / 端口不是 3000 | 旧版 `dev` 脚本未固定端口 | 最新 `package.json` 已固定 `127.0.0.1:3000`；确认代码为最新 |
| 端口 3000 被占用 | 已有程序在用 3000 | 关掉占用程序，或用 `npm run dev -- --port 3001` 换端口 |

## 行情接口配置

两个行情接口均由服务端路由调用，API Key 不会发送到浏览器。在 `.env.local` 中填写：

```dotenv
FINNHUB_API_KEY=你的_finnhub_api_key
TWELVE_DATA_API_KEY=你的_twelve_data_api_key
```

### 行情源策略

“更新行情”优先使用 Twelve Data 获取现价、今日涨跌和报价时间；Twelve Data 请求失败或缺少标的时，再由 Finnhub 自动补齐。两个 Key 都配置时覆盖率最佳。行情只在手动点击时请求，不进行后台轮询。

- Finnhub Key：[Finnhub Dashboard](https://finnhub.io/dashboard)
- 行情接口：`POST /api/quotes`，请求体示例：`{"symbols":["QLD","IBIT","CGDV"]}`
- 页面“更多 → 行情设置”只显示配置状态，不读取或展示真实 Key

### Twelve Data

同时用于现价行情与 Bo Pair 指标所需的历史日线。前往 [Twelve Data](https://twelvedata.com/) 创建 API Key，填入 `TWELVE_DATA_API_KEY`。

- 页面入口：“更新行情”和“更新指标”
- 项目接口：`POST /api/quotes` 和 `GET /api/pair-indicators`
- 默认计算 CGDV/QQQ、VTV/QQQ、SCHD/QQQ 与 KO/QQQ

免费套餐通常有请求频率和每日额度限制，具体以服务商当前规则为准。修改 `.env.local` 后需要重启开发服务。

## 数据与隐私

- 不要把 `.env.local`、嘉信交易 JSON 或真实 API Key 提交到公开仓库。
- 定投计划和最近一次行情结果保存在浏览器本地存储中。
- 更换浏览器、设备或域名时，本地数据不会自动迁移，请先导出需要保留的数据。

## 发布到个人 GPT Site

建议先在本地完成接口配置、导入测试数据并确认页面正常，再通过 Codex 将项目发布到自己的 GPT Site。发布时需在站点运行环境中配置同名的 `FINNHUB_API_KEY` 和 `TWELVE_DATA_API_KEY`，不要将真实 Key 写入源码。

个人交易数据应在部署后的页面中自行导入，不要将交易 JSON 打包进站点或上传到 GitHub。

## 构建

```bash
npm run build
```

本项目仅供个人记录与分析，不构成投资建议。
