export type IndustryTheme =
  | '大型科技'
  | '半导体产业链'
  | '存储与内存'
  | '大盘指数'
  | '红利与价值'
  | '金融服务'
  | '工业制造'
  | '医疗健康'
  | '数字资产'
  | '现金管理'
  | '多元配置'
  | '其他';

// 明确的代码映射优先于名称关键词。新增标的时优先维护这里。
export const SYMBOL_THEMES: Record<string, IndustryTheme> = {
  // 科技龙头与科技 ETF
  QLD: '大型科技',
  QQQ: '大型科技',
  QQQM: '大型科技',
  VGT: '大型科技',
  XLK: '大型科技',
  FTEC: '大型科技',
  IYW: '大型科技',
  IGV: '大型科技',
  SKYY: '大型科技',
  CLOU: '大型科技',
  AIQ: '大型科技',
  BOTZ: '大型科技',
  ARKK: '大型科技',
  AAPL: '大型科技',
  MSFT: '大型科技',
  GOOG: '大型科技',
  GOOGL: '大型科技',
  AMZN: '大型科技',
  META: '大型科技',
  TSLA: '大型科技',
  NFLX: '大型科技',
  ORCL: '大型科技',
  CRM: '大型科技',
  ADBE: '大型科技',
  NOW: '大型科技',
  PLTR: '大型科技',

  // 半导体产业链个股与 ETF
  SOXL: '半导体产业链',
  SMH: '半导体产业链',
  SOXX: '半导体产业链',
  SOXQ: '半导体产业链',
  XSD: '半导体产业链',
  PSI: '半导体产业链',
  FTXL: '半导体产业链',
  USD: '半导体产业链',
  NVDA: '半导体产业链',
  AMD: '半导体产业链',
  AVGO: '半导体产业链',
  INTC: '半导体产业链',
  QCOM: '半导体产业链',
  TXN: '半导体产业链',
  AMAT: '半导体产业链',
  LRCX: '半导体产业链',
  KLAC: '半导体产业链',
  ASML: '半导体产业链',
  ARM: '半导体产业链',
  MRVL: '半导体产业链',
  TSM: '半导体产业链',

  // 存储、内存与数据存储
  SKUU: '存储与内存',
  RAM: '存储与内存',
  MU: '存储与内存',
  WDC: '存储与内存',
  STX: '存储与内存',
  PSTG: '存储与内存',
  NTAP: '存储与内存',

  // 美国主要宽基指数 ETF
  SPY: '大盘指数',
  VOO: '大盘指数',
  IVV: '大盘指数',
  SPLG: '大盘指数',
  SCHX: '大盘指数',
  VV: '大盘指数',
  VTI: '大盘指数',
  ITOT: '大盘指数',
  SCHB: '大盘指数',
  DIA: '大盘指数',
  IWM: '大盘指数',

  CGDV: '红利与价值',
  SCHD: '红利与价值',
  IBIT: '数字资产',
  SGOV: '现金管理',
};

export const THEME_COLORS: Record<IndustryTheme, string> = {
  现金管理: '#b58a6a',
  红利与价值: '#5b9673',
  多元配置: '#71869b',
  大盘指数: '#5275ad',
  金融服务: '#557f91',
  工业制造: '#c28a42',
  医疗健康: '#bf6575',
  大型科技: '#6d5fc7',
  半导体产业链: '#df7841',
  存储与内存: '#d35570',
  数字资产: '#c83f55',
  其他: '#8995a1',
};

export function classifyIndustry(
  symbol: string,
  description = '',
): IndustryTheme {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (SYMBOL_THEMES[normalizedSymbol]) return SYMBOL_THEMES[normalizedSymbol];

  const text = `${normalizedSymbol} ${description}`.toUpperCase();
  if (/DRAM|NAND|MEMORY|SK ?HYNIX|MICRON/.test(text)) return '存储与内存';
  if (/SEMICONDUCTOR|CHIP|FOUNDRY/.test(text)) return '半导体产业链';
  if (/NASDAQ|QQQ|SOFTWARE|CLOUD|TECHNOLOGY/.test(text)) return '大型科技';
  if (/S&P ?500|RUSSELL|DOW JONES|TOTAL (STOCK )?MARKET|LARGE CAP/.test(text))
    return '大盘指数';
  if (/DIVIDEND|VALUE|QUALITY/.test(text)) return '红利与价值';
  if (/BANK|FINANCIAL|INSURANCE|BROKER/.test(text)) return '金融服务';
  if (/INDUSTRIAL|MANUFACTUR|AEROSPACE|MACHINERY/.test(text))
    return '工业制造';
  if (/HEALTH|BIOTECH|PHARMA|MEDICAL/.test(text)) return '医疗健康';
  if (/BITCOIN|CRYPTO|ETHEREUM/.test(text)) return '数字资产';
  if (/TREASURY|T-BILL|SHORT.*BOND|MONEY MARKET/.test(text))
    return '现金管理';
  if (/BALANCED|ALLOCATION/.test(text)) return '多元配置';
  return '其他';
}
