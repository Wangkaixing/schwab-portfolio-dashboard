'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaChart,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronsUpDown,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  FileJson,
  Moon,
  RefreshCcw,
  Search,
  Sun,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Transaction = {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  'Fees & Comm': string;
  Amount: string;
  AcctgRuleCd?: string;
};
type SchwabExport = {
  FromDate: string;
  ToDate: string;
  TotalTransactionsAmount?: string;
  TotalFeesAndCommAmount?: string;
  BrokerageTransactions: Transaction[];
};
type RememberedImport = {
  data: SchwabExport;
  fileName: string;
  importedAt: string;
};
type SortKey = keyof Transaction;
type SortDirection = 'asc' | 'desc';
type IndustryTheme =
  | '大型科技'
  | '半导体产业链'
  | '存储与内存'
  | '红利与价值'
  | '金融服务'
  | '工业制造'
  | '医疗健康'
  | '数字资产'
  | '现金管理'
  | '多元配置'
  | '其他';

const COLORS = {
  buy: '#0066cc',
  sell: '#15966b',
  transfer: '#6c63d9',
  fee: '#d17b21',
};
const ACTION_LABELS: Record<string, string> = {
  Buy: '买入',
  Sell: '卖出',
  'Wire Received': '汇款到账',
  'MoneyLink Transfer': '转账到账',
};
const SYMBOL_THEMES: Record<string, IndustryTheme> = {
  QLD: '大型科技',
  SOXL: '半导体产业链',
  SMH: '半导体产业链',
  TSM: '半导体产业链',
  SKUU: '存储与内存',
  RAM: '存储与内存',
  SCHD: '红利与价值',
  IBIT: '数字资产',
  SGOV: '现金管理',
};
const THEME_COLORS: Record<IndustryTheme, string> = {
  大型科技: '#0066cc',
  半导体产业链: '#159ba6',
  存储与内存: '#6c63d9',
  红利与价值: '#15966b',
  金融服务: '#4c7a91',
  工业制造: '#d17b21',
  医疗健康: '#c94c67',
  数字资产: '#e05a33',
  现金管理: '#b88b16',
  多元配置: '#71869b',
  其他: '#8a97a5',
};
const PAGE_SIZE = 8;
const LAST_IMPORT_KEY = 'schwab-dashboard:last-json-import';

function isSchwabExport(value: unknown): value is SchwabExport {
  const candidate = value as Partial<SchwabExport> | null;
  return Boolean(
    candidate?.FromDate &&
      candidate?.ToDate &&
      Array.isArray(candidate?.BrokerageTransactions),
  );
}

function rememberImport(
  data: SchwabExport,
  fileName: string,
  importedAt: string,
) {
  try {
    localStorage.setItem(
      LAST_IMPORT_KEY,
      JSON.stringify({ data, fileName, importedAt } satisfies RememberedImport),
    );
  } catch {
    // The dashboard remains usable when browser storage is unavailable or full.
  }
}

function numberFrom(value = '') {
  const negative =
    value.includes('-') || (value.startsWith('(') && value.endsWith(')'));
  const parsed = Number(value.replace(/[$,()\-]/g, '')) || 0;
  return negative ? -parsed : parsed;
}
function dateKey(value: string) {
  const [m, d, y] = value.slice(0, 10).split('/');
  return `${y}-${m}-${d}`;
}
function firstTransactionDate(data: SchwabExport) {
  const first = data.BrokerageTransactions.reduce<string | null>((earliest, row) => {
    if (!row.Date) return earliest;
    const day = dateKey(row.Date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return earliest;
    return earliest === null || day < earliest ? day : earliest;
  }, null);
  return first ?? dateKey(data.FromDate);
}
function emptySchwabExport(): SchwabExport {
  const now = new Date();
  const day = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  return {
    FromDate: day,
    ToDate: day,
    TotalTransactionsAmount: '$0.00',
    TotalFeesAndCommAmount: '$0.00',
    BrokerageTransactions: [],
  };
}
function transactionFingerprint(row: Transaction) {
  return JSON.stringify([
    row.Date,
    row.Action,
    row.Symbol,
    row.Description,
    row.Quantity,
    row.Price,
    row['Fees & Comm'],
    row.Amount,
    row.AcctgRuleCd ?? '',
  ]);
}
function schwabDateFromKey(value: string) {
  const [year, month, day] = value.split('-');
  return `${month}/${day}/${year}`;
}
function mergeSchwabExports(
  current: SchwabExport,
  incoming: SchwabExport,
): SchwabExport {
  const currentCounts = new Map<string, number>();
  current.BrokerageTransactions.forEach((row) => {
    const key = transactionFingerprint(row);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  });
  const incomingCounts = new Map<string, number>();
  const additions: Transaction[] = [];
  incoming.BrokerageTransactions.forEach((row) => {
    const key = transactionFingerprint(row);
    const occurrence = (incomingCounts.get(key) ?? 0) + 1;
    incomingCounts.set(key, occurrence);
    if (occurrence > (currentCounts.get(key) ?? 0)) additions.push(row);
  });
  const transactions = [...current.BrokerageTransactions, ...additions].sort(
    (a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime(),
  );
  const dateKeys = transactions
    .map((row) => (row.Date ? dateKey(row.Date) : ''))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();
  const totalAmount = transactions.reduce(
    (sum, row) => sum + numberFrom(row.Amount),
    0,
  );
  const totalFees = transactions.reduce(
    (sum, row) => sum + numberFrom(row['Fees & Comm']),
    0,
  );
  return {
    ...current,
    ...incoming,
    FromDate: dateKeys[0]
      ? schwabDateFromKey(dateKeys[0])
      : incoming.FromDate,
    ToDate: dateKeys.at(-1)
      ? schwabDateFromKey(dateKeys.at(-1)!)
      : incoming.ToDate,
    TotalTransactionsAmount: `$${totalAmount.toFixed(2)}`,
    TotalFeesAndCommAmount: `$${totalFees.toFixed(2)}`,
    BrokerageTransactions: transactions,
  };
}
function displayDate(value: string) {
  const [m, d, y] = value.slice(0, 10).split('/');
  return `${y}.${m}.${d}`;
}
function money(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
const MASKED_VALUE = '****';
function compactMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 1,
  }).format(value);
}
function actionKind(action: string) {
  return action === 'Buy' ? 'buy' : action === 'Sell' ? 'sell' : 'transfer';
}
function isAnomaly(row: Transaction) {
  return (
    !row.Date ||
    !row.Action ||
    !row.Amount ||
    ((row.Action === 'Buy' || row.Action === 'Sell') &&
      (!row.Symbol || !row.Quantity || !row.Price))
  );
}
function empty(value: string | undefined) {
  return value || '—';
}
function classifyIndustry(symbol: string, description = ''): IndustryTheme {
  if (SYMBOL_THEMES[symbol]) return SYMBOL_THEMES[symbol];
  const text = `${symbol} ${description}`.toUpperCase();
  if (/DRAM|NAND|MEMORY|SK ?HYNIX|MICRON/.test(text)) return '存储与内存';
  if (/SEMICONDUCTOR|CHIP|FOUNDRY/.test(text)) return '半导体产业链';
  if (/NASDAQ|QQQ|SOFTWARE|CLOUD|TECHNOLOGY/.test(text)) return '大型科技';
  if (/DIVIDEND|VALUE|QUALITY/.test(text)) return '红利与价值';
  if (/BANK|FINANCIAL|INSURANCE|BROKER/.test(text)) return '金融服务';
  if (/INDUSTRIAL|MANUFACTUR|AEROSPACE|MACHINERY/.test(text)) return '工业制造';
  if (/HEALTH|BIOTECH|PHARMA|MEDICAL/.test(text)) return '医疗健康';
  if (/BITCOIN|CRYPTO|ETHEREUM/.test(text)) return '数字资产';
  if (/TREASURY|T-BILL|SHORT.*BOND|MONEY MARKET/.test(text)) return '现金管理';
  if (/S&P|TOTAL MARKET|BALANCED|ALLOCATION/.test(text)) return '多元配置';
  return '其他';
}

