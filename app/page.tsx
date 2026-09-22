'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ChevronsUpDown,
  Download,
  Eye,
  EyeOff,
  FileJson,
  MoreHorizontal,
  Moon,
  Plus,
  RefreshCcw,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Undo2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  classifyIndustry,
  THEME_COLORS,
  type IndustryTheme,
} from '@/lib/industry-themes';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
type MarketQuote = {
  current: number;
  change: number;
  changePercent: number;
  previousClose: number;
  timestamp: number;
  source?: 'Twelve Data' | 'Finnhub' | 'Alpaca';
  isExtended?: boolean;
  marketSession?: 'overnight' | 'premarket' | 'regular' | 'postmarket';
  isDelayed?: boolean;
  isIndicative?: boolean;
};
type CandleSeries = { closes: number[]; timestamps: number[] };
type PairPoint = {
  date: string;
  value: number;
  signal: 'up' | 'down' | null;
};
type PairIndicator = {
  symbol: string;
  value: number;
  armUp: boolean;
  armDown: boolean;
  lastSignal: 'up' | 'down' | null;
  lastSignalDate: string;
  points: PairPoint[];
};
type SortKey = keyof Transaction;
type SortDirection = 'asc' | 'desc';
type ManualTransaction = {
  date: string;
  action: string;
  symbol: string;
  description: string;
  quantity: string;
  price: string;
  fees: string;
  amount: string;
};
type DcaPlan = {
  symbol: string;
  secondarySymbol?: string;
  enabled?: boolean;
  monthlyTarget: number;
  priority: 'primary' | 'secondary';
};
type DcaPlanExport = {
  format: 'schwab-dashboard-dca-plan';
  version: 1;
  exportedAt: string;
  plans: DcaPlan[];
};
const DEFAULT_DCA_PLANS: DcaPlan[] = [
  { symbol: 'QLD', monthlyTarget: 2666, priority: 'primary' },
  { symbol: 'IBIT', monthlyTarget: 888, priority: 'primary' },
  {
    symbol: 'CGDV',
    secondarySymbol: 'SCHD',
    monthlyTarget: 888,
    priority: 'secondary',
  },
];
const EMPTY_MANUAL_TRANSACTION: ManualTransaction = {
  date: '',
  action: 'Buy',
  symbol: '',
  description: '',
  quantity: '',
  price: '',
  fees: '0',
  amount: '',
};
const ACTION_LABELS: Record<string, string> = {
  Buy: '买入',
  Sell: '卖出',
  'Cash Dividend': '分红',
  Interest: '利息',
  'Wire Received': '汇款到账',
  'MoneyLink Transfer': '转账到账',
  Other: '其他',
};
const PAGE_SIZE = 8;
const LAST_IMPORT_KEY = 'schwab-dashboard:last-json-import';
const LAST_QUOTES_KEY = 'schwab-dashboard:last-market-quotes:v2';
const UNDO_TRANSACTION_KEY = 'schwab-dashboard:transaction-undo';
const PAIR_INDICATORS_KEY = 'schwab-dashboard:bo-pair-indicators:v2';
const PAIR_SYMBOLS = ['CGDV', 'VTV', 'SCHD', 'KO'] as const;
const PAIR_LENGTH = 35;
const PAIR_ARM_THRESHOLD = 1;
const DCA_PLANS_KEY = 'schwab-dashboard:dca-plans:v4';
const THEME_KEY = 'schwab-dashboard:theme';

