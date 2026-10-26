'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clipboard,
  Download,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import {
  calculateCompound,
  generateGrowthSeries,
  generateNumericRange,
  type CompoundResult,
} from '@/lib/compound-growth';

type DisplayMode = 'multiple' | 'asset' | 'return';
type ColorScheme = 'continuous' | 'segmented' | 'financial';
type Normalization = 'log' | 'linear';
type PresetName = 'panorama' | 'standard' | 'fine' | 'custom';

type InteractivePortfolio = {
  id: string;
  name: string;
  initialPrincipal: number;
  monthlyContribution: number;
  annualRate: number;
  years: number;
};

type CompoundSettings = {
  portfolios: InteractivePortfolio[];
  tableInitialPrincipal: number;
  tableMonthlyContribution: number;
  rateStart: number;
  rateEnd: number;
  rateStep: number;
  yearStart: number;
  yearEnd: number;
  yearStep: number;
  displayMode: DisplayMode;
  colorScheme: ColorScheme;
  normalization: Normalization;
  bins: number;
  decimals: number;
  currency: string;
  showSeparators: boolean;
  chartScale: 'linear' | 'log';
  chartGranularity: 'yearly' | 'monthly';
  showProfitLine: boolean;
};

type HeatCell = {
  year: number;
  rate: number;
  result: CompoundResult;
  value: number;
};

const STORAGE_KEY = 'schwab-dashboard:compound-settings:v2';
const MAX_RATE_COLUMNS = 61;
const MAX_YEAR_ROWS = 50;
const DEFAULT_SETTINGS: CompoundSettings = {
  portfolios: [
    {
      id: 'portfolio-a',
      name: '组合 A',
      initialPrincipal: 200_000,
      monthlyContribution: 5_000,
      annualRate: 10,
      years: 15,
    },
    {
      id: 'portfolio-b',
      name: '组合 B',
      initialPrincipal: 500_000,
      monthlyContribution: 5_000,
      annualRate: 15,
      years: 15,
    },
  ],
  tableInitialPrincipal: 100_000,
  tableMonthlyContribution: 0,
  rateStart: 8,
  rateEnd: 20,
  rateStep: 0.5,
  yearStart: 1,
  yearEnd: 30,
  yearStep: 1,
  displayMode: 'multiple',
  colorScheme: 'continuous',
  normalization: 'log',
  bins: 10,
  decimals: 1,
  currency: 'CNY',
  showSeparators: true,
  chartScale: 'linear',
  chartGranularity: 'yearly',
  showProfitLine: true,
};

const PRESETS: Record<
  Exclude<PresetName, 'custom'>,
  Pick<
    CompoundSettings,
    'rateStart' | 'rateEnd' | 'rateStep' | 'yearStart' | 'yearEnd' | 'yearStep'
  >
> = {
  panorama: {
    rateStart: 0,
    rateEnd: 30,
    rateStep: 5,
    yearStart: 1,
    yearEnd: 40,
    yearStep: 1,
  },
  standard: {
    rateStart: 4,
    rateEnd: 20,
    rateStep: 2,
    yearStart: 1,
    yearEnd: 40,
    yearStep: 1,
  },
  fine: {
    rateStart: 8,
    rateEnd: 20,
    rateStep: 0.5,
    yearStart: 1,
    yearEnd: 30,
    yearStep: 1,
  },
};

const VIRIDIS_STOPS = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
] as const;
const PORTFOLIO_COLORS = ['#15966b', '#2e78c7', '#c68a35', '#8c5ac7', '#d26483'];