function actionStats(rows: Transaction[]) {
  const buyRows = rows.filter((r) => r.Action === 'Buy');
  const sellRows = rows.filter((r) => r.Action === 'Sell');
  const inflowRows = rows.filter(
    (r) => r.Action === 'Wire Received' || r.Action === 'MoneyLink Transfer',
  );
  const buyAmount = buyRows.reduce(
    (s, r) => s + Math.abs(numberFrom(r.Amount)),
    0,
  );
  const sellAmount = sellRows.reduce(
    (s, r) => s + Math.abs(numberFrom(r.Amount)),
    0,
  );
  const inflow = inflowRows.reduce((s, r) => s + numberFrom(r.Amount), 0);
  const fees = rows.reduce((s, r) => s + numberFrom(r['Fees & Comm']), 0);
  const net = rows.reduce((s, r) => s + numberFrom(r.Amount), 0);
  const symbols = new Set(rows.map((r) => r.Symbol).filter(Boolean)).size;
  return { buyAmount, sellAmount, inflow, fees, net, symbols };
}

function symbolStats(rows: Transaction[]) {
  const map = new Map<
    string,
    {
      symbol: string;
      description: string;
      buyQty: number;
      sellQty: number;
      buyAmount: number;
      sellAmount: number;
      buyPriceValue: number;
      sellPriceValue: number;
      trades: number;
    }
  >();
  for (const row of rows) {
    if (!row.Symbol) continue;
    const item = map.get(row.Symbol) ?? {
      symbol: row.Symbol,
      description: row.Description,
      buyQty: 0,
      sellQty: 0,
      buyAmount: 0,
      sellAmount: 0,
      buyPriceValue: 0,
      sellPriceValue: 0,
      trades: 0,
    };
    const quantity = numberFrom(row.Quantity);
    const price = numberFrom(row.Price);
    if (row.Action === 'Buy') {
      item.buyQty += quantity;
      item.buyAmount += Math.abs(numberFrom(row.Amount));
      item.buyPriceValue += quantity * price;
    }
    if (row.Action === 'Sell') {
      item.sellQty += quantity;
      item.sellAmount += Math.abs(numberFrom(row.Amount));
      item.sellPriceValue += quantity * price;
    }
    item.trades += 1;
    map.set(row.Symbol, item);
  }
  return [...map.values()]
    .map((item) => ({
      ...item,
      turnover: item.buyAmount + item.sellAmount,
      netQty: item.buyQty - item.sellQty,
      avgBuy: item.buyQty ? item.buyPriceValue / item.buyQty : 0,
      avgSell: item.sellQty ? item.sellPriceValue / item.sellQty : 0,
      cashDifference: item.sellAmount - item.buyAmount,
    }))
    .sort((a, b) => b.turnover - a.turnover);
}