function isSchwabExport(value: unknown): value is SchwabExport {
  const candidate = value as Partial<SchwabExport> | null;
  return Boolean(
    candidate?.FromDate &&
    candidate?.ToDate &&
    Array.isArray(candidate?.BrokerageTransactions),
  );
}
function isDcaPlanExport(value: unknown): value is DcaPlanExport {
  const candidate = value as Partial<DcaPlanExport> | null;
  return Boolean(
    candidate?.format === 'schwab-dashboard-dca-plan' &&
    candidate?.version === 1 &&
    Array.isArray(candidate?.plans) &&
    candidate.plans.length === DEFAULT_DCA_PLANS.length &&
    candidate.plans.every(
      (plan) =>
        plan &&
        typeof plan.symbol === 'string' &&
        (plan.secondarySymbol === undefined ||
          typeof plan.secondarySymbol === 'string') &&
        Number.isFinite(Number(plan.monthlyTarget)),
    ),
  );
}
function normalizeDcaPlans(plans: DcaPlan[]): DcaPlan[] {
  return DEFAULT_DCA_PLANS.map((fallback, index) => {
    const plan = plans[index] ?? fallback;
    const legacyDefensive = plan.symbol === 'DEFENSIVE';
    return {
      symbol: (legacyDefensive ? 'CGDV' : (plan.symbol ?? fallback.symbol))
        .trim()
        .toUpperCase(),
      secondarySymbol:
        index === 2
          ? (legacyDefensive
              ? 'SCHD'
              : (plan.secondarySymbol ?? fallback.secondarySymbol ?? '')
            )
              .trim()
              .toUpperCase()
          : undefined,
      enabled: plan.enabled !== false,
      monthlyTarget: Math.max(0, Number(plan.monthlyTarget) || 0),
      priority: index === 2 ? 'secondary' : 'primary',
    };
  });
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
function calculatePairIndicator(
  symbol: string,
  source: CandleSeries,
  benchmark: CandleSeries,
): PairIndicator | null {
  const benchmarkByTime = new Map(
    benchmark.timestamps.map((timestamp, index) => [
      timestamp,
      benchmark.closes[index],
    ]),
  );
  const ratios = source.timestamps
    .map((timestamp, index) => {
      const benchmarkClose = benchmarkByTime.get(timestamp);
      const sourceClose = source.closes[index];
      return benchmarkClose && sourceClose
        ? { timestamp, ratio: sourceClose / benchmarkClose }
        : null;
    })
    .filter((item): item is { timestamp: number; ratio: number } =>
      Boolean(item),
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  if (ratios.length <= PAIR_LENGTH) return null;

  let armUp = false;
  let armDown = false;
  let lastSignal: 'up' | 'down' | null = null;
  let lastSignalDate = '';
  const points: PairPoint[] = [];
  let previous: number | null = null;
  for (let index = PAIR_LENGTH; index < ratios.length; index += 1) {
    const base = ratios[index - PAIR_LENGTH].ratio;
    const value = ((ratios[index].ratio - base) / base) * 100;
    if (value <= -PAIR_ARM_THRESHOLD) armUp = true;
    if (value >= PAIR_ARM_THRESHOLD) armDown = true;
    const crossedUp = previous !== null && previous <= 0 && value > 0;
    const crossedDown = previous !== null && previous >= 0 && value < 0;
    let pointSignal: 'up' | 'down' | null = null;
    if (crossedUp && armUp) {
      lastSignal = 'up';
      pointSignal = 'up';
      lastSignalDate = new Date(ratios[index].timestamp * 1000)
        .toISOString()
        .slice(0, 10);
      armUp = false;
    }
    if (crossedDown && armDown) {
      lastSignal = 'down';
      pointSignal = 'down';
      lastSignalDate = new Date(ratios[index].timestamp * 1000)
        .toISOString()
        .slice(0, 10);
      armDown = false;
    }
    points.push({
      date: new Date(ratios[index].timestamp * 1000).toISOString().slice(0, 10),
      value,
      signal: pointSignal,
    });
    previous = value;
  }
  const latest = points.at(-1);
  return latest
    ? {
        symbol,
        value: latest.value,
        armUp,
        armDown,
        lastSignal,
        lastSignalDate,
        points: points.slice(-70),
      }
    : null;
}

function PairSignalDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: PairPoint;
}) {
  if (cx === undefined || cy === undefined || !payload?.signal) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5.5}
      fill={payload.signal === 'up' ? '#15966b' : '#d94a59'}
      stroke="var(--panel-solid)"
      strokeWidth={2}
    />
  );
}
function dateKey(value: string) {
  const [m, d, y] = value.slice(0, 10).split('/');
  return `${y}-${m}-${d}`;
}
function offsetMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}
function calendarTradeSummary(row: Transaction) {
  const buy = row.Action === 'Buy';
  const shares = Math.abs(numberFrom(row.Quantity)).toLocaleString('en-US', {
    maximumFractionDigits: 4,
  });
  const cash = Math.abs(numberFrom(row.Amount));
  return {
    label: buy ? '买入' : row.Action === 'Sell' ? '卖出' : row.Action,
    shares: `${buy ? '+' : '-'}${shares} 股`,
    amount: `${buy ? '-' : '+'}${money(cash, 2)}`,
  };
}
function firstTransactionDate(data: SchwabExport) {
  const first = data.BrokerageTransactions.reduce<string | null>(
    (earliest, row) => {
      if (!row.Date) return earliest;
      const day = dateKey(row.Date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return earliest;
      return earliest === null || day < earliest ? day : earliest;
    },
    null,
  );
  return first ?? dateKey(data.FromDate);
}
function emptySchwabExport(fixedDay?: string): SchwabExport {
  const now = new Date();
  const day =
    fixedDay ??
    `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
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
    FromDate: dateKeys[0] ? schwabDateFromKey(dateKeys[0]) : incoming.FromDate,
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
function displayQuoteTime(quote: MarketQuote) {
  if (!quote.timestamp) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(quote.timestamp * 1000));
}
function QuoteMeta({ quote }: { quote: MarketQuote }) {
  const source =
    quote.source === 'Alpaca'
      ? quote.isIndicative
        ? 'Alpaca 夜盘指示'
        : quote.isDelayed
          ? 'Alpaca 延迟'
          : 'Alpaca'
      : quote.source === 'Finnhub'
        ? 'Finnhub'
        : 'Twelve';
  const fullSource =
    quote.source === 'Alpaca'
      ? 'Alpaca'
      : quote.source === 'Finnhub'
        ? 'Finnhub'
        : 'Twelve Data';
  const session =
    quote.marketSession === 'overnight'
      ? '夜盘指示价'
      : quote.marketSession === 'premarket'
        ? '盘前'
        : quote.marketSession === 'postmarket'
          ? '盘后'
          : quote.isExtended
            ? '盘前/盘后'
            : '';
  const delay = quote.isDelayed ? '延迟约 15 分钟' : '';
  const detail = [fullSource, session, delay, displayQuoteTime(quote)]
    .filter(Boolean)
    .join(' · ');
  return (
    <small className="quote-meta" title={`${detail}（本地时间）`}>
      <span className="quote-source">{source}</span>
      <span className="quote-time-text">{displayQuoteTime(quote)}</span>
    </small>
  );
}

function money(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
function signedMoney(value: number) {
  return `${value >= 0 ? '+' : '-'}${money(Math.abs(value), 2)}`;
}
function signedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
function signedPercentagePoints(value: number) {
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} 个百分点`;
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

export default function Home() {
  // Keep the server and browser's first render identical across time zones.
  const initial = useMemo(() => emptySchwabExport('01/01/1970'), []);
  const [data, setData] = useState<SchwabExport>(initial);
  const [fileName, setFileName] = useState('暂无已保存 JSON');
  const [lastUpdated, setLastUpdated] = useState('尚未导入');
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState('尚未更新');
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState('');
  const [quoteRefreshStatus, setQuoteRefreshStatus] = useState('');
  const [pairIndicators, setPairIndicators] = useState<PairIndicator[]>([]);
  const [pairUpdatedAt, setPairUpdatedAt] = useState('尚未更新');
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState('');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [quoteClearDialogOpen, setQuoteClearDialogOpen] = useState(false);
  const [marketSettingsOpen, setMarketSettingsOpen] = useState(false);
  const [marketSourceStatus, setMarketSourceStatus] = useState<{
    twelveDataConfigured: boolean;
    finnhubConfigured: boolean;
    alpacaConfigured: boolean;
  } | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [deleteTransactionOpen, setDeleteTransactionOpen] = useState(false);
  const [manualTransaction, setManualTransaction] = useState<ManualTransaction>(
    EMPTY_MANUAL_TRANSACTION,
  );
  const [manualError, setManualError] = useState('');
  const [canUndoTransaction, setCanUndoTransaction] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | 'glass'>('light');
  const [activeView, setActiveView] = useState<'portfolio' | 'dca'>(
    'portfolio',
  );
  const [todayKey, setTodayKey] = useState('1970-01-01');
  const [selectedDcaMonth, setSelectedDcaMonth] = useState('1970-01');
  const [calendarDayDetails, setCalendarDayDetails] = useState<{
    key: string;
    actions: Transaction[];
  } | null>(null);
  const [dcaPlans, setDcaPlans] = useState<DcaPlan[]>(DEFAULT_DCA_PLANS);
  const [dcaSettingsOpen, setDcaSettingsOpen] = useState(false);
  const [dcaPlanNotice, setDcaPlanNotice] = useState('');
  const [amountsMasked, setAmountsMasked] = useState(false);
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);
  const [excludedIndustries, setExcludedIndustries] = useState<
    Set<IndustryTheme>
  >(new Set());
  const [excludedDcaSymbols, setExcludedDcaSymbols] = useState<Set<string>>(
    new Set(),
  );
  const [page, setPage] = useState(1);
  const [dcaTransactionPage, setDcaTransactionPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'Date',
    direction: 'desc',
  });
  const [dcaSort, setDcaSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  }>({ key: 'Date', direction: 'desc' });
  const [selected, setSelected] = useState<Transaction | null>(null);
  const viewFileInput = useRef<HTMLInputElement>(null);
  const dcaPlanFileInput = useRef<HTMLInputElement>(null);
  const updateFileInput = useRef<HTMLInputElement>(null);
  const maintainedDataRef = useRef<SchwabExport>(initial);
  const themeReadyRef = useRef(false);
  const [maintainedCount, setMaintainedCount] = useState(0);
  const displayMoney = (value: number, digits = 0) =>
    amountsMasked ? MASKED_VALUE : money(value, digits);
  const displayRawMoney = (value: string) =>
    amountsMasked && value ? MASKED_VALUE : empty(value);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('glass', theme === 'glass');
    try {
      if (themeReadyRef.current) localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Theme persistence is optional.
    }
  }, [theme]);
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === 'dark' || savedTheme === 'glass') setTheme(savedTheme);
      themeReadyRef.current = true;
    } catch {
      // Keep the light theme when browser storage is unavailable.
      themeReadyRef.current = true;
    }
  }, []);
  useEffect(() => {
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    setTodayKey(today);
    setSelectedDcaMonth(today.slice(0, 7));
    try {
      const saved = JSON.parse(
        localStorage.getItem(DCA_PLANS_KEY) || 'null',
      ) as DcaPlan[] | null;
      if (Array.isArray(saved) && saved.length === DEFAULT_DCA_PLANS.length) {
        setDcaPlans(normalizeDcaPlans(saved));
      }
    } catch {
      // Keep the useful defaults when local plan settings are unavailable.
    }
  }, []);
  useEffect(() => {
    try {
      setCanUndoTransaction(
        Boolean(localStorage.getItem(UNDO_TRANSACTION_KEY)),
      );
    } catch {
      // Undo remains unavailable when browser storage cannot be read.
    }
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PAIR_INDICATORS_KEY);
      if (!raw) return;
      const remembered = JSON.parse(raw) as {
        indicators?: PairIndicator[];
        updatedAt?: string;
      };
      if (Array.isArray(remembered.indicators)) {
        setPairIndicators(remembered.indicators);
        setPairUpdatedAt(remembered.updatedAt || '上次更新');
      }
    } catch {
      // Ignore invalid or unavailable browser storage.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.removeItem('schwab-dashboard:asset-snapshots');
    } catch {
      // Remove data left by the retired local snapshot feature when possible.
    }
  }, []);
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
      setExcludedIndustries(new Set());
      setPage(1);
    } catch {
      // Ignore invalid or unavailable browser storage.
    }
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_QUOTES_KEY);
      if (!raw) return;
      const remembered = JSON.parse(raw) as {
        quotes?: Record<string, MarketQuote>;
        updatedAt?: string;
      };
      if (remembered.quotes && typeof remembered.quotes === 'object') {
        setQuotes(remembered.quotes);
        setQuotesUpdatedAt(remembered.updatedAt || '上次更新');
      }
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
            clearTransactionUndoPoint();
            maintainedDataRef.current = merged;
            setMaintainedCount(merged.BrokerageTransactions.length);
            setData(merged);
            setFileName(`累计数据 · ${nextFileName}`);
            setLastUpdated(importedAt);
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

  const filtered = useMemo(
    () =>
      data.BrokerageTransactions.filter(
        (row) => !onlyAnomalies || isAnomaly(row),
      ),
    [data, onlyAnomalies],
  );
  const allStats = useMemo(
    () => actionStats(data.BrokerageTransactions),
    [data],
  );
  const symbols = useMemo(
    () => symbolStats(data.BrokerageTransactions),
    [data],
  );
  const holdings = useMemo(
    () => portfolioLedger(data.BrokerageTransactions),
    [data],
  );
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
    () => industryData.filter((item) => !excludedIndustries.has(item.name)),
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
  const marketSummary = useMemo(
    () =>
      typedHoldings.reduce(
        (summary, item) => {
          const quote = quotes[item.symbol];
          if (!quote) return summary;
          const marketValue = item.quantity * quote.current;
          summary.marketValue += marketValue;
          summary.unrealizedPnl += marketValue - item.cost;
          summary.dayChange += item.quantity * quote.change;
          summary.quotedCount += 1;
          return summary;
        },
        { marketValue: 0, unrealizedPnl: 0, dayChange: 0, quotedCount: 0 },
      ),
    [typedHoldings, quotes],
  );
  const portfolioMarketWeightReady =
    typedHoldings.length > 0 &&
    marketSummary.quotedCount === typedHoldings.length &&
    marketSummary.marketValue > 0;
  const marketDayChangePercent =
    marketSummary.marketValue - marketSummary.dayChange
      ? (marketSummary.dayChange /
          (marketSummary.marketValue - marketSummary.dayChange)) *
        100
      : 0;
  const maxRealizedPnl = Math.max(
    ...holdings.realizedPositions.map((item) => Math.abs(item.pnl)),
    1,
  );
  const ledgerCash = allStats.net;
  const totalAssets =
    ledgerCash +
    (marketSummary.quotedCount
      ? marketSummary.marketValue
      : holdings.totalCost);
  const externalNetContributions = useMemo(
    () =>
      data.BrokerageTransactions.reduce(
        (sum, row) =>
          /wire|moneylink/i.test(row.Action)
            ? sum + numberFrom(row.Amount)
            : sum,
        0,
      ),
    [data],
  );
  const cashReturns = useMemo(
    () =>
      data.BrokerageTransactions.reduce(
        (summary, row) => {
          if (/dividend/i.test(row.Action)) {
            summary.dividends += numberFrom(row.Amount);
          } else if (/interest/i.test(row.Action)) {
            summary.interest += numberFrom(row.Amount);
          }
          return summary;
        },
        { dividends: 0, interest: 0 },
      ),
    [data],
  );
  const totalPnl = totalAssets - externalNetContributions;
  const totalPnlPercent = externalNetContributions
    ? (totalPnl / Math.abs(externalNetContributions)) * 100
    : 0;
  const dcaMonth = selectedDcaMonth;
  const earliestDcaMonth = useMemo(
    () =>
      data.BrokerageTransactions.length
        ? firstTransactionDate(data).slice(0, 7)
        : todayKey.slice(0, 7),
    [data, todayKey],
  );
  const latestDcaMonth = offsetMonthKey(todayKey.slice(0, 7), 12);
  const activeDcaPlans = useMemo(
    () =>
      dcaPlans.filter(
        (plan) =>
          plan.enabled !== false &&
          [plan.symbol, plan.secondarySymbol].some((symbol) => Boolean(symbol)),
      ),
    [dcaPlans],
  );
  const dcaPlanSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          activeDcaPlans.flatMap((plan) =>
            [plan.symbol, plan.secondarySymbol].filter(
              (symbol): symbol is string => Boolean(symbol),
            ),
          ),
        ),
      ),
    [activeDcaPlans],
  );
  const dcaTransactions = useMemo(() => {
    const planSymbols = new Set(dcaPlanSymbols);
    return [...data.BrokerageTransactions]
      .filter((row) => planSymbols.has(row.Symbol))
      .sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());
  }, [data, dcaPlanSymbols]);
  const dcaActivity = useMemo(() => {
    return dcaTransactions
      .filter((row) => row.Action === 'Buy')
      .map((row) => ({
        ...row,
        day: dateKey(row.Date),
        invested: Math.abs(numberFrom(row.Amount)),
      }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [dcaTransactions]);
  const sortDcaTransactions = (rows: Transaction[]) => {
    const numeric = new Set<SortKey>([
      'Quantity',
      'Price',
      'Fees & Comm',
      'Amount',
    ]);
    return [...rows].sort((a, b) => {
      const av =
        dcaSort.key === 'Date'
          ? dateKey(a.Date)
          : numeric.has(dcaSort.key)
            ? numberFrom(a[dcaSort.key])
            : a[dcaSort.key];
      const bv =
        dcaSort.key === 'Date'
          ? dateKey(b.Date)
          : numeric.has(dcaSort.key)
            ? numberFrom(b[dcaSort.key])
            : b[dcaSort.key];
      return (
        (av < bv ? -1 : av > bv ? 1 : 0) *
        (dcaSort.direction === 'asc' ? 1 : -1)
      );
    });
  };
  const sortedDcaTransactions = useMemo(
    () => sortDcaTransactions(dcaTransactions),
    [dcaTransactions, dcaSort],
  );
  const dcaMonthTransactions = useMemo(
    () =>
      sortedDcaTransactions.filter((row) =>
        dateKey(row.Date).startsWith(dcaMonth),
      ),
    [sortedDcaTransactions, dcaMonth],
  );
  const dcaMonthlyAverages = useMemo(
    () =>
      dcaPlanSymbols.map((symbol) => {
        const rows = dcaActivity.filter(
          (row) => row.Symbol === symbol && row.day.startsWith(dcaMonth),
        );
        const quantity = rows.reduce(
          (sum, row) => sum + numberFrom(row.Quantity),
          0,
        );
        const invested = rows.reduce((sum, row) => sum + row.invested, 0);
        return {
          symbol,
          quantity,
          invested,
          averageCost: quantity ? invested / quantity : 0,
        };
      }),
    [dcaActivity, dcaMonth, dcaPlanSymbols],
  );
  const dcaPlanRows = useMemo(
    () =>
      activeDcaPlans.map((plan) => {
        const planSymbols = [plan.symbol, plan.secondarySymbol].filter(Boolean);
        const rows = dcaActivity.filter((row) =>
          planSymbols.includes(row.Symbol),
        );
        const monthRows = rows.filter((row) => row.day.startsWith(dcaMonth));
        const invested = monthRows.reduce((sum, row) => sum + row.invested, 0);
        const quantityFor = (symbol: string) =>
          monthRows
            .filter((row) => row.Symbol === symbol)
            .reduce((sum, row) => sum + numberFrom(row.Quantity), 0);
        const formatShares = (quantity: number) =>
          quantity.toLocaleString('en-US', { maximumFractionDigits: 4 });
        const monthShares =
          plan.priority === 'secondary'
            ? [
                quantityFor(plan.symbol)
                  ? `${plan.symbol} ${formatShares(quantityFor(plan.symbol))} 股`
                  : '',
                plan.secondarySymbol && quantityFor(plan.secondarySymbol)
                  ? `${plan.secondarySymbol} ${formatShares(quantityFor(plan.secondarySymbol))} 股`
                  : '',
              ]
                .filter(Boolean)
                .join(' / ') || '0 股'
            : `${formatShares(quantityFor(plan.symbol))} 股`;
        return {
          ...plan,
          invested,
          monthShares,
          remaining: Math.max(0, plan.monthlyTarget - invested),
          overage: Math.max(0, invested - plan.monthlyTarget),
          progress: plan.monthlyTarget
            ? (invested / plan.monthlyTarget) * 100
            : 0,
          lastBuy: rows[0]?.day || '',
          monthTrades: monthRows.length,
        };
      }),
    [activeDcaPlans, dcaActivity, dcaMonth],
  );
  const dcaMonthlyTarget = activeDcaPlans.reduce(
    (sum, plan) => sum + plan.monthlyTarget,
    0,
  );
  const dcaMonthInvested = dcaPlanRows.reduce(
    (sum, plan) => sum + plan.invested,
    0,
  );
  const dcaRemaining = Math.max(0, dcaMonthlyTarget - dcaMonthInvested);
  const dcaOverage = Math.max(0, dcaMonthInvested - dcaMonthlyTarget);
  const dcaCompletion = dcaMonthlyTarget
    ? (dcaMonthInvested / dcaMonthlyTarget) * 100
    : 0;
  const dcaYear = Number(dcaMonth.slice(0, 4));
  const dcaQuarter = Math.floor((Number(dcaMonth.slice(5, 7)) - 1) / 3);
  const dcaQuarterStart = `${dcaYear}-${String(dcaQuarter * 3 + 1).padStart(2, '0')}`;
  const previousQuarterStart = offsetMonthKey(dcaQuarterStart, -3);
  const nextQuarterStart = offsetMonthKey(dcaQuarterStart, 3);
  const dcaYearMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const key = `${dcaYear}-${String(index + 1).padStart(2, '0')}`;
        const invested = dcaActivity
          .filter((row) => row.day.startsWith(key))
          .reduce((sum, row) => sum + row.invested, 0);
        const target = dcaMonthlyTarget;
        return {
          key,
          label: `${index + 1}月`,
          invested,
          target,
          progress: target ? (invested / target) * 100 : 0,
          overage: target ? Math.max(0, invested - target) : 0,
          trades: dcaActivity.filter((row) => row.day.startsWith(key)).length,
        };
      }),
    [dcaActivity, dcaMonthlyTarget, dcaYear],
  );
  const dcaCalendar = useMemo(() => {
    const [year, month] = dcaMonth.split('-').map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = first.getUTCDay();
    const cells = Array.from({ length: leading + days }, (_, index) => {
      if (index < leading) return null;
      const day = index - leading + 1;
      const key = `${dcaMonth}-${String(day).padStart(2, '0')}`;
      const actions = dcaMonthTransactions.filter(
        (row) =>
          dateKey(row.Date) === key &&
          (row.Action === 'Buy' || row.Action === 'Sell'),
      );
      const buys = actions.filter((row) => row.Action === 'Buy');
      return {
        day,
        key,
        actions,
        buys,
        invested: buys.reduce(
          (sum, row) => sum + Math.abs(numberFrom(row.Amount)),
          0,
        ),
      };
    });
    return cells;
  }, [dcaMonth, dcaMonthTransactions]);
  const dcaTransactionTotalPages = Math.max(
    1,
    Math.ceil(dcaTransactions.length / PAGE_SIZE),
  );
  const currentDcaTransactionPage = Math.min(
    dcaTransactionPage,
    dcaTransactionTotalPages,
  );
  const visibleDcaTransactions = sortedDcaTransactions.slice(
    (currentDcaTransactionPage - 1) * PAGE_SIZE,
    currentDcaTransactionPage * PAGE_SIZE,
  );
  const dcaAnalysisRows = useMemo(
    () =>
      dcaPlanSymbols
        .map((symbol) => {
          const holding = typedHoldings.find((item) => item.symbol === symbol);
          const quote = quotes[symbol];
          const cost = holding?.cost ?? 0;
          const marketValue =
            holding && quote ? holding.quantity * quote.current : 0;
          return {
            symbol,
            description: holding?.description ?? symbol,
            industryTheme:
              holding?.industryTheme ?? classifyIndustry(symbol, ''),
            quantity: holding?.quantity ?? 0,
            averageCost: holding?.averageCost ?? 0,
            cost,
            quote,
            marketValue,
            pnl: quote ? marketValue - cost : 0,
          };
        })
        .sort((a, b) => b.cost - a.cost),
    [typedHoldings, quotes, dcaPlanSymbols],
  );
  const dcaAnalysisCost = dcaAnalysisRows.reduce(
    (sum, row) => sum + row.cost,
    0,
  );
  const dcaAnalysisMarket = dcaAnalysisRows.reduce(
    (sum, row) => sum + row.marketValue,
    0,
  );
  const dcaMarketWeightReady =
    dcaAnalysisMarket > 0 &&
    dcaAnalysisRows.every((row) => row.quantity <= 0 || Boolean(row.quote));
  const dcaAnalysisPnl = dcaAnalysisMarket - dcaAnalysisCost;
  const dcaAnalysisReturn = dcaAnalysisCost
    ? (dcaAnalysisPnl / dcaAnalysisCost) * 100
    : 0;
  const dcaCostChartData = dcaAnalysisRows
    .filter((row) => row.cost > 0)
    .map((row, index) => ({
      name: row.symbol,
      value: row.cost,
      color: ['#2e78c7', '#9c5b32', '#c68a35', '#728c67'][index % 4],
    }));
  const displayedDcaCostChartData = dcaCostChartData.filter(
    (item) => !excludedDcaSymbols.has(item.name),
  );
  const displayedDcaCost = displayedDcaCostChartData.reduce(
    (sum, item) => sum + item.value,
    0,
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
  function showData(
    next: SchwabExport,
    nextFileName: string,
    updatedAt: string,
  ) {
    setData(next);
    setFileName(nextFileName);
    setLastUpdated(updatedAt);
    setOnlyAnomalies(false);
    setExcludedIndustries(new Set());
    setPage(1);
    setError('');
  }
  function saveTransactionUndoPoint() {
    try {
      localStorage.setItem(
        UNDO_TRANSACTION_KEY,
        JSON.stringify({
          data: maintainedDataRef.current,
          fileName,
          importedAt: lastUpdated,
        } satisfies RememberedImport),
      );
      setCanUndoTransaction(true);
    } catch {
      setCanUndoTransaction(false);
    }
  }
  function clearTransactionUndoPoint() {
    try {
      localStorage.removeItem(UNDO_TRANSACTION_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
    setCanUndoTransaction(false);
  }
  function undoLastTransactionChange() {
    try {
      const raw = localStorage.getItem(UNDO_TRANSACTION_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as Partial<RememberedImport>;
      if (!isSchwabExport(snapshot.data)) throw new Error('撤销数据已失效');
      const restoredAt = new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      maintainedDataRef.current = snapshot.data;
      setMaintainedCount(snapshot.data.BrokerageTransactions.length);
      showData(snapshot.data, '累计数据 · 已撤销上次手动操作', restoredAt);
      rememberImport(
        snapshot.data,
        '累计数据 · 已撤销上次手动操作',
        restoredAt,
      );
      clearTransactionUndoPoint();
      setSelected(null);
    } catch (reason) {
      clearTransactionUndoPoint();
      setError(reason instanceof Error ? reason.message : '无法撤销上次操作');
    }
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
      clearTransactionUndoPoint();
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
    setOnlyAnomalies(false);
    setExcludedIndustries(new Set());
    setPage(1);
    setError('');
    try {
      localStorage.removeItem(LAST_IMPORT_KEY);
      localStorage.removeItem('schwab-dashboard:asset-snapshots');
      localStorage.removeItem(UNDO_TRANSACTION_KEY);
      setCanUndoTransaction(false);
    } catch {
      // Ignore unavailable browser storage.
    }
  }
  function openManualTransactionDialog() {
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    setManualTransaction({ ...EMPTY_MANUAL_TRANSACTION, date: today });
    setEditingTransaction(null);
    setManualError('');
    setManualDialogOpen(true);
  }
  function saveDcaPlans() {
    const normalized = normalizeDcaPlans(dcaPlans);
    setDcaPlans(normalized);
    try {
      localStorage.setItem(DCA_PLANS_KEY, JSON.stringify(normalized));
    } catch {
      // Settings remain active for this session when storage is unavailable.
    }
    setDcaSettingsOpen(false);
  }
  function exportDcaPlans() {
    const payload: DcaPlanExport = {
      format: 'schwab-dashboard-dca-plan',
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: normalizeDcaPlans(dcaPlans),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `schwab-dca-plan-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importDcaPlans(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isDcaPlanExport(parsed)) {
        throw new Error('文件不是有效的定投计划 JSON');
      }
      const normalized = normalizeDcaPlans(parsed.plans);
      setDcaPlans(normalized);
      localStorage.setItem(DCA_PLANS_KEY, JSON.stringify(normalized));
      setDcaPlanNotice(`已导入定投计划：${file.name}`);
    } catch (reason) {
      setDcaPlanNotice(
        reason instanceof Error ? reason.message : '定投计划无法导入',
      );
    }
  }
  async function importDcaPlanFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await importDcaPlans(file);
    event.target.value = '';
  }
  function shiftDcaMonth(offset: number) {
    const shifted = offsetMonthKey(selectedDcaMonth, offset);
    if (shifted >= earliestDcaMonth && shifted <= latestDcaMonth) {
      setSelectedDcaMonth(shifted);
    }
  }
  function openEditTransactionDialog() {
    if (!selected) return;
    if (!maintainedDataRef.current.BrokerageTransactions.includes(selected)) {
      setError('临时查看的数据不能直接修改，请先通过“更新 JSON”并入累计记录');
      return;
    }
    setEditingTransaction(selected);
    setManualTransaction({
      date: dateKey(selected.Date),
      action: selected.Action,
      symbol: selected.Symbol,
      description: selected.Description,
      quantity: selected.Quantity,
      price: selected.Price ? String(numberFrom(selected.Price)) : '',
      fees: selected['Fees & Comm']
        ? String(Math.abs(numberFrom(selected['Fees & Comm'])))
        : '0',
      amount: String(numberFrom(selected.Amount)),
    });
    setManualError('');
    setManualDialogOpen(true);
  }
  function saveManualTransaction() {
    const draft = manualTransaction;
    const isTrade = draft.action === 'Buy' || draft.action === 'Sell';
    const quantity = Number(draft.quantity);
    const price = Number(draft.price);
    const fees = Math.abs(Number(draft.fees) || 0);
    const symbol = draft.symbol.trim().toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setManualError('请选择有效日期');
      return;
    }
    if (isTrade && (!symbol || !(quantity > 0) || !(price > 0))) {
      setManualError('买入或卖出需要填写标的、数量和成交价');
      return;
    }
    const calculatedAmount =
      draft.action === 'Buy'
        ? -(quantity * price + fees)
        : draft.action === 'Sell'
          ? quantity * price - fees
          : Number(draft.amount);
    const amount = draft.amount.trim()
      ? Number(draft.amount)
      : calculatedAmount;
    if (!Number.isFinite(amount) || (!isTrade && !draft.amount.trim())) {
      setManualError('请填写有效的交易金额');
      return;
    }
    const row: Transaction = {
      Date: schwabDateFromKey(draft.date),
      Action: draft.action,
      Symbol: symbol,
      Description: draft.description.trim(),
      Quantity: isTrade ? String(quantity) : draft.quantity.trim(),
      Price: isTrade ? `$${price.toFixed(2)}` : draft.price.trim(),
      'Fees & Comm': fees ? `$${fees.toFixed(2)}` : '$0.00',
      Amount: `${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}`,
      AcctgRuleCd: 'MANUAL',
    };
    const currentRows = maintainedDataRef.current.BrokerageTransactions;
    const editingIndex = editingTransaction
      ? currentRows.findIndex((item) => item === editingTransaction)
      : -1;
    if (editingTransaction && editingIndex < 0) {
      setManualError('原交易已不存在，请关闭后重试');
      return;
    }
    const nextRows =
      editingIndex >= 0
        ? currentRows.map((item, index) =>
            index === editingIndex ? row : item,
          )
        : [...currentRows, row];
    saveTransactionUndoPoint();
    const next = mergeSchwabExports(emptySchwabExport(), {
      ...maintainedDataRef.current,
      BrokerageTransactions: nextRows,
    });
    const addedAt = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    maintainedDataRef.current = next;
    setMaintainedCount(next.BrokerageTransactions.length);
    const updateLabel = editingTransaction
      ? '累计数据 · 已修改单条交易'
      : '累计数据 · 手动添加';
    showData(next, updateLabel, addedAt);
    rememberImport(next, updateLabel, addedAt);
    setSelected(null);
    setEditingTransaction(null);
    setManualDialogOpen(false);
  }
  function deleteSelectedTransaction() {
    if (!selected) return;
    const current = maintainedDataRef.current;
    const selectedIndex = current.BrokerageTransactions.findIndex(
      (row) => row === selected,
    );
    if (selectedIndex < 0) {
      setError('临时查看的数据不能直接删除，请先通过“更新 JSON”并入累计记录');
      setDeleteTransactionOpen(false);
      setSelected(null);
      return;
    }
    saveTransactionUndoPoint();
    const remaining = current.BrokerageTransactions.filter(
      (_, index) => index !== selectedIndex,
    );
    const next = remaining.length
      ? mergeSchwabExports(emptySchwabExport(), {
          ...current,
          BrokerageTransactions: remaining,
        })
      : emptySchwabExport();
    const deletedAt = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    maintainedDataRef.current = next;
    setMaintainedCount(next.BrokerageTransactions.length);
    showData(next, '累计数据 · 已删除单条交易', deletedAt);
    rememberImport(next, '累计数据 · 已删除单条交易', deletedAt);
    setDeleteTransactionOpen(false);
    setSelected(null);
  }
  async function refreshPairIndicators() {
    if (pairLoading) return;
    setPairLoading(true);
    setPairError('');
    try {
      const response = await fetch('/api/pair-indicators', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        series?: Record<string, CandleSeries>;
        fetchedAt?: string;
        error?: string;
      };
      if (!response.ok || !payload.series?.QQQ) {
        throw new Error(payload.error || '配对指标更新失败');
      }
      const indicators = PAIR_SYMBOLS.map((symbol) => {
        const source = payload.series?.[symbol];
        return source
          ? calculatePairIndicator(symbol, source, payload.series!.QQQ)
          : null;
      }).filter((item): item is PairIndicator => Boolean(item));
      if (!indicators.length) throw new Error('历史行情不足，无法计算配对指标');
      const updatedAt = new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(payload.fetchedAt || Date.now()));
      setPairIndicators(indicators);
      setPairUpdatedAt(updatedAt);
      localStorage.setItem(
        PAIR_INDICATORS_KEY,
        JSON.stringify({ indicators, updatedAt }),
      );
      if (indicators.length < PAIR_SYMBOLS.length) {
        setPairError(
          `${PAIR_SYMBOLS.length - indicators.length} 组历史行情不可用`,
        );
      }
    } catch (reason) {
      setPairError(
        reason instanceof Error ? reason.message : '配对指标更新失败',
      );
    } finally {
      setPairLoading(false);
    }
  }
  function clearPairIndicatorCache() {
    try {
      localStorage.removeItem(PAIR_INDICATORS_KEY);
      localStorage.removeItem('schwab-dashboard:bo-pair-indicators');
    } catch {
      // The visible state can still be cleared when storage is unavailable.
    }
    setPairIndicators([]);
    setPairUpdatedAt('尚未更新');
    setPairError('');
  }
  async function openMarketSettings() {
    setMarketSettingsOpen(true);
    setMarketSourceStatus(null);
    try {
      const response = await fetch('/api/quotes', { cache: 'no-store' });
      if (!response.ok) return;
      const status = (await response.json()) as {
        twelveDataConfigured: boolean;
        finnhubConfigured: boolean;
        alpacaConfigured: boolean;
      };
      setMarketSourceStatus(status);
    } catch {
      setMarketSourceStatus(null);
    }
  }
  function clearQuoteCache() {
    try {
      localStorage.removeItem(LAST_QUOTES_KEY);
      localStorage.removeItem('schwab-dashboard:last-market-quotes');
    } catch {
      // The visible state can still be cleared when storage is unavailable.
    }
    setQuotes({});
    setQuotesUpdatedAt('尚未更新');
    setQuoteRefreshStatus('');
    setQuotesError('');
  }
  async function refreshQuotes() {
    const symbols = holdings.positions.map((item) => item.symbol);
    if (!symbols.length || quotesLoading) return;
    setQuotesLoading(true);
    setQuotesError('');
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      const payload = (await response.json()) as {
        quotes?: Record<string, MarketQuote>;
        fetchedAt?: string;
        error?: string;
      };
      if (!response.ok || !payload.quotes) {
        throw new Error(payload.error || '行情更新失败');
      }
      const updatedAt = new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(payload.fetchedAt || Date.now()));
      const mergedQuotes = { ...quotes, ...payload.quotes };
      const freshCount = symbols.filter(
        (symbol) => payload.quotes?.[symbol],
      ).length;
      const reusedCount = symbols.filter(
        (symbol) => !payload.quotes?.[symbol] && quotes[symbol],
      ).length;
      setQuotes(mergedQuotes);
      setQuotesUpdatedAt(updatedAt);
      setQuoteRefreshStatus(
        reusedCount
          ? `${freshCount} 个最新 · ${reusedCount} 个沿用旧价`
          : `${freshCount} 个最新`,
      );
      localStorage.setItem(
        LAST_QUOTES_KEY,
        JSON.stringify({ quotes: mergedQuotes, updatedAt }),
      );
    } catch (reason) {
      setQuotesError(reason instanceof Error ? reason.message : '行情更新失败');
    } finally {
      setQuotesLoading(false);
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
    const rangeStart = firstTransactionDate(data);
    const rangeEnd = dateKey(data.ToDate);
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
  function updateDcaSort(key: SortKey) {
    setDcaSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
    setDcaTransactionPage(1);
  }
  const sortHead = (key: SortKey, label: string) => (
    <button className="sort-button" onClick={() => updateSort(key)}>
      {label}
      <ChevronsUpDown size={13} />
    </button>
  );
  const dcaSortHead = (key: SortKey, label: string) => (
    <button className="sort-button" onClick={() => updateDcaSort(key)}>
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
        <nav className="workspace-nav" aria-label="看板页面">
          <button
            className={activeView === 'portfolio' ? 'active' : ''}
            onClick={() => setActiveView('portfolio')}
          >
            资产看板
          </button>
          <button
            className={activeView === 'dca' ? 'active' : ''}
            onClick={() => setActiveView('dca')}
          >
            定投计划
          </button>
        </nav>
        <div className="period">
          <span>数据覆盖</span>
          <strong>
            {data.BrokerageTransactions.length
              ? `${displayDate(schwabDateFromKey(firstTransactionDate(data)))} — ${displayDate(data.ToDate)} · ${data.BrokerageTransactions.length} 条`
              : '尚未导入交易记录'}
          </strong>
        </div>
        <div className="top-actions">
          <span className="updated" title={`完整更新时间：${lastUpdated}`}>
            更新：
            {lastUpdated.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '$2/$3')}
          </span>
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
            onClick={() => updateFileInput.current?.click()}
          >
            <RefreshCcw />
            更新 JSON
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline">
                  <MoreHorizontal />
                  <span>更多</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => viewFileInput.current?.click()}>
                <Upload /> 临时上传 JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportMaintainedJson}
                disabled={maintainedCount === 0}
              >
                <FileJson /> 导出 JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPagePdf}>
                <Download /> 导出页面 PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void openMarketSettings()}>
                <Settings2 /> 行情设置
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setClearDialogOpen(true)}
              >
                <Trash2 /> 清空 JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            title="切换主题：浅色 → macOS 毛玻璃 → 深色"
            onClick={() =>
              setTheme((current) =>
                current === 'light'
                  ? 'glass'
                  : current === 'glass'
                    ? 'dark'
                    : 'light',
              )
            }
          >
            {theme === 'light' ? (
              <Sparkles />
            ) : theme === 'glass' ? (
              <Moon />
            ) : (
              <Sun />
            )}
          </Button>
        </div>
      </header>
      <aside className="dca-source-note" aria-label="数据源说明">
        <strong>数据源</strong>
        <span>
          <b>交易与成本</b> 嘉信 JSON · 本地导入
        </span>
        <span>
          <b>现价、今日涨跌与报价时间</b> Twelve Data 优先 · Finnhub 补充 ·
          Alpaca 扩展时段
        </span>
        <span>
          <b>Bo Pair 历史日线</b> Twelve Data · 手动更新
        </span>
        <span>
          <b>定投计划</b> 当前浏览器本地保存
        </span>
      </aside>
      <Dialog open={marketSettingsOpen} onOpenChange={setMarketSettingsOpen}>
        <DialogContent className="market-settings-dialog">
          <DialogHeader>
            <DialogTitle>行情设置</DialogTitle>
            <DialogDescription>
              API Key 仅保存在服务器环境变量中，页面不会读取或显示密钥内容。
            </DialogDescription>
          </DialogHeader>
          <div className="market-source-list">
            <div>
              <span>
                <strong>Twelve Data</strong>
                <small>首选行情源</small>
              </span>
              <b
                className={
                  marketSourceStatus?.twelveDataConfigured
                    ? 'configured'
                    : 'unconfigured'
                }
              >
                {marketSourceStatus
                  ? marketSourceStatus.twelveDataConfigured
                    ? '已配置'
                    : '未配置'
                  : '检查中…'}
              </b>
            </div>
            <div>
              <span>
                <strong>Finnhub</strong>
                <small>缺失标的自动补充</small>
              </span>
              <b
                className={
                  marketSourceStatus?.finnhubConfigured
                    ? 'configured'
                    : 'unconfigured'
                }
              >
                {marketSourceStatus
                  ? marketSourceStatus.finnhubConfigured
                    ? '已配置'
                    : '未配置'
                  : '检查中…'}
              </b>
            </div>
            <div>
              <span>
                <strong>Alpaca</strong>
                <small>夜盘指示价与延迟盘前/盘后</small>
              </span>
              <b
                className={
                  marketSourceStatus?.alpacaConfigured
                    ? 'configured'
                    : 'unconfigured'
                }
              >
                {marketSourceStatus
                  ? marketSourceStatus.alpacaConfigured
                    ? '已配置'
                    : '未配置'
                  : '检查中…'}
              </b>
            </div>
          </div>
          <div className="market-strategy-note">
            <strong>当前策略</strong>
            <span>
              正常盘优先 Twelve Data，缺失时由 Finnhub 补齐；夜盘及盘前盘后由
              Alpaca 覆盖有效的新报价。
            </span>
          </div>
          <div className="market-cache-row">
            <span>
              本地缓存 {Object.keys(quotes).length} 个报价 · {quotesUpdatedAt}
            </span>
            <Button
              variant="outline"
              disabled={!Object.keys(quotes).length}
              onClick={() => {
                setMarketSettingsOpen(false);
                setQuoteClearDialogOpen(true);
              }}
            >
              <Trash2 /> 清除现价缓存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空全部 JSON 记录？</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除当前浏览器中保存的全部交易记录及资产快照，操作无法撤销。之后仍可重新上传
              JSON。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearJsonRecords}>
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={quoteClearDialogOpen}
        onOpenChange={setQuoteClearDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清除现价缓存？</AlertDialogTitle>
            <AlertDialogDescription>
              这会清除当前浏览器保存的现价、今日涨跌及报价时间。交易记录、持仓成本和定投计划不会受到影响，之后可重新点击“更新行情”获取报价。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearQuoteCache}>
              确认清除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section
        className={`content dca-page ${activeView === 'dca' ? '' : 'view-hidden'}`}
      >
        <div className="dca-heading">
          <div>
            <p>MONTHLY INVESTING</p>
            <h1>
              {`DCA PLAN · ${dcaMonth}`}
              {dcaMonth === todayKey.slice(0, 7) ? (
                <span className="dca-current-badge">本月</span>
              ) : null}
            </h1>
            <span>实际执行直接取自交易记录，无需重复记账。</span>
          </div>
          <div className="dca-heading-actions">
            <input
              ref={dcaPlanFileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={importDcaPlanFile}
            />
            <div className="dca-month-picker">
              <Button
                variant="outline"
                size="icon"
                aria-label="查看上个月"
                disabled={selectedDcaMonth <= earliestDcaMonth}
                onClick={() => shiftDcaMonth(-1)}
              >
                <ChevronLeft />
              </Button>
              <Input
                type="month"
                aria-label="选择定投月份"
                min={earliestDcaMonth}
                max={latestDcaMonth}
                value={selectedDcaMonth}
                onChange={(event) => {
                  const month = event.target.value;
                  if (month >= earliestDcaMonth && month <= latestDcaMonth) {
                    setSelectedDcaMonth(month);
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="查看下个月"
                disabled={selectedDcaMonth >= latestDcaMonth}
                onClick={() => shiftDcaMonth(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={refreshQuotes}
              disabled={!holdings.positions.length || quotesLoading}
            >
              <RefreshCcw className={quotesLoading ? 'is-spinning' : ''} />
              更新行情
            </Button>
            <Button
              className="quote-clear-button"
              variant="outline"
              size="icon"
              aria-label="清除现价缓存"
              title="清除现价缓存"
              disabled={!Object.keys(quotes).length || quotesLoading}
              onClick={() => setQuoteClearDialogOpen(true)}
            >
              <Trash2 />
            </Button>
            <Button variant="outline" onClick={() => setDcaSettingsOpen(true)}>
              <Settings2 /> 设置计划
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" aria-label="定投计划文件操作">
                    <FileJson /> 文件
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportDcaPlans}>
                  <Download /> 导出定投计划 JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => dcaPlanFileInput.current?.click()}
                >
                  <Upload /> 导入定投计划 JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {dcaPlanNotice ? (
          <div className="dca-plan-notice" role="status">
            {dcaPlanNotice}
            <button aria-label="关闭提示" onClick={() => setDcaPlanNotice('')}>
              <X />
            </button>
          </div>
        ) : null}

        <section className="dca-period-layout">
          <article className="panel dca-year-panel">
            <div className="panel-head">
              <div>
                <p>年度节奏</p>
                <h2>
                  {dcaYear} 年第{dcaQuarter + 1}季度定投完成情况
                </h2>
              </div>
              <div className="dca-period-switch" aria-label="切换季度">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="查看上一季度"
                  disabled={
                    offsetMonthKey(dcaQuarterStart, -1) < earliestDcaMonth
                  }
                  onClick={() =>
                    setSelectedDcaMonth(
                      previousQuarterStart < earliestDcaMonth
                        ? earliestDcaMonth
                        : previousQuarterStart,
                    )
                  }
                >
                  <ChevronLeft />
                </Button>
                <span>
                  Q{dcaQuarter + 1} · {dcaQuarter * 3 + 1}—{dcaQuarter * 3 + 3}
                  月
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="查看下一季度"
                  disabled={nextQuarterStart > latestDcaMonth}
                  onClick={() => setSelectedDcaMonth(nextQuarterStart)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            <div className="dca-compact-metrics">
              <div>
                <span>当月计划</span>
                <strong>{displayMoney(dcaMonthlyTarget, 0)}</strong>
                <small>
                  {dcaPlanSymbols.length
                    ? `${dcaPlanSymbols.join('、')} 合计`
                    : '尚未启用'}
                </small>
              </div>
              <div>
                <span>已投入</span>
                <strong>{displayMoney(dcaMonthInvested, 2)}</strong>
                <small>
                  {dcaPlanRows.reduce((sum, plan) => sum + plan.monthTrades, 0)}{' '}
                  笔买入
                </small>
              </div>
              <div>
                <span>{dcaOverage > 0 ? '超额投入' : '待投入'}</span>
                <strong>
                  {displayMoney(dcaOverage > 0 ? dcaOverage : dcaRemaining, 2)}
                </strong>
                <small>{dcaOverage > 0 ? '已超过计划' : '距离计划'}</small>
              </div>
              <div>
                <span>账面现金</span>
                <strong>{displayMoney(ledgerCash, 2)}</strong>
                <small>
                  {ledgerCash >= dcaRemaining ? '可覆盖余下计划' : '低于待投入'}
                </small>
              </div>
            </div>
            <div className="dca-year-grid">
              {dcaYearMonths
                .slice(dcaQuarter * 3, dcaQuarter * 3 + 3)
                .map((item) => (
                  <button
                    key={item.key}
                    className={`dca-year-month ${item.key === dcaMonth ? 'active' : ''} ${item.progress >= 100 ? 'complete' : ''}`}
                    onClick={() => setSelectedDcaMonth(item.key)}
                    aria-label={`${item.label} 已投入 ${displayMoney(item.invested, 0)}`}
                  >
                    <span>{item.label}</span>
                    <i
                      className="dca-year-ring"
                      style={
                        {
                          '--ring-progress': `${Math.min(100, item.progress) * 3.6}deg`,
                        } as React.CSSProperties
                      }
                    >
                      <b>{item.progress.toFixed(0)}%</b>
                    </i>
                    <small>
                      {item.trades
                        ? `${item.trades} 笔 · ${displayMoney(item.invested, 0)}`
                        : '暂无买入'}
                    </small>
                  </button>
                ))}
            </div>
          </article>

          <article className="panel dca-calendar-panel">
            <div className="panel-head">
              <div>
                <p>
                  <CalendarDays /> 当月动作
                </p>
                <h2>{Number(dcaMonth.slice(5))} 月交易日历</h2>
              </div>
              <span className="dca-note">点选日期查看记录</span>
            </div>
            <div className="dca-calendar-week">
              <span>日</span>
              <span>一</span>
              <span>二</span>
              <span>三</span>
              <span>四</span>
              <span>五</span>
              <span>六</span>
            </div>
            <TooltipProvider>
              <div className="dca-calendar-grid">
                {dcaCalendar.map((cell, index) =>
                  cell ? (
                    cell.actions.length ? (
                      <UiTooltip key={cell.key}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className={`dca-calendar-day ${cell.buys.length ? 'buy' : ''} ${cell.actions.some((row) => row.Action === 'Sell') ? 'sell' : ''}`}
                              aria-label={`${cell.key}，${cell.buys.length} 笔买入，${cell.actions.filter((row) => row.Action === 'Sell').length} 笔卖出，查看完整记录`}
                              onClick={() =>
                                cell.actions.length === 1
                                  ? setSelected(cell.actions[0])
                                  : setCalendarDayDetails({
                                      key: cell.key,
                                      actions: cell.actions,
                                    })
                              }
                            />
                          }
                        >
                          <span>{cell.day}</span>
                          <span className="dca-calendar-markers">
                            {cell.buys.length ? (
                              <i className="buy">
                                买{cell.buys.length > 1 ? cell.buys.length : ''}
                              </i>
                            ) : null}
                            {cell.actions.some(
                              (row) => row.Action === 'Sell',
                            ) ? (
                              <i className="sell">
                                卖
                                {cell.actions.filter(
                                  (row) => row.Action === 'Sell',
                                ).length > 1
                                  ? cell.actions.filter(
                                      (row) => row.Action === 'Sell',
                                    ).length
                                  : ''}
                              </i>
                            ) : null}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          className="dca-calendar-tooltip"
                          side="top"
                        >
                          <strong>
                            {cell.key} · {cell.actions.length} 笔交易
                          </strong>
                          {cell.actions.map((row, rowIndex) => {
                            const summary = calendarTradeSummary(row);
                            return (
                              <div
                                className="dca-calendar-trade"
                                key={rowIndex}
                              >
                                <span
                                  className={
                                    row.Action === 'Buy' ? 'pos' : 'neg'
                                  }
                                >
                                  {summary.label} · {row.Symbol}
                                </span>
                                <span>
                                  {amountsMasked
                                    ? MASKED_VALUE
                                    : summary.shares}
                                  {' · '}
                                  {amountsMasked
                                    ? MASKED_VALUE
                                    : summary.amount}
                                </span>
                              </div>
                            );
                          })}
                        </TooltipContent>
                      </UiTooltip>
                    ) : (
                      <span className="dca-calendar-day" key={cell.key}>
                        <span>{cell.day}</span>
                      </span>
                    )
                  ) : (
                    <span
                      className="dca-calendar-empty"
                      key={`empty-${index}`}
                    />
                  ),
                )}
              </div>
            </TooltipProvider>
            <div className="dca-calendar-legend">
              <span>
                <i className="buy" />
                买入
              </span>
              <span>
                <i className="sell" />
                卖出
              </span>
              <small>有动作的日期会标记</small>
            </div>
          </article>
          <Dialog
            open={Boolean(calendarDayDetails)}
            onOpenChange={(open) => !open && setCalendarDayDetails(null)}
          >
            <DialogContent className="dca-calendar-dialog">
              <DialogHeader>
                <DialogTitle>{calendarDayDetails?.key} 交易记录</DialogTitle>
                <DialogDescription>
                  点击一笔交易查看完整原始记录。
                </DialogDescription>
              </DialogHeader>
              <div className="dca-calendar-dialog-list">
                {calendarDayDetails?.actions.map((row, index) => {
                  const summary = calendarTradeSummary(row);
                  return (
                    <button
                      type="button"
                      key={index}
                      onClick={() => {
                        setCalendarDayDetails(null);
                        setSelected(row);
                      }}
                    >
                      <strong>
                        {summary.label} · {row.Symbol}
                      </strong>
                      <span>
                        {amountsMasked ? MASKED_VALUE : summary.shares}
                        {' · '}
                        {amountsMasked ? MASKED_VALUE : summary.amount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </section>

        <section className="panel dca-plan-panel">
          <div className="panel-head">
            <div>
              <p>执行面板</p>
              <h2>当月定投计划</h2>
            </div>
            <span className="dca-note">额度是节奏参考，不自动下单</span>
          </div>
          <div className="dca-plan-grid">
            {dcaPlanRows.map((plan) => {
              const ringProgress = Math.min(100, Math.max(0, plan.progress));
              const planSymbolsLabel = [plan.symbol, plan.secondarySymbol]
                .filter(Boolean)
                .join(' / ');
              const shareEstimate = (symbol: string) => {
                const price = quotes[symbol]?.current;
                return price && price > 0
                  ? (plan.remaining / price).toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })
                  : '';
              };
              const remainingShares =
                plan.priority === 'secondary'
                  ? [
                      shareEstimate(plan.symbol)
                        ? `${plan.symbol} ${shareEstimate(plan.symbol)} 股`
                        : '',
                      plan.secondarySymbol &&
                      shareEstimate(plan.secondarySymbol)
                        ? `${plan.secondarySymbol} ${shareEstimate(plan.secondarySymbol)} 股`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' / ')
                  : shareEstimate(plan.symbol)
                    ? `${shareEstimate(plan.symbol)} 股`
                    : '';
              return (
                <article
                  className={`dca-plan-card ${plan.priority}`}
                  key={`${plan.priority}-${planSymbolsLabel}`}
                >
                  <div className="dca-plan-top">
                    <div className="dca-symbol">
                      <i>
                        {plan.priority === 'secondary'
                          ? '防御'
                          : plan.symbol.slice(0, 2)}
                      </i>
                      <div>
                        <strong>
                          {plan.priority === 'secondary'
                            ? planSymbolsLabel
                            : plan.symbol}
                        </strong>
                        <span>
                          {plan.priority === 'primary' ? '主定投' : '次定投'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`dca-status ${plan.progress >= 100 ? 'done' : ''}`}
                    >
                      {plan.overage > 0
                        ? `超额 ${displayMoney(plan.overage, 0)}`
                        : plan.progress >= 100
                          ? '当月完成'
                          : '进行中'}
                    </span>
                  </div>
                  <div className="dca-plan-body">
                    <div
                      className="dca-progress-ring"
                      style={
                        {
                          '--ring-progress': `${ringProgress * 3.6}deg`,
                        } as React.CSSProperties
                      }
                      role="img"
                      aria-label={`${plan.priority === 'secondary' ? '防御类' : plan.symbol} 完成 ${plan.progress.toFixed(0)}%`}
                    >
                      <div>
                        <strong>{plan.progress.toFixed(0)}%</strong>
                        <span>
                          {plan.progress >= 100 ? '已完成' : '完成度'}
                        </span>
                      </div>
                    </div>
                    <div className="dca-plan-numbers">
                      <span>当月已投入</span>
                      <strong>{displayMoney(plan.invested, 2)}</strong>
                      <small className="dca-invested-shares">
                        {amountsMasked ? MASKED_VALUE : plan.monthShares}
                      </small>
                      <small>计划 {displayMoney(plan.monthlyTarget, 0)}</small>
                    </div>
                  </div>
                  <div className="dca-plan-meta">
                    <span>当月 {plan.monthTrades} 笔</span>
                    <span>
                      {plan.lastBuy
                        ? `最近 ${plan.lastBuy.slice(5).replace('-', '/')}`
                        : '尚无买入'}
                    </span>
                    <span>
                      {plan.priority === 'secondary'
                        ? '两者投入合并统计'
                        : quotes[plan.symbol]
                          ? `现价 ${displayMoney(quotes[plan.symbol].current, 2)}`
                          : '行情未更新'}
                    </span>
                  </div>
                  <div className="dca-plan-footer">
                    <div>
                      <span>{plan.overage > 0 ? '超额投入' : '尚需投入'}</span>
                      <strong>
                        {displayMoney(
                          plan.overage > 0 ? plan.overage : plan.remaining,
                          2,
                        )}
                      </strong>
                      {!plan.overage && plan.remaining > 0 ? (
                        <small className="dca-share-estimate">
                          {amountsMasked
                            ? MASKED_VALUE
                            : remainingShares
                              ? `按现价约 ${remainingShares}`
                              : '更新行情后估算股数'}
                        </small>
                      ) : null}
                    </div>
                    <span className="dca-readonly-label">自动读取交易记录</span>
                  </div>
                </article>
              );
            })}
            {!dcaPlanRows.length ? (
              <div className="empty-state dca-plan-empty">
                请在“设置计划”中填写至少一个定投标的
              </div>
            ) : null}
          </div>
        </section>

        <div className="dca-analysis-layout">
          <section className="panel dca-analysis-panel">
            <div className="panel-head">
              <div>
                <p>持仓分析</p>
                <h2>定投标的</h2>
              </div>
              <span className="dca-note">
                {dcaMarketWeightReady
                  ? '表格按市值 · 饼图按成本'
                  : dcaAnalysisRows.some((row) => row.quantity > 0)
                    ? '行情未覆盖全部定投持仓，市值占比待更新'
                    : '暂无定投持仓 · 饼图按成本'}
              </span>
            </div>
            <div className="dca-monthly-average-grid">
              {dcaMonthlyAverages.map((item) => (
                <div key={item.symbol}>
                  <span>{item.symbol} · 当月每股现金成本</span>
                  <strong>
                    {item.quantity ? displayMoney(item.averageCost, 2) : '—'}
                  </strong>
                  <small>
                    {item.quantity
                      ? `${amountsMasked ? MASKED_VALUE : `${item.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })} 股`} · ${displayMoney(item.invested, 2)}`
                      : '当月无买入'}
                  </small>
                </div>
              ))}
            </div>
            <div className="dca-analysis-table-wrap">
              <table className="dca-analysis-table">
                <thead>
                  <tr>
                    <th>标的</th>
                    <th>持仓数量</th>
                    <th>现金均价</th>
                    <th>真实现金成本</th>
                    <th>现价 / 今日</th>
                    <th>市值 / 浮盈亏</th>
                    <th title="占定投篮子持仓市值的比例；所有相关持仓取得报价后显示，右侧圆环仍按成本计算">
                      市值占比
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dcaAnalysisRows.map((row) => {
                    const share = dcaMarketWeightReady
                      ? (row.marketValue / dcaAnalysisMarket) * 100
                      : 0;
                    const costShare = dcaAnalysisCost
                      ? (row.cost / dcaAnalysisCost) * 100
                      : null;
                    const shareHint =
                      dcaMarketWeightReady && costShare !== null
                        ? `市值占比 ${share.toFixed(1)}%；成本占比 ${costShare.toFixed(1)}%；较成本 ${signedPercentagePoints(share - costShare)}`
                        : undefined;
                    const assetColor = [
                      '#2e78c7',
                      '#9c5b32',
                      '#c68a35',
                      '#728c67',
                    ][Math.max(0, dcaPlanSymbols.indexOf(row.symbol)) % 4];
                    return (
                      <tr key={row.symbol}>
                        <td>
                          <div className="holding-identity dca-asset-identity">
                            <i
                              style={
                                {
                                  '--asset-color':
                                    THEME_COLORS[row.industryTheme],
                                } as React.CSSProperties
                              }
                            >
                              {row.symbol.slice(0, 2)}
                            </i>
                            <div>
                              <div className="holding-symbol-line">
                                <strong>{row.symbol}</strong>
                                <Badge
                                  className="asset-type-badge"
                                  style={
                                    {
                                      '--asset-color':
                                        THEME_COLORS[row.industryTheme],
                                    } as React.CSSProperties
                                  }
                                >
                                  {row.industryTheme}
                                </Badge>
                              </div>
                              <span>{row.description}</span>
                            </div>
                          </div>
                        </td>
                        <td className="numeric mono">
                          {amountsMasked
                            ? MASKED_VALUE
                            : row.quantity
                              ? row.quantity.toLocaleString('en-US', {
                                  maximumFractionDigits: 4,
                                })
                              : '—'}
                        </td>
                        <td className="numeric mono">
                          {row.cost ? displayMoney(row.averageCost, 2) : '—'}
                        </td>
                        <td className="numeric mono">
                          {row.cost ? displayMoney(row.cost, 2) : '—'}
                        </td>
                        <td className="numeric mono">
                          {row.quote ? (
                            <div className="market-cell">
                              <strong>
                                {displayMoney(row.quote.current, 2)}
                              </strong>
                              <small
                                className={`market-change quote-change ${row.quote.change >= 0 ? 'pos' : 'neg'}`}
                              >
                                <span>
                                  {amountsMasked
                                    ? MASKED_VALUE
                                    : signedMoney(row.quote.change)}
                                </span>
                                <span>
                                  {signedPercent(row.quote.changePercent)}
                                </span>
                              </small>
                              <QuoteMeta quote={row.quote} />
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="numeric mono">
                          {row.quote && row.cost ? (
                            <div className="market-cell">
                              <strong>
                                {displayMoney(row.marketValue, 2)}
                              </strong>
                              <small
                                className={`market-change ${row.pnl >= 0 ? 'pos' : 'neg'}`}
                              >
                                <span>
                                  {amountsMasked
                                    ? MASKED_VALUE
                                    : signedMoney(row.pnl)}
                                </span>
                                <span>
                                  {signedPercent((row.pnl / row.cost) * 100)}
                                </span>
                              </small>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div
                            className="share-cell"
                            title={shareHint}
                            aria-label={shareHint}
                            role={shareHint ? 'group' : undefined}
                            tabIndex={shareHint ? 0 : undefined}
                          >
                            <strong>
                              {dcaMarketWeightReady
                                ? `${share.toFixed(1)}%`
                                : '—'}
                            </strong>
                            <span>
                              {share > 0 ? (
                                <i
                                  style={{
                                    width: `${share}%`,
                                    background: assetColor,
                                  }}
                                />
                              ) : null}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel dca-insights-panel">
            <div className="panel-head">
              <div>
                <p>成本构成</p>
                <h2>定投篮子表现</h2>
              </div>
              <span className="dca-note">点击图例隐藏 / 显示</span>
            </div>
            <div className="dca-analysis-side">
              <div className="dca-performance-hero">
                <span>当前市值</span>
                <strong>
                  {dcaAnalysisMarket ? displayMoney(dcaAnalysisMarket, 2) : '—'}
                </strong>
                <div className={dcaAnalysisPnl >= 0 ? 'pos' : 'neg'}>
                  <b>
                    {dcaAnalysisMarket
                      ? `${dcaAnalysisPnl >= 0 ? '+' : ''}${displayMoney(dcaAnalysisPnl, 2)}`
                      : '—'}
                  </b>
                  <small>
                    {dcaAnalysisMarket
                      ? `${dcaAnalysisReturn >= 0 ? '+' : ''}${dcaAnalysisReturn.toFixed(2)}%`
                      : '暂无行情'}
                  </small>
                </div>
              </div>
              <div className="dca-performance-cost">
                <span>真实现金成本</span>
                <strong>{displayMoney(dcaAnalysisCost, 2)}</strong>
              </div>
              <div className="dca-allocation-layout">
                <div className="dca-cost-chart-wrap">
                  <div className="dca-cost-chart">
                    {dcaCostChartData.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={displayedDcaCostChartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={58}
                            outerRadius={82}
                            paddingAngle={2}
                            stroke="none"
                            isAnimationActive={false}
                            activeShape={false}
                          >
                            {displayedDcaCostChartData.map((item) => (
                              <Cell
                                key={item.name}
                                fill={item.color}
                                stroke="none"
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => money(value, 2)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="dca-chart-empty">
                        导入交易记录后显示成本构成
                      </div>
                    )}
                  </div>
                  {dcaCostChartData.length ? (
                    <div className="dca-chart-center">
                      <span>已显示</span>
                      <strong>{displayMoney(displayedDcaCost, 0)}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="dca-cost-legend" aria-label="定投标的显示控制">
                  {dcaCostChartData.map((item) => {
                    const excluded = excludedDcaSymbols.has(item.name);
                    const share =
                      !excluded && displayedDcaCost
                        ? (item.value / displayedDcaCost) * 100
                        : 0;
                    return (
                      <button
                        key={item.name}
                        className={excluded ? 'excluded' : undefined}
                        aria-label={`${excluded ? '显示' : '隐藏'}${item.name}`}
                        aria-pressed={!excluded}
                        onClick={() =>
                          setExcludedDcaSymbols((current) => {
                            const next = new Set(current);
                            if (next.has(item.name)) next.delete(item.name);
                            else next.add(item.name);
                            return next;
                          })
                        }
                      >
                        <i style={{ background: item.color }} />
                        <span>{item.name}</span>
                        <strong>
                          {excluded ? '已隐藏' : `${share.toFixed(1)}%`}
                        </strong>
                        <small>{displayMoney(item.value, 0)}</small>
                      </button>
                    );
                  })}
                  {!dcaCostChartData.length ? (
                    <div className="dca-legend-empty">暂无持仓成本</div>
                  ) : null}
                </div>
              </div>
              <div className="dca-included-note">
                <span>点击标的可切换圆环显示</span>
                <strong>
                  {displayedDcaCostChartData.length}/{dcaCostChartData.length}{' '}
                  个标的
                </strong>
              </div>
            </div>
          </section>
        </div>

        <section className="dca-lower-grid">
          <article className="panel dca-history dca-transactions-panel">
            <div className="panel-head">
              <div>
                <p>月度流水</p>
                <h2>{Number(dcaMonth.slice(5))}月定投交易记录</h2>
              </div>
              <span className="dca-note">
                {dcaMonthTransactions.length} 条相关记录
              </span>
            </div>
            <div className="table-scroll dca-transactions-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{dcaSortHead('Date', '日期')}</TableHead>
                    <TableHead>{dcaSortHead('Action', '操作')}</TableHead>
                    <TableHead>{dcaSortHead('Symbol', '代码')}</TableHead>
                    <TableHead>
                      {dcaSortHead('Description', '证券名称')}
                    </TableHead>
                    <TableHead className="text-right">
                      {dcaSortHead('Quantity', '数量')}
                    </TableHead>
                    <TableHead className="text-right">
                      {dcaSortHead('Price', '成交价')}
                    </TableHead>
                    <TableHead className="text-right">
                      {dcaSortHead('Fees & Comm', '手续费')}
                    </TableHead>
                    <TableHead className="text-right">
                      {dcaSortHead('Amount', '交易金额')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dcaMonthTransactions.map((row, index) => (
                    <TableRow
                      key={`${transactionFingerprint(row)}-${index}`}
                      tabIndex={0}
                      role="button"
                      className="dca-current-month-row"
                      onClick={() => setSelected(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelected(row);
                        }
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
                      <TableCell className="ticker">{row.Symbol}</TableCell>
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
            {!dcaMonthTransactions.length && (
              <div className="empty-state">当月没有定投标的相关交易记录</div>
            )}
          </article>
        </section>

        <section className="panel table-panel dca-all-transactions-panel">
          <div className="panel-head table-title">
            <div>
              <p>完整流水</p>
              <h2>全部定投交易记录</h2>
            </div>
            <span className="dca-note">{dcaPlanSymbols.join('、')}</span>
          </div>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dcaSortHead('Date', '日期')}</TableHead>
                  <TableHead>{dcaSortHead('Action', '操作')}</TableHead>
                  <TableHead>{dcaSortHead('Symbol', '代码')}</TableHead>
                  <TableHead>
                    {dcaSortHead('Description', '证券名称')}
                  </TableHead>
                  <TableHead className="text-right">
                    {dcaSortHead('Quantity', '数量')}
                  </TableHead>
                  <TableHead className="text-right">
                    {dcaSortHead('Price', '成交价')}
                  </TableHead>
                  <TableHead className="text-right">
                    {dcaSortHead('Fees & Comm', '手续费')}
                  </TableHead>
                  <TableHead className="text-right">
                    {dcaSortHead('Amount', '交易金额')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleDcaTransactions.map((row, index) => (
                  <TableRow
                    key={`${transactionFingerprint(row)}-all-${index}`}
                    tabIndex={0}
                    role="button"
                    onClick={() => setSelected(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ')
                        setSelected(row);
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
                    <TableCell className="ticker">{row.Symbol}</TableCell>
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
          {!visibleDcaTransactions.length && (
            <div className="empty-state">没有定投标的相关交易记录</div>
          )}
          <div className="table-footer">
            <span>
              显示{' '}
              {dcaTransactions.length
                ? (currentDcaTransactionPage - 1) * PAGE_SIZE + 1
                : 0}
              —
              {Math.min(
                currentDcaTransactionPage * PAGE_SIZE,
                dcaTransactions.length,
              )}{' '}
              / {dcaTransactions.length} 条
            </span>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    text="上一页"
                    aria-disabled={currentDcaTransactionPage <= 1}
                    onClick={(event) => {
                      event.preventDefault();
                      setDcaTransactionPage((value) => Math.max(1, value - 1));
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="page-count">
                    {currentDcaTransactionPage} / {dcaTransactionTotalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    text="下一页"
                    aria-disabled={
                      currentDcaTransactionPage >= dcaTransactionTotalPages
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      setDcaTransactionPage((value) =>
                        Math.min(dcaTransactionTotalPages, value + 1),
                      );
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </section>
      </section>

      <Dialog open={dcaSettingsOpen} onOpenChange={setDcaSettingsOpen}>
        <DialogContent className="dca-settings-dialog">
          <DialogHeader>
            <DialogTitle>设置每月定投计划</DialogTitle>
            <DialogDescription>
              修改后，定投页的历史统计、持仓分析和流水会全部切换到新标的。第三组的两个防御标的共用一份额度。
              停用计划不会删除已填写的代码和额度。
            </DialogDescription>
          </DialogHeader>
          <div className="dca-settings-list">
            {dcaPlans.map((plan, index) => (
              <div
                className={`${
                  plan.priority === 'secondary'
                    ? 'dca-settings-secondary'
                    : 'dca-settings-primary'
                } ${plan.enabled === false ? 'inactive-plan' : ''}`}
                key={index}
              >
                <span>
                  <strong>
                    {plan.priority === 'primary'
                      ? `主定投 ${index + 1}`
                      : '防御类'}
                  </strong>
                  <small>
                    {plan.priority === 'primary' ? '主定投' : '防御类共享额度'}
                  </small>
                  <label className="dca-plan-enabled">
                    <Switch
                      checked={plan.enabled !== false}
                      onCheckedChange={(checked) =>
                        setDcaPlans((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, enabled: checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>
                      {plan.enabled === false
                        ? '已停用'
                        : [plan.symbol, plan.secondarySymbol].some(Boolean)
                          ? '已启用'
                          : '未填写标的'}
                    </span>
                  </label>
                </span>
                <Label>
                  <span>
                    {plan.priority === 'secondary' ? '防御标的 1' : '标的代码'}
                  </span>
                  <Input
                    value={plan.symbol}
                    maxLength={12}
                    onChange={(event) =>
                      setDcaPlans((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                symbol: event.target.value.trim().toUpperCase(),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Label>
                {plan.priority === 'secondary' ? (
                  <Label>
                    <span>防御标的 2</span>
                    <Input
                      value={plan.secondarySymbol ?? ''}
                      maxLength={12}
                      onChange={(event) =>
                        setDcaPlans((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  secondarySymbol: event.target.value
                                    .trim()
                                    .toUpperCase(),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </Label>
                ) : null}
                <Label>
                  <span>每月额度</span>
                  <Input
                    type="number"
                    min="0"
                    step="50"
                    value={plan.monthlyTarget}
                    onChange={(event) =>
                      setDcaPlans((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                monthlyTarget: Number(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDcaSettingsOpen(false)}>
              取消
            </Button>
            <Button onClick={saveDcaPlans}>保存计划</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section
        className={`content ${activeView === 'portfolio' ? '' : 'view-hidden'}`}
      >
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
            <span className="data-meta-pill">
              累计手续费 {displayMoney(allStats.fees, 2)}
            </span>
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
        <section className="panel holdings-panel">
          <div className="portfolio-surface">
            <div className="portfolio-overview">
              <div className="portfolio-overview-main">
                <p>PORTFOLIO · USD</p>
                <span>当前总资产</span>
                <strong>{displayMoney(totalAssets, 2)}</strong>
                <div
                  className={`portfolio-day-change ${marketSummary.dayChange >= 0 ? 'pos' : 'neg'}`}
                >
                  {marketSummary.quotedCount ? (
                    <>
                      <span>
                        {marketSummary.dayChange >= 0 ? '+' : ''}
                        {displayMoney(marketSummary.dayChange, 2)}
                      </span>
                      <b>
                        {marketDayChangePercent >= 0 ? '+' : ''}
                        {marketDayChangePercent.toFixed(2)}%
                      </b>
                      <small>今日</small>
                    </>
                  ) : (
                    <small>点击更新获取最新行情</small>
                  )}
                </div>
              </div>
              <div className="portfolio-overview-actions">
                <div className="quote-action-row">
                  <Button
                    onClick={refreshQuotes}
                    disabled={!holdings.positions.length || quotesLoading}
                  >
                    <RefreshCcw
                      className={quotesLoading ? 'is-spinning' : ''}
                    />
                    {quotesLoading ? '更新中…' : '更新行情'}
                  </Button>
                  <Button
                    className="quote-clear-button"
                    variant="outline"
                    size="icon"
                    aria-label="清除现价缓存"
                    title="清除现价缓存"
                    disabled={!Object.keys(quotes).length || quotesLoading}
                    onClick={() => setQuoteClearDialogOpen(true)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <small>
                  行情覆盖 {marketSummary.quotedCount}/
                  {holdings.positions.length}
                  {' · '}
                  {quotesUpdatedAt}
                  {quoteRefreshStatus ? ` · ${quoteRefreshStatus}` : ''}
                  {quotesError ? ` · ${quotesError}` : ''}
                </small>
              </div>
            </div>
            <div className="portfolio-metrics">
              <div>
                <span>当前持仓市值</span>
                <strong>
                  {marketSummary.quotedCount
                    ? displayMoney(marketSummary.marketValue, 2)
                    : '—'}
                </strong>
              </div>
              <div>
                <span>账面现金</span>
                <strong>{displayMoney(ledgerCash, 2)}</strong>
              </div>
              <div>
                <span>真实现金成本</span>
                <strong>{displayMoney(holdings.totalCost, 2)}</strong>
              </div>
              <div>
                <span>累计净入金</span>
                <strong>{displayMoney(externalNetContributions, 2)}</strong>
              </div>
              <div>
                <span>账户总盈亏</span>
                <strong className={totalPnl >= 0 ? 'pos' : 'neg'}>
                  {holdings.positions.length > 0 &&
                  marketSummary.quotedCount === holdings.positions.length
                    ? `${displayMoney(totalPnl, 2)} · ${totalPnlPercent >= 0 ? '+' : ''}${totalPnlPercent.toFixed(2)}%`
                    : '—'}
                </strong>
              </div>
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
                    <col className="holding-col-price" />
                    <col className="holding-col-market" />
                    <col className="holding-col-share" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>标的</th>
                      <th className="numeric">持仓数量</th>
                      <th className="numeric">现金均价</th>
                      <th className="numeric">真实现金成本</th>
                      <th className="numeric">现价 / 今日</th>
                      <th className="numeric">市值 / 浮盈亏</th>
                      <th title="占全部持仓市值的比例（不含现金）；所有持仓取得报价后显示，饼图仍按成本计算">
                        市值占比
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {typedHoldings.map((item) => {
                      const quote = quotes[item.symbol];
                      const marketValue = quote
                        ? item.quantity * quote.current
                        : 0;
                      const share = portfolioMarketWeightReady
                        ? (marketValue / marketSummary.marketValue) * 100
                        : 0;
                      const costShare = holdings.totalCost
                        ? (item.cost / holdings.totalCost) * 100
                        : null;
                      const shareHint =
                        portfolioMarketWeightReady && costShare !== null
                          ? `市值占比 ${share.toFixed(1)}%；成本占比 ${costShare.toFixed(1)}%；较成本 ${signedPercentagePoints(share - costShare)}`
                          : undefined;
                      const unrealizedPnl = quote ? marketValue - item.cost : 0;
                      return (
                        <tr key={item.symbol}>
                          <td>
                            <div className="holding-identity">
                              <i
                                style={
                                  {
                                    '--asset-color':
                                      THEME_COLORS[item.industryTheme],
                                  } as React.CSSProperties
                                }
                              >
                                {item.symbol.slice(0, 2)}
                              </i>
                              <div>
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
                              </div>
                            </div>
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
                          <td className="numeric mono">
                            {quote ? (
                              <div className="market-cell">
                                <strong>
                                  {displayMoney(quote.current, 2)}
                                </strong>
                                <small
                                  className={`market-change quote-change ${quote.change >= 0 ? 'pos' : 'neg'}`}
                                >
                                  <span>
                                    {amountsMasked
                                      ? MASKED_VALUE
                                      : signedMoney(quote.change)}
                                  </span>
                                  <span>
                                    {signedPercent(quote.changePercent)}
                                  </span>
                                </small>
                                <QuoteMeta quote={quote} />
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="numeric mono">
                            {quote ? (
                              <div className="market-cell">
                                <strong>{displayMoney(marketValue, 2)}</strong>
                                <small
                                  className={`market-change ${unrealizedPnl >= 0 ? 'pos' : 'neg'}`}
                                >
                                  <span>
                                    {amountsMasked
                                      ? MASKED_VALUE
                                      : signedMoney(unrealizedPnl)}
                                  </span>
                                  <span>
                                    {item.cost
                                      ? signedPercent(
                                          (unrealizedPnl / item.cost) * 100,
                                        )
                                      : '—'}
                                  </span>
                                </small>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <div
                              className="share-cell"
                              title={shareHint}
                              aria-label={shareHint}
                              role={shareHint ? 'group' : undefined}
                              tabIndex={shareHint ? 0 : undefined}
                            >
                              <strong>
                                {portfolioMarketWeightReady
                                  ? `${share.toFixed(1)}%`
                                  : '—'}
                              </strong>
                              <span>
                                {share > 0 ? (
                                  <i
                                    style={{
                                      width: `${share}%`,
                                      background:
                                        THEME_COLORS[item.industryTheme],
                                    }}
                                  />
                                ) : null}
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
        <section className="panel pair-panel">
          <div className="panel-head pair-panel-head">
            <div>
              <p>相对强弱</p>
              <h2>Bo Pair Indicator</h2>
            </div>
            <div className="pair-panel-actions">
              <div className="pair-signal-legend">
                <span>
                  ROC {PAIR_LENGTH} · 确认线 0 · 过滤幅度 {PAIR_ARM_THRESHOLD}
                </span>
                <small className="pair-signal-up">
                  <i className="up" />
                  向上确认
                </small>
                <small className="pair-signal-down">
                  <i className="down" />
                  向下确认
                </small>
              </div>
              <Button onClick={refreshPairIndicators} disabled={pairLoading}>
                <RefreshCcw className={pairLoading ? 'is-spinning' : ''} />
                {pairLoading ? '更新中…' : '更新指标'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Bo Pair 更多操作"
                      title="更多操作"
                    >
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!pairIndicators.length}
                    onClick={clearPairIndicatorCache}
                  >
                    <Trash2 /> 清空指标缓存
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="pair-rotation-note">
            <span className="pair-signal-down">
              <b>向下确认</b>：资金进攻，偏向科技股
            </span>
            <span className="pair-signal-up">
              <b>向上确认</b>：资金防守，偏向质量股 / 价值股
            </span>
          </div>
          {pairIndicators.length ? (
            <div className="pair-grid">
              {PAIR_SYMBOLS.map((symbol) => {
                const indicator = pairIndicators.find(
                  (item) => item.symbol === symbol,
                );
                if (!indicator) {
                  return (
                    <article className="pair-card pair-card-empty" key={symbol}>
                      <strong>{symbol} / QQQ</strong>
                      <span>历史行情不可用</span>
                    </article>
                  );
                }
                return (
                  <article className="pair-card" key={symbol}>
                    <div className="pair-card-head">
                      <div>
                        <strong>{symbol} / QQQ</strong>
                        <small>相对价格 ROC</small>
                      </div>
                      <b className={indicator.value >= 0 ? 'pos' : 'neg'}>
                        {indicator.value >= 0 ? '+' : ''}
                        {indicator.value.toFixed(2)}%
                      </b>
                    </div>
                    <div className="pair-chart">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                      >
                        <LineChart data={indicator.points}>
                          <ReferenceLine
                            y={0}
                            stroke="var(--border)"
                            strokeDasharray="4 4"
                          />
                          <Tooltip
                            labelFormatter={(label) => String(label)}
                            formatter={(value) => [
                              `${Number(value).toFixed(2)}%`,
                              'ROC',
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            dot={<PairSignalDot />}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="pair-status-row">
                      <span
                        className={
                          indicator.armUp && !indicator.armDown
                            ? 'pair-signal-up'
                            : indicator.armDown && !indicator.armUp
                              ? 'pair-signal-down'
                              : undefined
                        }
                      >
                        {indicator.armUp && indicator.armDown
                          ? '双向信号已武装'
                          : indicator.armUp
                            ? '向上信号已武装'
                            : indicator.armDown
                              ? '向下信号已武装'
                              : '尚未武装'}
                      </span>
                      <small className="pair-status-reason">
                        {indicator.armUp && indicator.armDown
                          ? '指标已先后进入 ±1% 区域；下一次有效穿越零轴将触发对应方向。'
                          : indicator.armUp
                            ? '指标曾进入 -1% 以下，现等待由下向上穿越零轴。'
                            : indicator.armDown
                              ? '指标曾进入 +1% 以上，现等待由上向下穿越零轴。'
                              : '指标需先远离零轴达到 -1% 或 +1%，才具备下一次反向确认资格。'}
                      </small>
                      <small>
                        最近信号：
                        {indicator.lastSignal ? (
                          <>
                            <b
                              className={
                                indicator.lastSignal === 'up'
                                  ? 'pair-signal-up'
                                  : 'pair-signal-down'
                              }
                            >
                              {indicator.lastSignal === 'up'
                                ? '向上确认'
                                : '向下确认'}
                            </b>{' '}
                            · {indicator.lastSignalDate}
                          </>
                        ) : (
                          '暂无'
                        )}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="pair-empty">
              点击“更新指标”获取四组配对的历史日线并计算确认信号。
            </div>
          )}
          <p className="definition-note pair-update-note">
            {pairError ? `${pairError} · ` : ''}最近更新：{pairUpdatedAt}
          </p>
        </section>
        <section className="panel income-panel">
          <div className="panel-head">
            <div>
              <p>收益归因</p>
              <h2>收益来源拆解</h2>
            </div>
            <span className="panel-note">基于当前累计交易记录</span>
          </div>
          <div className="income-breakdown-grid">
            <article className="income-total">
              <span>账户总盈亏</span>
              <strong className={totalPnl >= 0 ? 'pos' : 'neg'}>
                {holdings.positions.length > 0 &&
                marketSummary.quotedCount === holdings.positions.length
                  ? displayMoney(totalPnl, 2)
                  : '—'}
              </strong>
              <small>总资产减记录内净入金</small>
            </article>
            <article>
              <span>浮动盈亏</span>
              <strong
                className={marketSummary.unrealizedPnl >= 0 ? 'pos' : 'neg'}
              >
                {holdings.positions.length > 0 &&
                marketSummary.quotedCount === holdings.positions.length
                  ? displayMoney(marketSummary.unrealizedPnl, 2)
                  : '—'}
              </strong>
              <small>当前市值与真实现金成本之差</small>
            </article>
            <article>
              <span>FIFO 已实现盈亏</span>
              <strong
                className={holdings.totalRealizedPnl >= 0 ? 'pos' : 'neg'}
              >
                {displayMoney(holdings.totalRealizedPnl, 2)}
              </strong>
              <small>卖出回款减匹配批次成本</small>
            </article>
            <article>
              <span>分红收入</span>
              <strong className={cashReturns.dividends >= 0 ? 'pos' : 'neg'}>
                {displayMoney(cashReturns.dividends, 2)}
              </strong>
              <small>自动识别含 Dividend 的流水</small>
            </article>
            <article>
              <span>利息收入</span>
              <strong className={cashReturns.interest >= 0 ? 'pos' : 'neg'}>
                {displayMoney(cashReturns.interest, 2)}
              </strong>
              <small>自动识别含 Interest 的流水</small>
            </article>
            <article>
              <span>手续费</span>
              <strong className={allStats.fees ? 'neg' : ''}>
                {displayMoney(-Math.abs(allStats.fees), 2)}
              </strong>
              <small>仅作成本观察，不重复计入合计</small>
            </article>
          </div>
          <p className="definition-note">
            分红、利息尚未产生时显示为
            $0.00；账户总盈亏已经包含这些现金收益。各项不强制相加，手续费可能已包含在成交金额及
            FIFO 成本中。
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
                <strong>
                  {displayMoney(holdings.totalRealizedProceeds, 2)}
                </strong>
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
                <div className="realized-chart-head">
                  <div>
                    <span>盈亏贡献</span>
                    <strong>已平仓标的排行</strong>
                  </div>
                  <small>按绝对盈亏排序</small>
                </div>
                <div className="realized-performance-list">
                  {holdings.realizedPositions.slice(0, 8).map((item) => (
                    <div className="realized-performance-row" key={item.symbol}>
                      <div className="realized-performance-label">
                        <i
                          style={{
                            background:
                              THEME_COLORS[
                                classifyIndustry(item.symbol, item.description)
                              ],
                          }}
                        />
                        <strong>{item.symbol}</strong>
                      </div>
                      <div className="realized-performance-value">
                        <strong className={item.pnl >= 0 ? 'pos' : 'neg'}>
                          {item.pnl >= 0 ? '+' : ''}
                          {displayMoney(item.pnl, 2)}
                        </strong>
                        <small className={item.returnRate >= 0 ? 'pos' : 'neg'}>
                          {item.returnRate >= 0 ? '+' : ''}
                          {(item.returnRate * 100).toFixed(1)}%
                        </small>
                      </div>
                      <span className="realized-performance-track">
                        <i
                          className={item.pnl >= 0 ? 'gain' : 'loss'}
                          style={{
                            width: `${Math.max(6, (Math.abs(item.pnl) / maxRealizedPnl) * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="realized-table-wrap">
                <table className="realized-table">
                  <thead>
                    <tr>
                      <th>标的</th>
                      <th className="numeric">买入价格</th>
                      <th className="numeric">卖出价格</th>
                      <th className="numeric">卖出数量</th>
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
                          <div className="price-stack">
                            <strong>
                              {displayMoney(
                                item.quantity
                                  ? item.matchedCost / item.quantity
                                  : 0,
                                2,
                              )}
                            </strong>
                            <small>
                              总价 {displayMoney(item.matchedCost, 2)}
                            </small>
                          </div>
                        </td>
                        <td className="numeric mono">
                          <div className="price-stack">
                            <strong>
                              {displayMoney(
                                item.quantity
                                  ? item.proceeds / item.quantity
                                  : 0,
                                2,
                              )}
                            </strong>
                            <small>总价 {displayMoney(item.proceeds, 2)}</small>
                          </div>
                        </td>
                        <td className="numeric mono">
                          {amountsMasked
                            ? MASKED_VALUE
                            : item.quantity.toLocaleString('en-US', {
                                maximumFractionDigits: 4,
                              })}
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
        <section className="panel manual-entry-panel">
          <div>
            <p>交易维护</p>
            <h2>手动维护单笔交易</h2>
            <span>支持新增、修改、删除，以及撤销上一次手动操作。</span>
          </div>
          <div className="manual-entry-actions">
            <Button
              variant="outline"
              disabled={!canUndoTransaction}
              onClick={undoLastTransactionChange}
            >
              <Undo2 />
              撤销上次操作
            </Button>
            <Button onClick={openManualTransactionDialog}>
              <Plus />
              添加交易
            </Button>
          </div>
        </section>
        <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
          <DialogContent className="manual-dialog sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTransaction ? '修改单笔交易' : '添加单笔交易'}
              </DialogTitle>
              <DialogDescription>
                保存后会写入本地累计 JSON，并立即参与持仓、现金与 FIFO 计算。
              </DialogDescription>
            </DialogHeader>
            <div className="manual-form-grid">
              <Label>
                <span>日期</span>
                <Input
                  type="date"
                  value={manualTransaction.date}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                <span>操作类型</span>
                <NativeSelect
                  className="w-full"
                  value={manualTransaction.action}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      action: event.target.value,
                      amount: '',
                    }))
                  }
                >
                  <NativeSelectOption value="Buy">买入</NativeSelectOption>
                  <NativeSelectOption value="Sell">卖出</NativeSelectOption>
                  <NativeSelectOption value="Cash Dividend">
                    分红
                  </NativeSelectOption>
                  <NativeSelectOption value="Interest">利息</NativeSelectOption>
                  <NativeSelectOption value="Wire Received">
                    汇款到账
                  </NativeSelectOption>
                  <NativeSelectOption value="MoneyLink Transfer">
                    MoneyLink 转账
                  </NativeSelectOption>
                  <NativeSelectOption value="Other">其他</NativeSelectOption>
                </NativeSelect>
              </Label>
              <Label>
                <span>标的代码</span>
                <Input
                  placeholder="例如 QLD"
                  value={manualTransaction.symbol}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      symbol: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </Label>
              <Label>
                <span>说明</span>
                <Input
                  placeholder="可选"
                  value={manualTransaction.description}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                <span>数量</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={manualTransaction.quantity}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                <span>成交价</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="USD"
                  value={manualTransaction.price}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                <span>手续费</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={manualTransaction.fees}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      fees: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                <span>交易金额</span>
                <Input
                  type="number"
                  step="any"
                  placeholder={
                    manualTransaction.action === 'Buy' ||
                    manualTransaction.action === 'Sell'
                      ? '留空则按数量和价格计算'
                      : '收入填正数，支出填负数'
                  }
                  value={manualTransaction.amount}
                  onChange={(event) =>
                    setManualTransaction((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
              </Label>
            </div>
            {manualError ? (
              <p className="manual-form-error">{manualError}</p>
            ) : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setManualDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={saveManualTransaction}>
                {editingTransaction ? '保存修改' : '保存交易'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            <>
              <div className="detail-list">
                {Object.entries(selected).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>
                      {amountsMasked &&
                      ['Quantity', 'Price', 'Fees & Comm', 'Amount'].includes(
                        key,
                      )
                        ? MASKED_VALUE
                        : value || '—'}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="detail-actions">
                <Button
                  variant="outline"
                  disabled={
                    !maintainedDataRef.current.BrokerageTransactions.includes(
                      selected,
                    )
                  }
                  onClick={openEditTransactionDialog}
                >
                  修改这条交易
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    !maintainedDataRef.current.BrokerageTransactions.includes(
                      selected,
                    )
                  }
                  onClick={() => setDeleteTransactionOpen(true)}
                >
                  <Trash2 />
                  删除这条交易
                </Button>
                {!maintainedDataRef.current.BrokerageTransactions.includes(
                  selected,
                ) ? (
                  <small>临时查看的数据不能删除</small>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={deleteTransactionOpen}
        onOpenChange={setDeleteTransactionOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条交易？</AlertDialogTitle>
            <AlertDialogDescription>
              {selected
                ? `${selected.Date} · ${ACTION_LABELS[selected.Action] ?? selected.Action} · ${selected.Symbol || selected.Description || '现金流水'}`
                : '删除后会重新计算全部账户数据。'}
              删除后会立即更新持仓、现金和 FIFO
              结果；如需恢复，可重新导入包含该记录的 JSON。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={deleteSelectedTransaction}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