function detectPreset(settings: CompoundSettings): PresetName {
  return (
    (['panorama', 'standard', 'fine'] as const).find((name) => {
      const preset = PRESETS[name];
      return (
        settings.rateStart === preset.rateStart &&
        settings.rateEnd === preset.rateEnd &&
        settings.rateStep === preset.rateStep &&
        settings.yearStart === preset.yearStart &&
        settings.yearEnd === preset.yearEnd &&
        settings.yearStep === preset.yearStep
      );
    }) ?? 'custom'
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function parseSavedSettings(value: string | null): CompoundSettings | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CompoundSettings>;
    const portfolios = Array.isArray(parsed.portfolios)
      ? parsed.portfolios.slice(0, 5).map((portfolio, index) => ({
          id: String(portfolio.id || `portfolio-${index + 1}`),
          name: String(portfolio.name || `组合 ${index + 1}`),
          initialPrincipal: Math.max(
            0,
            Number(portfolio.initialPrincipal) || 0,
          ),
          monthlyContribution: Math.max(
            0,
            Number(portfolio.monthlyContribution) || 0,
          ),
          annualRate: clamp(
            Math.round(Number(portfolio.annualRate ?? 14) * 2) / 2,
            -20,
            50,
          ),
          years: clamp(Math.round(Number(portfolio.years ?? 15)), 1, 50),
        }))
      : DEFAULT_SETTINGS.portfolios;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      portfolios: portfolios.length ? portfolios : DEFAULT_SETTINGS.portfolios,
      tableInitialPrincipal: Math.max(
        0,
        Number(
          parsed.tableInitialPrincipal ?? DEFAULT_SETTINGS.tableInitialPrincipal,
        ) || 0,
      ),
      tableMonthlyContribution: Math.max(
        0,
        Number(
          parsed.tableMonthlyContribution ??
            DEFAULT_SETTINGS.tableMonthlyContribution,
        ) || 0,
      ),
    };
  } catch {
    return null;
  }
}

function rgbBetween(a: readonly number[], b: readonly number[], t: number) {
  return a.map((value, index) =>
    Math.round(value + (b[index] - value) * t),
  );
}

function viridis(t: number) {
  const safe = clamp(t, 0, 1);
  const scaled = safe * (VIRIDIS_STOPS.length - 1);
  const index = Math.min(VIRIDIS_STOPS.length - 2, Math.floor(scaled));
  const rgb = rgbBetween(
    VIRIDIS_STOPS[index],
    VIRIDIS_STOPS[index + 1],
    scaled - index,
  );
  return rgb as [number, number, number];
}

function financialColor(value: number, min: number, max: number) {
  const neutral = [119, 126, 141] as const;
  const red = [190, 54, 70] as const;
  const green = [35, 151, 92] as const;
  if (min < 0 && max > 0) {
    return value < 0
      ? (rgbBetween(red, neutral, 1 - Math.abs(value / min)) as [
          number,
          number,
          number,
        ])
      : (rgbBetween(neutral, green, value / max) as [number, number, number]);
  }
  if (max <= 0) {
    const t = max === min ? 0 : (value - min) / (max - min);
    return rgbBetween(red, neutral, t) as [number, number, number];
  }
  const t = max === min ? 0 : (value - min) / (max - min);
  return rgbBetween(neutral, green, t) as [number, number, number];
}

function readableText([red, green, blue]: [number, number, number]) {
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.61 ? '#17201b' : '#ffffff';
}