function portfolioLedger(rows: Transaction[]) {
  const lots = new Map<
    string,
    { quantity: number; cashCostPerShare: number; description: string }[]
  >();
  const realized = new Map<
    string,
    {
      symbol: string;
      description: string;
      quantity: number;
      proceeds: number;
      matchedCost: number;
      trades: number;
    }
  >();
  let incomplete = false;
  for (const row of [...rows].reverse()) {
    if (!row.Symbol) continue;
    const quantity = numberFrom(row.Quantity);
    if (row.Action === 'Buy') {
      const current = lots.get(row.Symbol) ?? [];
      const cashPaid = Math.abs(numberFrom(row.Amount));
      const executionPrice = numberFrom(row.Price);
      current.push({
        quantity,
        cashCostPerShare: quantity
          ? cashPaid > 0
            ? cashPaid / quantity
            : executionPrice
          : 0,
        description: row.Description,
      });
      lots.set(row.Symbol, current);
    } else if (row.Action === 'Sell') {
      let remaining = quantity;
      let matchedQuantity = 0;
      let matchedCost = 0;
      const cashReceived = Math.abs(numberFrom(row.Amount));
      const proceedsPerShare = quantity
        ? cashReceived > 0
          ? cashReceived / quantity
          : numberFrom(row.Price)
        : 0;
      const current = lots.get(row.Symbol) ?? [];
      while (remaining > 0.000001 && current.length) {
        const used = Math.min(remaining, current[0].quantity);
        matchedQuantity += used;
        matchedCost += used * current[0].cashCostPerShare;
        current[0].quantity -= used;
        remaining -= used;
        if (current[0].quantity < 0.000001) current.shift();
      }
      if (remaining > 0.000001) incomplete = true;
      lots.set(row.Symbol, current);
      if (matchedQuantity > 0) {
        const item = realized.get(row.Symbol) ?? {
          symbol: row.Symbol,
          description: row.Description,
          quantity: 0,
          proceeds: 0,
          matchedCost: 0,
          trades: 0,
        };
        item.quantity += matchedQuantity;
        item.proceeds += matchedQuantity * proceedsPerShare;
        item.matchedCost += matchedCost;
        item.trades += 1;
        realized.set(row.Symbol, item);
      }
    }
  }
  const positions = [...lots.entries()]
    .map(([symbol, entries]) => {
      const quantity = entries.reduce((sum, lot) => sum + lot.quantity, 0);
      const cost = entries.reduce(
        (sum, lot) => sum + lot.quantity * lot.cashCostPerShare,
        0,
      );
      return {
        symbol,
        quantity,
        cost,
        averageCost: quantity ? cost / quantity : 0,
        description: entries[0]?.description ?? '',
      };
    })
    .filter((item) => item.quantity > 0.000001)
    .sort((a, b) => b.cost - a.cost);
  const realizedPositions = [...realized.values()]
    .map((item) => ({
      ...item,
      pnl: item.proceeds - item.matchedCost,
      returnRate: item.matchedCost
        ? (item.proceeds - item.matchedCost) / item.matchedCost
        : 0,
    }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  return {
    positions,
    totalCost: positions.reduce((sum, item) => sum + item.cost, 0),
    realizedPositions,
    totalRealizedPnl: realizedPositions.reduce(
      (sum, item) => sum + item.pnl,
      0,
    ),
    totalRealizedProceeds: realizedPositions.reduce(
      (sum, item) => sum + item.proceeds,
      0,
    ),
    incomplete,
  };
}

function dailyStats(rows: Transaction[]) {
  const byDay = new Map<
    string,
    { date: string; buy: number; sell: number; transfer: number; net: number }
  >();
  for (const row of rows) {
    const key = dateKey(row.Date);
    const day = byDay.get(key) ?? {
      date: key,
      buy: 0,
      sell: 0,
      transfer: 0,
      net: 0,
    };
    const amount = numberFrom(row.Amount);
    if (row.Action === 'Buy') day.buy += amount;
    else if (row.Action === 'Sell') day.sell += amount;
    else day.transfer += amount;
    day.net += amount;
    byDay.set(key, day);
  }
  let cumulative = 0;
  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ ...day, cumulative: (cumulative += day.net) }));
}

