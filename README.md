# Schwab Portfolio Dashboard

面向嘉信交易记录的个人资产与定投看板。交易数据由用户导入并保存在当前浏览器，不随源码上传。

> “真实现金成本”和 FIFO 盈亏用于个人复盘，不能替代嘉信税务成本、1099-B 或专业税务意见。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

打开 `http://127.0.0.1:3000`，通过页面的“更新 JSON”导入嘉信交易记录。不同日期区间的文件会合并并去重。

## 行情接口配置

行情接口均由服务端路由调用，API Key 不会发送到浏览器。在 `.env.local` 中填写：

```dotenv
FINNHUB_API_KEY=你的_finnhub_api_key
TWELVE_DATA_API_KEY=你的_twelve_data_api_key
ALPACA_API_KEY_ID=你的_alpaca_api_key_id
ALPACA_API_SECRET_KEY=你的_alpaca_api_secret_key
```

### 行情源策略

“更新行情”在正常盘优先使用 Twelve Data，无法返回的标的使用 Finnhub 补齐。配置 Alpaca 后，美东时间 20:00–04:00 使用免费夜盘指示报价，盘前和盘后使用免费的延迟 SIP 报价。Finnhub Key 可在 [Finnhub Dashboard](https://finnhub.io/dashboard) 申请。

### Alpaca

用于免费的扩展时段行情。在 [Alpaca](https://app.alpaca.markets/signup) 注册并创建 Paper Trading API Key，将 Key ID 和 Secret Key 分别填入 `ALPACA_API_KEY_ID` 和 `ALPACA_API_SECRET_KEY`。

- 夜盘（20:00–04:00 ET）：实时指示性最佳买卖价中间价
- 盘前/盘后：全市场 SIP 报价，延迟约 15 分钟
- 仅在报价时间戳距当前不超过 90 分钟时覆盖普通收盘价

### Twelve Data

用于获取持仓现价、今日涨跌、报价时间，以及 Bo Pair 指标所需的历史日线。前往 [Twelve Data](https://twelvedata.com/) 创建 API Key，填入 `TWELVE_DATA_API_KEY`。

- 页面入口：“更新行情”和“更新指标”
- 项目接口：`POST /api/quotes` 和 `GET /api/pair-indicators`
- 默认计算 CGDV/QQQ、VTV/QQQ、SCHD/QQQ 与 KO/QQQ

免费套餐通常有请求频率和每日额度限制，具体以服务商当前规则为准。修改 `.env.local` 后需要重启开发服务。

## 数据与隐私

- 不要把 `.env.local`、嘉信交易 JSON 或真实 API Key 提交到公开仓库。
- 定投计划和最近一次行情结果保存在浏览器本地存储中。
- 更换浏览器、设备或域名时，本地数据不会自动迁移，请先导出需要保留的数据。

## 发布到个人 GPT Site

建议先在本地完成接口配置、导入测试数据并确认页面正常，再通过 Codex 将项目发布到自己的 GPT Site。发布时需在站点运行环境中配置所需的 Twelve Data、Finnhub 和 Alpaca 环境变量，不要将真实 Key 写入源码。

个人交易数据应在部署后的页面中自行导入，不要将交易 JSON 打包进站点或上传到 GitHub。

## 构建

```bash
npm run build
```

本项目仅供个人记录与分析，不构成投资建议。