function normalizeValue(
  value: number,
  min: number,
  max: number,
  normalization: Normalization,
) {
  if (max === min) return 0.5;
  if (normalization === 'log' && min > 0 && value > 0) {
    return (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
  }
  return (value - min) / (max - min);
}

function metricValue(mode: DisplayMode, result: CompoundResult) {
  if (mode === 'asset') return result.finalAsset;
  if (mode === 'return') return result.totalReturn;
  return result.multipleOnInitial;
}

function metricLabel(mode: DisplayMode) {
  if (mode === 'asset') return '最终资产';
  if (mode === 'return') return '累计收益率';
  return '资产 / 初始本金';
}

function InputField({
  label,
  value,
  min,
  max,
  step = 'any',
  scale = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  scale?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value / scale));
  const [isEditing, setIsEditing] = useState(false);

  return (
    <label className="compound-field">
      <span>{label}</span>
      <div>
        <Input
          type="number"
          value={isEditing ? draft : String(value / scale)}
          min={min}
          max={max}
          step={step}
          onFocus={() => {
            setDraft(String(value / scale));
            setIsEditing(true);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (next.trim() === '') return;
            const parsed = Number(next);
            if (Number.isFinite(parsed)) onChange(parsed * scale);
          }}
          onBlur={() => {
            setIsEditing(false);
          }}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="compound-slider-field">
      <div>
        <span>{label}</span>
        <strong>
          {value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          {suffix}
        </strong>
      </div>
      <input
        className="compound-native-slider"
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="compound-slider-scale">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}

export function CompoundSimulator({ active }: { active: boolean }) {
  const [settings, setSettings] =
    useState<CompoundSettings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<PresetName>('fine');
  const [hoveredCell, setHoveredCell] = useState<HeatCell | null>(null);
  const [selectedTableCell, setSelectedTableCell] = useState<HeatCell | null>(
    null,
  );
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const settingsReady = useRef(false);

  useEffect(() => {
    try {
      const saved = parseSavedSettings(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        setSettings(saved);
        setPreset(detectPreset(saved));
      }
    } finally {
      settingsReady.current = true;
    }
  }, []);

  useEffect(() => {
    if (!settingsReady.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // The simulator remains usable when local storage is unavailable.
    }
  }, [settings]);

  const update = <Key extends keyof CompoundSettings>(
    key: Key,
    value: CompoundSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    if (
      key === 'rateStart' ||
      key === 'rateEnd' ||
      key === 'rateStep' ||
      key === 'yearStart' ||
      key === 'yearEnd' ||
      key === 'yearStep'
    ) {
      setPreset('custom');
    }
  };

  const updatePortfolio = <Key extends keyof InteractivePortfolio>(
    id: string,
    key: Key,
    value: InteractivePortfolio[Key],
  ) => {
    setSettings((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === id ? { ...portfolio, [key]: value } : portfolio,
      ),
    }));
  };

  const addPortfolio = () => {
    setSettings((current) => {
      if (current.portfolios.length >= 5) return current;
      const index = current.portfolios.length;
      return {
        ...current,
        portfolios: [
          ...current.portfolios,
          {
            id: `portfolio-${Date.now()}`,
            name: `组合 ${String.fromCharCode(65 + index)}`,
            initialPrincipal: 100_000,
            monthlyContribution: 0,
            annualRate: 10,
            years: 15,
          },
        ],
      };
    });
  };

  const removePortfolio = (id: string) => {
    setSettings((current) =>
      current.portfolios.length === 1
        ? current
        : {
            ...current,
            portfolios: current.portfolios.filter(
              (portfolio) => portfolio.id !== id,
            ),
          },
    );
  };

  const setTableContribution = (value: number) => {
    const next = Math.max(0, value || 0);
    setSettings((current) => ({
      ...current,
      tableMonthlyContribution: next,
      displayMode:
        next > 0 && current.displayMode === 'multiple'
          ? 'asset'
          : current.displayMode,
    }));
  };

  const applyPreset = (name: Exclude<PresetName, 'custom'>) => {
    setPreset(name);
    setSettings((current) => ({ ...current, ...PRESETS[name] }));
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    setPreset('fine');
    setHoveredCell(null);
    setSelectedTableCell(null);
  };

  const rates = useMemo(
    () =>
      generateNumericRange(
        clamp(settings.rateStart, -99.99, 100),
        clamp(settings.rateEnd, -99.99, 100),
        clamp(settings.rateStep, 0.01, 100),
        MAX_RATE_COLUMNS,
      ),
    [settings.rateStart, settings.rateEnd, settings.rateStep],
  );
  const years = useMemo(
    () =>
      generateNumericRange(
        clamp(settings.yearStart, 1, 50),
        clamp(settings.yearEnd, 1, 50),
        clamp(settings.yearStep, 1, 50),
        MAX_YEAR_ROWS,
      ),
    [settings.yearStart, settings.yearEnd, settings.yearStep],
  );

  const heatRows = useMemo(
    () =>
      years.map((year) =>
        rates.map((rate) => {
          const result = calculateCompound({
            initialPrincipal: settings.tableInitialPrincipal,
            monthlyContribution: settings.tableMonthlyContribution,
            annualRate: rate / 100,
            years: year,
          });
          return {
            year,
            rate,
            result,
            value: metricValue(settings.displayMode, result),
          };
        }),
      ),
    [
      rates,
      years,
      settings.tableInitialPrincipal,
      settings.tableMonthlyContribution,
      settings.displayMode,
    ],
  );
  const heatValues = useMemo(
    () => heatRows.flat().map((cell) => cell.value),
    [heatRows],
  );
  const sortedValues = useMemo(
    () => [...heatValues].sort((a, b) => a - b),
    [heatValues],
  );
  const heatMin = sortedValues[0] ?? 0;
  const heatMax = sortedValues.at(-1) ?? 0;
  const heatMedian = sortedValues.length
    ? sortedValues[Math.floor(sortedValues.length / 2)]
    : 0;

  const portfolioResults = useMemo(
    () =>
      settings.portfolios.map((portfolio) => ({
        portfolio,
        result: calculateCompound({
          initialPrincipal: portfolio.initialPrincipal,
          monthlyContribution: portfolio.monthlyContribution,
          annualRate: portfolio.annualRate / 100,
          years: portfolio.years,
        }),
      })),
    [settings.portfolios],
  );
  const portfolioTotals = useMemo(() => {
    const totals = portfolioResults.reduce(
      (sum, { result }) => ({
        finalAsset: sum.finalAsset + result.finalAsset,
        investedPrincipal:
          sum.investedPrincipal + result.investedPrincipal,
        contributionTotal: sum.contributionTotal + result.contributionTotal,
        profit: sum.profit + result.profit,
      }),
      {
        finalAsset: 0,
        investedPrincipal: 0,
        contributionTotal: 0,
        profit: 0,
      },
    );
    return {
      ...totals,
      totalReturn:
        totals.investedPrincipal > 0
          ? totals.profit / totals.investedPrincipal
          : 0,
      multipleOnInvested:
        totals.investedPrincipal > 0
          ? totals.finalAsset / totals.investedPrincipal
          : 0,
    };
  }, [portfolioResults]);

  const fullMoneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: settings.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }),
    [settings.currency],
  );

  const compactMoney = (value: number) =>
    new Intl.NumberFormat('en-US', {
      notation: Math.abs(value) >= 100_000 ? 'compact' : 'standard',
      style: 'currency',
      currency: settings.currency,
      maximumFractionDigits: settings.decimals,
      useGrouping: settings.showSeparators,
    }).format(value);

  const formatMetric = (value: number, full = false) => {
    if (settings.displayMode === 'asset') {
      return full ? fullMoneyFormatter.format(value) : compactMoney(value);
    }
    if (settings.displayMode === 'return') {
      return `${(value * 100).toFixed(settings.decimals)}%`;
    }
    return `${value.toFixed(settings.decimals)}×`;
  };

  const heatColor = (value: number) => {
    const raw = normalizeValue(
      value,
      heatMin,
      heatMax,
      settings.normalization,
    );
    const normalized =
      settings.colorScheme === 'segmented'
        ? Math.round(raw * (settings.bins - 1)) / (settings.bins - 1)
        : raw;
    const rgb =
      settings.colorScheme === 'financial'
        ? financialColor(value, heatMin, heatMax)
        : viridis(normalized);
    return {
      backgroundColor: `rgb(${rgb.join(',')})`,
      color: readableText(rgb),
    };
  };

  const legendBackground =
    settings.colorScheme === 'financial'
      ? heatMin < 0 && heatMax > 0
        ? 'linear-gradient(90deg, rgb(190,54,70), rgb(119,126,141), rgb(35,151,92))'
        : heatMax <= 0
          ? 'linear-gradient(90deg, rgb(190,54,70), rgb(119,126,141))'
          : 'linear-gradient(90deg, rgb(119,126,141), rgb(35,151,92))'
      : `linear-gradient(90deg, ${VIRIDIS_STOPS.map((stop) => `rgb(${stop.join(',')})`).join(',')})`;

  const chartData = useMemo(() => {
    const series = settings.portfolios.map((portfolio) =>
      generateGrowthSeries(
        {
          initialPrincipal: portfolio.initialPrincipal,
          monthlyContribution: portfolio.monthlyContribution,
          annualRate: portfolio.annualRate / 100,
          years: portfolio.years,
        },
        settings.chartGranularity,
      ),
    );
    const maxLength = Math.max(0, ...series.map((items) => items.length));
    return Array.from({ length: maxLength }, (_, index) => {
      const point = series.find((items) => items[index])?.[index];
      const row: Record<string, string | number> = {
        label: point?.label ?? '',
        period: point?.period ?? index,
      };
      series.forEach((items, seriesIndex) => {
        const item = items[index];
        if (!item) return;
        row[`asset${seriesIndex}`] = item.asset;
        row[`invested${seriesIndex}`] = item.invested;
        row[`profit${seriesIndex}`] = item.profit;
      });
      return row;
    });
  }, [settings.portfolios, settings.chartGranularity]);
  const chartCanUseLog = chartData.every((row) =>
    Object.entries(row).every(([key, value]) =>
      typeof value !== 'number' ||
      key === 'period' ||
      (!key.startsWith('asset') &&
        !(settings.showProfitLine && key.startsWith('profit')))
        ? true
        : value > 0,
    ),
  );
  const effectiveChartScale =
    settings.chartScale === 'log' && chartCanUseLog ? 'log' : 'linear';

  const tableText = (separator: string) => {
    const header = ['年限 / 收益率', ...rates.map((rate) => `${rate}%`)];
    const rows = heatRows.map((row, rowIndex) => [
      `${years[rowIndex]}年`,
      ...row.map((cell) => formatMetric(cell.value, true)),
    ]);
    return [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(separator))
      .join('\n');
  };

  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(tableText('\t'));
      setCopyStatus('已复制');
      window.setTimeout(() => setCopyStatus(''), 1800);
    } catch {
      setCopyStatus('复制失败');
    }
  };

  const exportCsv = () => {
    const blob = new Blob([`\uFEFF${tableText(',')}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `compound-growth-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const selectCell = (cell: HeatCell) => {
    setSelectedTableCell(cell);
  };

  return (
    <section
      className={`content compound-page ${active ? '' : 'view-hidden'}`}
    >
      <div className="compound-heading">
        <div>
          <p>COMPOUND CALCULATOR</p>
          <h1>复利计算器</h1>
          <span>
            独立假设工具 · 有效年化收益率 · 月末定投 · 默认不含税费与通胀
          </span>
        </div>
        <Button variant="outline" onClick={reset}>
          <RotateCcw /> 复位默认设置
        </Button>
      </div>

      <section className="panel compound-control-panel">
        <div className="panel-head">
          <div>
            <p>交互复利</p>
            <h2>多组合复利对比</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addPortfolio}
            disabled={settings.portfolios.length >= 5}
          >
            <Plus /> 添加投资组合
          </Button>
        </div>
        <div className="compound-portfolio-grid">
          {settings.portfolios.map((portfolio, index) => (
            <article className="compound-portfolio-card" key={portfolio.id}>
              <div className="compound-portfolio-card-head">
                <span style={{ background: PORTFOLIO_COLORS[index] }} />
                <Input
                  aria-label={`投资组合 ${index + 1} 名称`}
                  value={portfolio.name}
                  maxLength={18}
                  onChange={(event) =>
                    updatePortfolio(portfolio.id, 'name', event.target.value)
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除 ${portfolio.name}`}
                  disabled={settings.portfolios.length === 1}
                  onClick={() => removePortfolio(portfolio.id)}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="compound-portfolio-fields">
                <InputField
                  label="初始本金"
                  value={portfolio.initialPrincipal}
                  min={0}
                  step={0.1}
                  scale={10_000}
                  suffix={`万 ${settings.currency}`}
                  onChange={(value) =>
                    updatePortfolio(
                      portfolio.id,
                      'initialPrincipal',
                      Math.max(0, value || 0),
                    )
                  }
                />
                <InputField
                  label="每月定投"
                  value={portfolio.monthlyContribution}
                  min={0}
                  step={0.1}
                  scale={10_000}
                  suffix={`万 ${settings.currency}`}
                  onChange={(value) =>
                    updatePortfolio(
                      portfolio.id,
                      'monthlyContribution',
                      Math.max(0, value || 0),
                    )
                  }
                />
                <SliderField
                  label="年化收益率"
                  value={portfolio.annualRate}
                  min={-20}
                  max={50}
                  step={0.5}
                  suffix="%"
                  onChange={(value) =>
                    updatePortfolio(portfolio.id, 'annualRate', value)
                  }
                />
                <SliderField
                  label="投资年限"
                  value={portfolio.years}
                  min={1}
                  max={50}
                  step={1}
                  suffix="年"
                  onChange={(value) =>
                    updatePortfolio(portfolio.id, 'years', value)
                  }
                />
              </div>
            </article>
          ))}
        </div>
        <p className="definition-note">最多同时比较 5 个投资组合；每个组合的本金、定投、收益率和年限均独立。</p>
      </section>

      <section className="panel compound-aggregate-panel">
        <div className="panel-head">
          <div>
            <p>组合汇总</p>
            <h2>{settings.portfolios.length} 个投资组合合计</h2>
          </div>
          <span className="panel-note">按每个组合各自设定的期末时间汇总</span>
        </div>
        <div className="compound-aggregate-grid">
          <article>
            <span>总期末资产</span>
            <strong>{compactMoney(portfolioTotals.finalAsset)}</strong>
            <small>所有组合期末资产之和</small>
          </article>
          <article>
            <span>总投入</span>
            <strong>{compactMoney(portfolioTotals.investedPrincipal)}</strong>
            <small>
              其中累计定投 {compactMoney(portfolioTotals.contributionTotal)}
            </small>
          </article>
          <article>
            <span>总收益</span>
            <strong className={portfolioTotals.profit >= 0 ? 'pos' : 'neg'}>
              {compactMoney(portfolioTotals.profit)}
            </strong>
            <small>总期末资产减总投入</small>
          </article>
          <article>
            <span>整体收益率</span>
            <strong
              className={portfolioTotals.totalReturn >= 0 ? 'pos' : 'neg'}
            >
              {(portfolioTotals.totalReturn * 100).toFixed(2)}%
            </strong>
            <small>
              期末资产 / 总投入 {portfolioTotals.multipleOnInvested.toFixed(2)}×
            </small>
          </article>
        </div>
      </section>

      <section className="compound-summary-grid">
        {portfolioResults.map(({ portfolio, result }, index) => (
          <article className="compound-summary-card emphasis" key={portfolio.id}>
            <span className="compound-summary-name">
              <i style={{ background: PORTFOLIO_COLORS[index] }} />
              {portfolio.name || `组合 ${index + 1}`}
            </span>
            <strong>{compactMoney(result.finalAsset)}</strong>
            <small>{portfolio.annualRate}% · {portfolio.years} 年 · 投入 {compactMoney(result.investedPrincipal)}</small>
            <small className={result.profit >= 0 ? 'pos' : 'neg'}>
              收益 {compactMoney(result.profit)} · {(result.totalReturn * 100).toFixed(2)}%
            </small>
          </article>
        ))}
      </section>

      <section className="panel compound-table-settings-panel">
        <div className="panel-head">
          <div>
            <p>静态复利表参数</p>
            <h2>独立本金、定投与表格范围</h2>
          </div>
          <span className="panel-note">这里的修改不会影响上方交互复利</span>
        </div>
        <div className="compound-table-money-fields">
          <InputField
            label="表格初始本金"
            value={settings.tableInitialPrincipal}
            min={0}
            step={0.1}
            scale={10_000}
            suffix={`万 ${settings.currency}`}
            onChange={(value) =>
              update('tableInitialPrincipal', Math.max(0, value || 0))
            }
          />
          <InputField
            label="表格每月定投"
            value={settings.tableMonthlyContribution}
            min={0}
            step={0.1}
            scale={10_000}
            suffix={`万 ${settings.currency}`}
            onChange={setTableContribution}
          />
        </div>
        <div className="compound-presets">
          <span>表格范围</span>
          <button
            className={preset === 'panorama' ? 'active' : ''}
            onClick={() => applyPreset('panorama')}
          >
            全景
          </button>
          <button
            className={preset === 'standard' ? 'active' : ''}
            onClick={() => applyPreset('standard')}
          >
            标准
          </button>
          <button
            className={preset === 'fine' ? 'active' : ''}
            onClick={() => applyPreset('fine')}
          >
            精细
          </button>
          <button className={preset === 'custom' ? 'active' : ''}>
            自定义
          </button>
        </div>
        <div className="compound-range-fields">
          <InputField label="收益率起点" value={settings.rateStart} min={-99.99} max={100} suffix="%" onChange={(value) => update('rateStart', value)} />
          <InputField label="收益率终点" value={settings.rateEnd} min={-99.99} max={100} suffix="%" onChange={(value) => update('rateEnd', value)} />
          <InputField label="收益率步长" value={settings.rateStep} min={0.01} max={100} step={0.25} suffix="%" onChange={(value) => update('rateStep', Math.max(0.01, value || 0.01))} />
          <InputField label="年限起点" value={settings.yearStart} min={1} max={50} step={1} suffix="年" onChange={(value) => update('yearStart', value)} />
          <InputField label="年限终点" value={settings.yearEnd} min={1} max={50} step={1} suffix="年" onChange={(value) => update('yearEnd', value)} />
          <InputField label="年限步长" value={settings.yearStep} min={1} max={50} step={1} suffix="年" onChange={(value) => update('yearStep', Math.max(1, value || 1))} />
        </div>
      </section>

      <section className="panel compound-heat-panel">
        <div className="panel-head compound-heat-head">
          <div>
            <p>二维复利热力表</p>
            <h2>{metricLabel(settings.displayMode)}</h2>
          </div>
          <div className="compound-export-actions">
            <Button variant="outline" size="sm" onClick={copyTable}>
              {copyStatus === '已复制' ? <Check /> : <Clipboard />}
              {copyStatus || '复制表格'}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download /> 导出 CSV
            </Button>
          </div>
        </div>
        <div className="compound-display-controls">
          <div className="compound-control-field">
            <span>显示指标</span>
            <NativeSelect value={settings.displayMode} onChange={(event) => update('displayMode', event.target.value as DisplayMode)}>
              <NativeSelectOption value="multiple">资产 / 初始本金</NativeSelectOption>
              <NativeSelectOption value="asset">最终资产</NativeSelectOption>
              <NativeSelectOption value="return">累计收益率</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="compound-control-field">
            <span>配色</span>
            <NativeSelect value={settings.colorScheme} onChange={(event) => update('colorScheme', event.target.value as ColorScheme)}>
              <NativeSelectOption value="continuous">连续 Viridis</NativeSelectOption>
              <NativeSelectOption value="segmented">分段色阶</NativeSelectOption>
              <NativeSelectOption value="financial">金融红绿</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="compound-control-field">
            <span>归一化</span>
            <NativeSelect value={settings.normalization} onChange={(event) => update('normalization', event.target.value as Normalization)}>
              <NativeSelectOption value="log">对数</NativeSelectOption>
              <NativeSelectOption value="linear">线性</NativeSelectOption>
            </NativeSelect>
          </div>
          {settings.colorScheme === 'segmented' ? (
            <InputField label="分档数量" value={settings.bins} min={8} max={12} step={1} onChange={(value) => update('bins', clamp(Math.round(value), 8, 12))} />
          ) : null}
          <div className="compound-control-field">
            <span>小数位</span>
            <NativeSelect value={String(settings.decimals)} onChange={(event) => update('decimals', Number(event.target.value))}>
              <NativeSelectOption value="0">0</NativeSelectOption>
              <NativeSelectOption value="1">1</NativeSelectOption>
              <NativeSelectOption value="2">2</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="compound-control-field">
            <span>货币</span>
            <NativeSelect value={settings.currency} onChange={(event) => update('currency', event.target.value)}>
              <NativeSelectOption value="USD">USD</NativeSelectOption>
              <NativeSelectOption value="CNY">CNY</NativeSelectOption>
              <NativeSelectOption value="HKD">HKD</NativeSelectOption>
              <NativeSelectOption value="EUR">EUR</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="compound-switch-label">
            <Switch checked={settings.showSeparators} onCheckedChange={(checked) => update('showSeparators', checked)} />
            <span>千位分隔</span>
          </div>
        </div>

        <div className="compound-legend">
          <div style={{ background: legendBackground }} />
          <span>{formatMetric(heatMin)}</span>
          <span>{formatMetric(heatMedian)}</span>
          <span>{formatMetric(heatMax)}</span>
          <small>最小值</small><small>中位参考</small><small>最大值</small>
        </div>

        <div className="compound-hover-summary" aria-live="polite">
          {hoveredCell ? (
            <>
              <strong>{hoveredCell.year} 年 · {hoveredCell.rate}%</strong>
              <span>最终资产 {fullMoneyFormatter.format(hoveredCell.result.finalAsset)}</span>
              <span>累计投入 {fullMoneyFormatter.format(hoveredCell.result.investedPrincipal)}</span>
              <span>累计定投 {fullMoneyFormatter.format(hoveredCell.result.contributionTotal)}</span>
              <span>投资收益 {fullMoneyFormatter.format(hoveredCell.result.profit)}</span>
              <span>总收益率 {(hoveredCell.result.totalReturn * 100).toFixed(2)}%</span>
              <span>资产 / 投入 {hoveredCell.result.multipleOnInvested.toFixed(3)}×</span>
            </>
          ) : (
            <span>悬停单元格查看完整情景，点击可固定选中，不影响交互复利</span>
          )}
        </div>

        <div className="compound-table-wrap">
          <table className="compound-heat-table">
            <thead>
              <tr>
                <th>年限 \ 收益率</th>
                {rates.map((rate, columnIndex) => (
                  <th className={hoveredColumn === columnIndex ? 'is-hovered' : ''} key={rate}>{rate}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatRows.map((row, rowIndex) => (
                <tr key={years[rowIndex]}>
                  <th className={hoveredRow === rowIndex ? 'is-hovered' : ''}>{years[rowIndex]} 年</th>
                  {row.map((cell, columnIndex) => {
                    const selected =
                      cell.rate === selectedTableCell?.rate &&
                      cell.year === selectedTableCell?.year;
                    return (
                      <td key={`${cell.year}-${cell.rate}`}>
                        <button
                          className={selected ? 'selected' : ''}
                          style={heatColor(cell.value)}
                          title={`${cell.year} 年，${cell.rate}%：${formatMetric(cell.value, true)}`}
                          onMouseEnter={() => {
                            setHoveredCell(cell);
                            setHoveredRow(rowIndex);
                            setHoveredColumn(columnIndex);
                          }}
                          onMouseLeave={() => {
                            setHoveredCell(null);
                            setHoveredRow(null);
                            setHoveredColumn(null);
                          }}
                          onFocus={() => {
                            setHoveredCell(cell);
                            setHoveredRow(rowIndex);
                            setHoveredColumn(columnIndex);
                          }}
                          onBlur={() => {
                            setHoveredCell(null);
                            setHoveredRow(null);
                            setHoveredColumn(null);
                          }}
                          onClick={() => selectCell(cell)}
                        >
                          {formatMetric(cell.value)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="definition-note">
          表格最多生成 {MAX_RATE_COLUMNS} 列 × {MAX_YEAR_ROWS} 行；超出范围时自动截断。资产倍数以初始本金为分母，含定投时更建议查看最终资产或累计收益率。
        </p>
      </section>

      <section className="panel compound-chart-panel">
        <div className="panel-head">
          <div>
            <p>增长路径</p>
            <h2>{settings.portfolios.length} 个投资组合增长曲线</h2>
          </div>
          <span className="panel-note">最长 {Math.max(...settings.portfolios.map((portfolio) => portfolio.years))} 年</span>
        </div>
        <div className="compound-chart-controls">
          <div className="compound-control-field">
            <span>数据粒度</span>
            <NativeSelect value={settings.chartGranularity} onChange={(event) => update('chartGranularity', event.target.value as 'yearly' | 'monthly')}>
              <NativeSelectOption value="yearly">年度</NativeSelectOption>
              <NativeSelectOption value="monthly">月度</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="compound-control-field">
            <span>Y 轴</span>
            <NativeSelect value={settings.chartScale} onChange={(event) => update('chartScale', event.target.value as 'linear' | 'log')}>
              <NativeSelectOption value="linear">线性</NativeSelectOption>
              <NativeSelectOption value="log">对数</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="compound-switch-label">
            <Switch checked={settings.showProfitLine} onCheckedChange={(checked) => update('showProfitLine', checked)} />
            <span>累计收益线</span>
          </div>
        </div>
        {settings.chartScale === 'log' && !chartCanUseLog ? (
          <p className="compound-chart-warning">当前数据含零值或负值，图表已自动使用线性 Y 轴。</p>
        ) : null}
        <div className="compound-chart-legend">
          {settings.portfolios.map((portfolio, index) => (
            <span key={portfolio.id}><i style={{ background: PORTFOLIO_COLORS[index] }} />{portfolio.name || `组合 ${index + 1}`}资产</span>
          ))}
          {settings.showProfitLine ? <span className="compound-dashed-key">虚线为累计收益</span> : null}
        </div>
        <div className="compound-chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 4, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" minTickGap={28} tick={{ fontSize: 10 }} />
              <YAxis scale={effectiveChartScale} domain={['auto', 'auto']} width={72} tickFormatter={(value) => compactMoney(Number(value))} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value, name) => [fullMoneyFormatter.format(Number(value)), String(name)]} labelFormatter={(label) => `时间：${label}`} />
              {settings.portfolios.map((portfolio, index) => (
                <Line key={portfolio.id} type="monotone" connectNulls={false} dataKey={`asset${index}`} name={`${portfolio.name || `组合 ${index + 1}`}资产`} stroke={PORTFOLIO_COLORS[index]} strokeWidth={2.4} dot={false} />
              ))}
              {settings.showProfitLine
                ? settings.portfolios.map((portfolio, index) => (
                    <Line key={`${portfolio.id}-profit`} type="monotone" connectNulls={false} dataKey={`profit${index}`} name={`${portfolio.name || `组合 ${index + 1}`}收益`} stroke={PORTFOLIO_COLORS[index]} strokeWidth={1.5} strokeOpacity={0.75} dot={false} strokeDasharray="5 4" />
                  ))
                : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="definition-note">
          输入为有效年化收益率，月度定投按等效月收益率并在月末投入。本工具仅作情景模拟，不构成收益预测或投资建议。
        </p>
      </section>
    </section>
  );
}