function ChartTooltip({
  active,
  payload,
  label,
  masked = false,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  masked?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div key={item.name}>
          <i style={{ background: item.color }} />
          {item.name}
          <span>{masked ? MASKED_VALUE : money(item.value, 2)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const initial = useMemo(() => emptySchwabExport(), []);
  const [data, setData] = useState<SchwabExport>(initial);
  const [fileName, setFileName] = useState('暂无已保存 JSON');
  const [lastUpdated, setLastUpdated] = useState('尚未导入');
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const [amountsMasked, setAmountsMasked] = useState(false);
  const [startDate, setStartDate] = useState(firstTransactionDate(initial));
  const [endDate, setEndDate] = useState(dateKey(initial.ToDate));
  const [action, setAction] = useState('all');
  const [symbol, setSymbol] = useState('all');
  const [query, setQuery] = useState('');
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [excludedIndustries, setExcludedIndustries] = useState<
    Set<IndustryTheme>
  >(new Set());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'Date',
    direction: 'desc',
  });
  const [selected, setSelected] = useState<Transaction | null>(null);
  const viewFileInput = useRef<HTMLInputElement>(null);
  const updateFileInput = useRef<HTMLInputElement>(null);
  const maintainedDataRef = useRef<SchwabExport>(initial);
  const [maintainedCount, setMaintainedCount] = useState(0);
  const displayMoney = (value: number, digits = 0) =>
    amountsMasked ? MASKED_VALUE : money(value, digits);
  const displayRawMoney = (value: string) =>
    amountsMasked && value ? MASKED_VALUE : empty(value);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_IMPORT_KEY);
      if (!raw) return;
      const remembered = JSON.parse(raw) as Partial<RememberedImport>;
      if (!isSchwabExport(remembered.data)) {
        localStorage.removeItem(LAST_IMPORT_KEY);
        return;
      }
      maintainedDataRef.current = remembered.data;
      setMaintainedCount(remembered.data.BrokerageTransactions.length);
      setData(remembered.data);
      setFileName(remembered.fileName || '上次导入数据');
      setLastUpdated(remembered.importedAt || '上次导入');
      setStartDate(firstTransactionDate(remembered.data));
      setEndDate(dateKey(remembered.data.ToDate));
      setExcludedIndustries(new Set());
      setPage(1);
    } catch {
      // Ignore invalid or unavailable browser storage.
    }
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Record<string, unknown>,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'load_schwab_transactions',
          title: '合并嘉信交易记录',
          description:
            '将已解析的嘉信交易 JSON 与当前本地记录取并集并刷新所有统计。',
          inputSchema: {
            type: 'object',
            properties: {
              data: { type: 'object' },
              fileName: { type: 'string' },
            },
            required: ['data'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: (input: unknown) => {
            const payload = input as { data?: SchwabExport; fileName?: string };
            const next = payload.data;
            if (!isSchwabExport(next))
              throw new Error('文件结构不符合嘉信交易导出格式');
            const nextFileName = payload.fileName || '智能助手导入';
            const importedAt = new Intl.DateTimeFormat('zh-CN', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date());
            const merged = mergeSchwabExports(maintainedDataRef.current, next);
            const addedCount =
              merged.BrokerageTransactions.length -
              maintainedDataRef.current.BrokerageTransactions.length;
            maintainedDataRef.current = merged;
            setMaintainedCount(merged.BrokerageTransactions.length);
            setData(merged);
            setFileName(`累计数据 · ${nextFileName}`);
            setLastUpdated(importedAt);
            setStartDate(firstTransactionDate(merged));
            setEndDate(dateKey(merged.ToDate));
            setAction('all');
            setSymbol('all');
            setQuery('');
            setOnlyAnomalies(false);
            setExcludedIndustries(new Set());
            setPage(1);
            setError('');
            rememberImport(merged, `累计数据 · ${nextFileName}`, importedAt);
            return {
              addedCount,
              transactionCount: merged.BrokerageTransactions.length,
              fromDate: merged.FromDate,
              toDate: merged.ToDate,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const allSymbols = useMemo(
    () =>
      [
        ...new Set(
          data.BrokerageTransactions.map((r) => r.Symbol).filter(Boolean),
        ),
      ].sort(),
    [data],
  );
  const filtered = useMemo(
    () =>
      data.BrokerageTransactions.filter((row) => {
        const day = dateKey(row.Date);
        const text =
          `${row.Symbol} ${row.Description} ${row.Action} ${row.Date}`.toLowerCase();
        const actionMatches =
          action === 'all' ||
          (action === 'inflow'
            ? row.Action === 'Wire Received' ||
              row.Action === 'MoneyLink Transfer'
            : row.Action === action);
        return (
          day >= startDate &&
          day <= endDate &&
          actionMatches &&
          (symbol === 'all' || row.Symbol === symbol) &&
          (!query || text.includes(query.toLowerCase())) &&
          (!onlyAnomalies || isAnomaly(row))
        );
      }),
    [data, startDate, endDate, action, symbol, query, onlyAnomalies],
  );
  const stats = useMemo(() => actionStats(filtered), [filtered]);
  const allStats = useMemo(
    () => actionStats(data.BrokerageTransactions),
    [data],
  );
  const symbols = useMemo(() => symbolStats(filtered), [filtered]);
  const holdings = useMemo(
    () => portfolioLedger(data.BrokerageTransactions),
    [data],
  );
  const daily = useMemo(() => dailyStats(filtered), [filtered]);
  const typedHoldings = useMemo(
    () =>
      holdings.positions.map((item) => ({
        ...item,
        industryTheme: classifyIndustry(item.symbol, item.description),
      })),
    [holdings],
  );
  const industryData = useMemo(() => {
    const totals = new Map<IndustryTheme, number>();
    typedHoldings.forEach((item) =>
      totals.set(
        item.industryTheme,
        (totals.get(item.industryTheme) ?? 0) + item.cost,
      ),
    );
    return [...totals.entries()]
      .map(([name, value]) => ({ name, value, color: THEME_COLORS[name] }))
      .sort((a, b) => b.value - a.value);
  }, [typedHoldings]);
  const displayedIndustryData = useMemo(
    () =>
      industryData.filter((item) => !excludedIndustries.has(item.name)),
    [industryData, excludedIndustries],
  );
  const displayedIndustryCost = useMemo(
    () => displayedIndustryData.reduce((sum, item) => sum + item.value, 0),
    [displayedIndustryData],
  );
  const holdingCostData = useMemo(
    () =>
      typedHoldings.map((item) => ({
        symbol: item.symbol,
        cost: item.cost,
        color: THEME_COLORS[item.industryTheme],
      })),
    [typedHoldings],
  );
  const sortedRows = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const numeric = new Set<SortKey>([
          'Quantity',
          'Price',
          'Fees & Comm',
          'Amount',
        ]);
        const av =
          sort.key === 'Date'
            ? dateKey(a.Date)
            : numeric.has(sort.key)
              ? numberFrom(a[sort.key])
              : a[sort.key];
        const bv =
          sort.key === 'Date'
            ? dateKey(b.Date)
            : numeric.has(sort.key)
              ? numberFrom(b[sort.key])
              : b[sort.key];
        return (
          (av < bv ? -1 : av > bv ? 1 : 0) * (sort.direction === 'asc' ? 1 : -1)
        );
      }),
    [filtered, sort],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  function showData(next: SchwabExport, nextFileName: string, updatedAt: string) {
    setData(next);
    setFileName(nextFileName);
    setLastUpdated(updatedAt);
    setStartDate(firstTransactionDate(next));
    setEndDate(dateKey(next.ToDate));
    setAction('all');
    setSymbol('all');
    setQuery('');
    setOnlyAnomalies(false);
    setExcludedIndustries(new Set());
    setPage(1);
    setError('');
  }
  async function viewFile(file: File) {
    try {
      const next = JSON.parse(await file.text()) as unknown;
      if (!isSchwabExport(next))
        throw new Error('文件结构不符合嘉信交易导出格式');
      const viewedAt = new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      showData(next, `临时查看 · ${file.name}`, viewedAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文件无法读取');
    }
  }
  async function updateFile(file: File) {
    try {
      const next = JSON.parse(await file.text()) as unknown;
      if (!isSchwabExport(next))
        throw new Error('文件结构不符合嘉信交易导出格式');
      const importedAt = new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      const merged = mergeSchwabExports(maintainedDataRef.current, next);
      maintainedDataRef.current = merged;
      setMaintainedCount(merged.BrokerageTransactions.length);
      showData(merged, `维护数据 · ${file.name}`, importedAt);
      rememberImport(merged, `维护数据 · ${file.name}`, importedAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文件无法读取');
    }
  }
  async function importForView(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await viewFile(file);
    event.target.value = '';
  }
  async function importForUpdate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await updateFile(file);
    event.target.value = '';
  }
  function resetFilters() {
    setStartDate(firstTransactionDate(data));
    setEndDate(dateKey(data.ToDate));
    setAction('all');
    setSymbol('all');
    setQuery('');
    setOnlyAnomalies(false);
    setExcludedIndustries(new Set());
    setPage(1);
  }
  function clearJsonRecords() {
    const emptyData = emptySchwabExport();
    const clearedAt = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    maintainedDataRef.current = emptyData;
    setMaintainedCount(0);
    setData(emptyData);
    setFileName('暂无已保存 JSON');
    setLastUpdated(clearedAt);
    setStartDate(firstTransactionDate(emptyData));
    setEndDate(dateKey(emptyData.ToDate));
    setAction('all');
    setSymbol('all');
    setQuery('');
    setOnlyAnomalies(false);
    setExcludedIndustries(new Set());
    setPage(1);
    setError('');
    try {
      localStorage.removeItem(LAST_IMPORT_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
  }
  function exportMaintainedJson() {
    const blob = new Blob(
      [JSON.stringify(maintainedDataRef.current, null, 2)],
      { type: 'application/json;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schwab-maintained-transactions-${dateKey(new Date().toISOString())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportPagePdf() {
    const previousTitle = document.title;
    const rangeStart = startDate || firstTransactionDate(data);
    const rangeEnd = endDate || dateKey(data.ToDate);
    document.title = `持仓分析看板_${rangeStart}_至_${rangeEnd}`;
    const restoreTitle = () => {
      document.title = previousTitle;
    };
    window.addEventListener('afterprint', restoreTitle, { once: true });
    window.print();
  }
  function updateSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  }
  const sortHead = (key: SortKey, label: string) => (
    <button className="sort-button" onClick={() => updateSort(key)}>
      {label}
      <ChevronsUpDown size={13} />
    </button>
  );

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <div className="identity">
          <span className="logo">
            <img src="/schwab-favicon.png" alt="" />
          </span>
          <div>
            <strong>持仓分析看板</strong>
            <small>Portfolio Transaction Analytics</small>
          </div>
        </div>
        <div className="period">
          <span>统计周期</span>
          <strong>
            {displayDate(data.FromDate)} — {displayDate(data.ToDate)}
          </strong>
        </div>
        <div className="top-actions">
          <span className="updated">更新：{lastUpdated}</span>
          <input
            ref={viewFileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importForView}
          />
          <input
            ref={updateFileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importForUpdate}
          />
          <Button
            variant="outline"
            onClick={() => viewFileInput.current?.click()}
          >
            <Upload />
            上传 JSON
          </Button>
          <Button
            variant="outline"
            onClick={() => updateFileInput.current?.click()}
          >
            <RefreshCcw />
            更新 JSON
          </Button>
          <Button
            variant="outline"
            onClick={exportMaintainedJson}
            disabled={maintainedCount === 0}
          >
            <FileJson />
            导出 JSON
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline">
                  <Trash2 />
                  清空 JSON
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认清空全部 JSON 记录？</AlertDialogTitle>
                <AlertDialogDescription>
                  这会删除当前浏览器中保存的全部交易记录，操作无法撤销。之后仍可重新上传 JSON。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={clearJsonRecords}
                >
                  确认清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={exportPagePdf}>
            <Download />
            导出页面 PDF
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={amountsMasked ? '显示金额' : '隐藏金额'}
            title={amountsMasked ? '显示金额' : '隐藏金额'}
            aria-pressed={amountsMasked}
            onClick={() => setAmountsMasked((value) => !value)}
          >
            {amountsMasked ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="切换主题"
            onClick={() => setDark((v) => !v)}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <section className="content">
        <div
          className="data-row drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void viewFile(file);
          }}
        >
          <div>
            <span className="status-dot" />
            <strong>{fileName}</strong>
            <span>{data.BrokerageTransactions.length} 条原始记录</span>
          </div>
          <span>拖入或上传仅临时查看；“更新 JSON”才会合并并保存</span>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <FileJson size={17} />
            <span>
              <strong>导入失败</strong>
              {error}
            </span>
            <button aria-label="关闭" onClick={() => setError('')}>
              <X />
            </button>
          </div>
        )}
        <section className="filter-strip" aria-label="数据筛选">
          <label>
            <span>开始日期</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span>结束日期</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span>操作类型</span>
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v ?? 'all');
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="Buy">买入</SelectItem>
                <SelectItem value="Sell">卖出</SelectItem>
                <SelectItem value="inflow">入金</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>证券代码</span>
            <Select
              value={symbol}
              onValueChange={(v) => {
                setSymbol(v ?? 'all');
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部证券</SelectItem>
                {allSymbols.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="search-field">
            <span>关键词</span>
            <div>
              <Search size={15} />
              <Input
                value={query}
                placeholder="代码、名称或操作"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <Button variant="ghost" onClick={resetFilters}>
            重置筛选
          </Button>
        </section>
        <section className="kpi-grid">
          {[
            [
              '交易记录',
              filtered.length.toLocaleString('zh-CN'),
              `${allStats.symbols} 个证券标的`,
              WalletCards,
              'neutral',
            ],
            [
              '总入金',
              displayMoney(allStats.inflow),
              '全文件：汇款 + MoneyLink',
              CircleDollarSign,
              'purple',
            ],
            [
              '买入总额',
              displayMoney(stats.buyAmount),
              `${filtered.filter((r) => r.Action === 'Buy').length} 笔买入`,
              ArrowDownToLine,
              'blue',
            ],
            [
              '卖出总额',
              displayMoney(stats.sellAmount),
              `${filtered.filter((r) => r.Action === 'Sell').length} 笔卖出`,
              ArrowUpFromLine,
              'green',
            ],
            [
              '净资金流',
              displayMoney(stats.net),
              `资金转入 ${displayMoney(stats.inflow)}`,
              AreaChart,
              'purple',
            ],
            [
              '手续费与佣金',
              displayMoney(stats.fees, 2),
              `占证券成交额 ${stats.buyAmount + stats.sellAmount ? ((stats.fees / (stats.buyAmount + stats.sellAmount)) * 100).toFixed(4) : '0.0000'}%`,
              CircleDollarSign,
              'orange',
            ],
          ].map(([label, value, note, Icon, tone]) => (
            <article className={`kpi ${tone}`} key={label as string}>
              <div>
                <span>{label as string}</span>
                <Icon size={17} />
              </div>
              <strong>{value as string}</strong>
              <p>{note as string}</p>
            </article>
          ))}
        </section>
        <section className="panel holdings-panel">
          <div className="panel-head holdings-head">
            <div>
              <p>当前持仓看板</p>
              <h2>当前持仓与真实现金成本</h2>
            </div>
            <div className="holdings-summary">
              <span>
                <small>真实现金成本</small>
                <strong>{displayMoney(holdings.totalCost, 2)}</strong>
              </span>
              <span>
                <small>持仓标的</small>
                <strong>{holdings.positions.length}</strong>
              </span>
              <span>
                <small>产业主题</small>
                <strong>{industryData.length}</strong>
              </span>
            </div>
          </div>
          {typedHoldings.length ? (
            <div className="holdings-layout">
              <div className="holdings-table-wrap">
                <table className="holdings-table">
                  <colgroup>
                    <col className="holding-col-asset" />
                    <col className="holding-col-quantity" />
                    <col className="holding-col-average" />
                    <col className="holding-col-cost" />
                    <col className="holding-col-share" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>标的</th>
                      <th className="numeric">持仓数量</th>
                      <th className="numeric">现金均价</th>
                      <th className="numeric">真实现金成本</th>
                      <th>成本占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typedHoldings.map((item) => {
                      const share = holdings.totalCost
                        ? (item.cost / holdings.totalCost) * 100
                        : 0;
                      return (
                        <tr key={item.symbol}>
                          <td>
                            <div className="holding-symbol-line">
                              <strong>{item.symbol}</strong>
                              <Badge
                                className="asset-type-badge"
                                style={
                                  {
                                    '--asset-color':
                                      THEME_COLORS[item.industryTheme],
                                  } as React.CSSProperties
                                }
                              >
                                {item.industryTheme}
                              </Badge>
                            </div>
                            <span>{item.description}</span>
                          </td>
                          <td className="numeric mono">
                            {amountsMasked
                              ? MASKED_VALUE
                              : item.quantity.toLocaleString('en-US', {
                                  maximumFractionDigits: 4,
                                })}
                          </td>
                          <td className="numeric mono">
                            {displayMoney(item.averageCost, 2)}
                          </td>
                          <td className="numeric mono cost-cell">
                            {displayMoney(item.cost, 2)}
                          </td>
                          <td>
                            <div className="share-cell">
                              <strong>{share.toFixed(1)}%</strong>
                              <span>
                                <i
                                  style={{
                                    width: `${share}%`,
                                    background:
                                      THEME_COLORS[item.industryTheme],
                                  }}
                                />
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="holdings-charts">
                <article>
                  <div className="mini-chart-head">
                    <div>
                      <span>产业暴露</span>
                      <strong>现金成本构成</strong>
                    </div>
                    <small>点圆点隐藏/显示</small>
                  </div>
                  <div className="allocation-chart">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                    >
                      <PieChart>
                        <Pie
                          data={displayedIndustryData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={54}
                          outerRadius={78}
                          paddingAngle={2}
                          stroke="none"
                          isAnimationActive={false}
                          activeShape={false}
                        >
                          {displayedIndustryData.map((item) => (
                            <Cell
                              key={item.name}
                              fill={item.color}
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => displayMoney(Number(v), 2)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="industry-filter-list"
                    aria-label="产业主题显示控制"
                  >
                    {industryData.map((item) => (
                      <div
                        key={item.name}
                        className={
                          excludedIndustries.has(item.name)
                            ? 'excluded'
                            : undefined
                        }
                      >
                        <button
                          className="industry-toggle"
                          aria-label={`${excludedIndustries.has(item.name) ? '显示' : '隐藏'}${item.name}`}
                          aria-pressed={!excludedIndustries.has(item.name)}
                          onClick={() =>
                            setExcludedIndustries((current) => {
                              const next = new Set(current);
                              if (next.has(item.name)) next.delete(item.name);
                              else next.add(item.name);
                              return next;
                            })
                          }
                        >
                          <i style={{ background: item.color }} />
                        </button>
                        <span>{item.name}</span>
                        <strong>
                          {excludedIndustries.has(item.name)
                            ? '已隐藏'
                            : `${displayedIndustryCost ? ((item.value / displayedIndustryCost) * 100).toFixed(1) : '0.0'}%`}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p className="industry-included-total">
                    已计入饼图：{displayMoney(displayedIndustryCost, 2)}
                  </p>
                </article>
                <article>
                  <div className="mini-chart-head">
                    <div>
                      <span>标的集中度</span>
                      <strong>真实现金成本排行</strong>
                    </div>
                    <small>显示 {holdingCostData.length} 项</small>
                  </div>
                  <div className="structure-chart">
                    <div
                      className="cost-ranking-chart"
                      style={{
                        height: Math.max(160, holdingCostData.length * 30),
                      }}
                    >
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                      >
                        <BarChart
                          data={holdingCostData}
                          layout="vertical"
                          margin={{ left: 0, right: 12, top: 8, bottom: 2 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="symbol"
                            width={42}
                            interval={0}
                            tick={{
                              fill: 'var(--foreground)',
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(v) => displayMoney(Number(v), 2)}
                          />
                          <Bar
                            dataKey="cost"
                            name="真实现金成本"
                            radius={[0, 4, 4, 0]}
                            isAnimationActive={false}
                            activeBar={false}
                          >
                            {holdingCostData.map((item) => (
                              <Cell
                                key={item.symbol}
                                fill={item.color}
                                stroke="none"
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          ) : (
            <div className="empty-state">当前没有可计算的剩余持仓</div>
          )}
          <p className="definition-note">
            产业主题按最终经济暴露归类，不按 ETF、ADR 等产品形式归类。例如 QLD
            计入大型科技，SOXL、SMH 与 TSM 计入半导体产业链，RAM 与 SKUU
            计入存储与内存。真实现金成本优先按每笔买入的实际交易金额分摊至每股，再按
            FIFO 扣除已卖出批次；它不包含 wash sale
            对税务成本的调增。交易金额缺失时，才使用成交价乘数量。
            {holdings.incomplete
              ? ' 已检测到卖出数量超过已记录买入数量，请检查原始文件。'
              : ''}
          </p>
        </section>
        <section className="panel realized-panel">
          <div className="panel-head holdings-head">
            <div>
              <p>卖出交易复盘</p>
              <h2>FIFO 已实现现金盈亏</h2>
            </div>
            <div className="holdings-summary realized-summary">
              <span>
                <small>卖出回款</small>
                <strong>{displayMoney(holdings.totalRealizedProceeds, 2)}</strong>
              </span>
              <span>
                <small>已实现现金盈亏</small>
                <strong
                  className={holdings.totalRealizedPnl >= 0 ? 'pos' : 'neg'}
                >
                  {displayMoney(holdings.totalRealizedPnl, 2)}
                </strong>
              </span>
              <span>
                <small>涉及标的</small>
                <strong>{holdings.realizedPositions.length}</strong>
              </span>
            </div>
          </div>
          {holdings.realizedPositions.length ? (
            <div className="realized-layout">
              <div className="realized-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={holdings.realizedPositions.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 6, right: 25, top: 12, bottom: 8 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      stroke="var(--chart-grid)"
                    />
                    <XAxis
                      type="number"
                      tickFormatter={(value) =>
                        amountsMasked ? MASKED_VALUE : compactMoney(value)
                      }
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="symbol"
                      width={48}
                      tick={{
                        fill: 'var(--foreground)',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v) => displayMoney(Number(v), 2)}
                    />
                    <Bar
                      dataKey="pnl"
                      name="已实现现金盈亏"
                      radius={[0, 4, 4, 0]}
                    >
                      {holdings.realizedPositions.slice(0, 8).map((item) => (
                        <Cell
                          key={item.symbol}
                          fill={item.pnl >= 0 ? COLORS.sell : '#ec7d7d'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="realized-table-wrap">
                <table className="realized-table">
                  <thead>
                    <tr>
                      <th>标的</th>
                      <th className="numeric">卖出数量</th>
                      <th className="numeric">卖出回款</th>
                      <th className="numeric">匹配现金成本</th>
                      <th className="numeric">现金盈亏</th>
                      <th className="numeric">收益率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.realizedPositions.map((item) => (
                      <tr key={item.symbol}>
                        <td>
                          <strong>{item.symbol}</strong>
                          <span>
                            {classifyIndustry(item.symbol, item.description)}
                          </span>
                        </td>
                        <td className="numeric mono">
                          {amountsMasked
                            ? MASKED_VALUE
                            : item.quantity.toLocaleString('en-US', {
                                maximumFractionDigits: 4,
                              })}
                        </td>
                        <td className="numeric mono">
                          {displayMoney(item.proceeds, 2)}
                        </td>
                        <td className="numeric mono">
                          {displayMoney(item.matchedCost, 2)}
                        </td>
                        <td
                          className={`numeric mono ${item.pnl >= 0 ? 'pos' : 'neg'}`}
                        >
                          {displayMoney(item.pnl, 2)}
                        </td>
                        <td
                          className={`numeric mono ${item.returnRate >= 0 ? 'pos' : 'neg'}`}
                        >
                          {(item.returnRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">尚无可匹配的卖出交易</div>
          )}
          <p className="definition-note">
            已实现现金盈亏使用实际卖出回款减去 FIFO
            匹配的真实现金成本；费用若已反映在交易金额中会自然计入。结果不含
            wash sale 税务调整、额外税费和汇率影响，也不代表账户报税口径。
          </p>
        </section>
        <section className="panel cashflow-panel">
          <div className="panel-head">
            <div>
              <p>资金流趋势</p>
              <h2>每日资金活动</h2>
            </div>
            <div className="mini-legend">
              <span>
                <i className="buy" />
                买入支出
              </span>
              <span>
                <i className="sell" />
                卖出
              </span>
              <span>
                <i className="transfer" />
                资金转入
              </span>
              <span>
                <i className="line" />
                累计净现金流
              </span>
            </div>
          </div>
          {daily.length ? (
            <div className="chart-large">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart
                  data={daily}
                  margin={{ top: 16, right: 16, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 5"
                    vertical={false}
                    stroke="var(--chart-grid)"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(5).replace('-', '/')}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      amountsMasked ? MASKED_VALUE : compactMoney(value)
                    }
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip masked={amountsMasked} />} />
                  <Bar dataKey="buy" name="买入" fill={COLORS.buy} />
                  <Bar dataKey="sell" name="卖出" fill={COLORS.sell} />
                  <Bar
                    dataKey="transfer"
                    name="资金转入"
                    fill={COLORS.transfer}
                  />
                  <Line
                    dataKey="cumulative"
                    name="累计净现金流"
                    stroke="#b88b16"
                    strokeWidth={2.2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">当前筛选没有资金活动</div>
          )}
        </section>
        <section className="panel table-panel" id="transactions">
          <div className="panel-head table-title">
            <div>
              <p>交易流水</p>
              <h2>原始记录</h2>
            </div>
            <label className="anomaly-toggle">
              <Switch
                checked={onlyAnomalies}
                onCheckedChange={(checked) => {
                  setOnlyAnomalies(checked);
                  setPage(1);
                }}
              />
              <span>仅看异常或缺失字段</span>
            </label>
          </div>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{sortHead('Date', '日期')}</TableHead>
                  <TableHead>{sortHead('Action', '操作')}</TableHead>
                  <TableHead>{sortHead('Symbol', '代码')}</TableHead>
                  <TableHead>证券名称</TableHead>
                  <TableHead className="text-right">
                    {sortHead('Quantity', '数量')}
                  </TableHead>
                  <TableHead className="text-right">
                    {sortHead('Price', '成交价')}
                  </TableHead>
                  <TableHead className="text-right">
                    {sortHead('Fees & Comm', '手续费')}
                  </TableHead>
                  <TableHead className="text-right">
                    {sortHead('Amount', '交易金额')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row, index) => (
                  <TableRow
                    key={`${row.Date}-${row.Action}-${row.Symbol}-${index}`}
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelected(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelected(row);
                    }}
                  >
                    <TableCell className="date-cell">{row.Date}</TableCell>
                    <TableCell>
                      <Badge
                        className={`action-badge ${actionKind(row.Action)}`}
                      >
                        {ACTION_LABELS[row.Action] ?? row.Action}
                      </Badge>
                    </TableCell>
                    <TableCell className="ticker">
                      {empty(row.Symbol)}
                    </TableCell>
                    <TableCell className="description-cell">
                      {empty(row.Description)}
                    </TableCell>
                    <TableCell className="text-right mono">
                      {amountsMasked && row.Quantity
                        ? MASKED_VALUE
                        : empty(row.Quantity)}
                    </TableCell>
                    <TableCell className="text-right mono">
                      {displayRawMoney(row.Price)}
                    </TableCell>
                    <TableCell className="text-right mono">
                      {displayRawMoney(row['Fees & Comm'])}
                    </TableCell>
                    <TableCell
                      className={`text-right mono amount ${numberFrom(row.Amount) >= 0 ? 'pos' : 'neg'}`}
                    >
                      {displayRawMoney(row.Amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!visibleRows.length && (
            <div className="empty-state">没有符合当前条件的交易记录</div>
          )}
          <div className="table-footer">
            <span>
              显示 {sortedRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}—
              {Math.min(currentPage * PAGE_SIZE, sortedRows.length)} /{' '}
              {sortedRows.length} 条
            </span>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#transactions"
                    text="上一页"
                    aria-disabled={currentPage <= 1}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((v) => Math.max(1, v - 1));
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="page-count">
                    {currentPage} / {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#transactions"
                    text="下一页"
                    aria-disabled={currentPage >= totalPages}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((v) => Math.min(totalPages, v + 1));
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </section>
      </section>
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>交易详情</SheetTitle>
            <SheetDescription>保留嘉信导出文件中的原始字段</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="detail-list">
              {Object.entries(selected).map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>
                    {amountsMasked &&
                    ['Quantity', 'Price', 'Fees & Comm', 'Amount'].includes(key)
                      ? MASKED_VALUE
                      : value || '—'}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
