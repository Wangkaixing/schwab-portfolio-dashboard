type TwelveDataQuote = {
  status?: string;
  message?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  timestamp?: number | string;
  last_quote_at?: number | string;
  last_update_at?: number | string;
  extended_price?: string;
  extended_change?: string;
  extended_percent_change?: string;
  extended_timestamp?: number | string;
  is_extended_hours?: boolean;
};

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  pc?: number;
  t?: number;
};

const SYMBOL_PATTERN = /^[A-Z0-9.:-]{1,20}$/;

function quoteTimestamp(value: number | string | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const normalized = `${value.replace(' ', 'T')}${value.endsWith('Z') ? '' : 'Z'}`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

export function GET() {
  return Response.json({
    twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY),
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
    strategy: 'twelve-data-first',
  });
}

export async function POST(request: Request) {
  const twelveDataApiKey = process.env.TWELVE_DATA_API_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY;
  if (!twelveDataApiKey && !finnhubApiKey) {
    return Response.json(
      { error: '尚未配置 Twelve Data 或 Finnhub API Key' },
      { status: 503 },
    );
  }

  let body: { symbols?: unknown };
  try {
    body = (await request.json()) as { symbols?: unknown };
  } catch {
    return Response.json({ error: '请求格式无效' }, { status: 400 });
  }

  if (!Array.isArray(body.symbols)) {
    return Response.json({ error: '缺少持仓代码' }, { status: 400 });
  }

  const symbols = [
    ...new Set(
      body.symbols
        .filter((symbol): symbol is string => typeof symbol === 'string')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => SYMBOL_PATTERN.test(symbol)),
    ),
  ].slice(0, 50);

  if (!symbols.length) {
    return Response.json({ quotes: {}, fetchedAt: new Date().toISOString() });
  }

  const twelveEntries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        if (!twelveDataApiKey) return [symbol, null] as const;
        const url = new URL('https://api.twelvedata.com/quote');
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('timezone', 'UTC');
        url.searchParams.set('prepost', 'true');
        url.searchParams.set('format', 'JSON');
        url.searchParams.set('apikey', twelveDataApiKey!);
        const response = await fetch(url, { cache: 'no-store' });
        const quote = (await response.json()) as TwelveDataQuote;
        if (!response.ok || quote.status === 'error') {
          return [symbol, null] as const;
        }
        const close = Number(quote.close);
        const extendedPrice = Number(quote.extended_price);
        const isExtended =
          quote.is_extended_hours === true &&
          Number.isFinite(extendedPrice) &&
          extendedPrice > 0;
        const current = isExtended ? extendedPrice : close;
        const previousClose = Number(quote.previous_close) || 0;
        if (!Number.isFinite(current) || current <= 0) {
          return [symbol, null] as const;
        }
        const reportedChange = Number(
          isExtended ? quote.extended_change : quote.change,
        );
        const change = Number.isFinite(reportedChange)
          ? reportedChange
          : current - previousClose;
        const reportedPercent = Number(
          isExtended ? quote.extended_percent_change : quote.percent_change,
        );
        const changePercent = Number.isFinite(reportedPercent)
          ? reportedPercent
          : previousClose
            ? (change / previousClose) * 100
            : 0;
        const timestamp = quoteTimestamp(
          isExtended
            ? quote.extended_timestamp
            : (quote.last_update_at ?? quote.last_quote_at ?? quote.timestamp),
        );
        return [
          symbol,
          {
            current,
            change,
            changePercent,
            previousClose,
            timestamp,
            source: 'Twelve Data',
            isExtended,
          },
        ] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );

  const missingSymbols = twelveEntries
    .filter(([, quote]) => quote === null)
    .map(([symbol]) => symbol);
  const finnhubEntries = finnhubApiKey
    ? await Promise.all(
        missingSymbols.map(async (symbol) => {
          try {
            const url = new URL('https://finnhub.io/api/v1/quote');
            url.searchParams.set('symbol', symbol);
            const response = await fetch(url, {
              headers: { 'X-Finnhub-Token': finnhubApiKey },
              cache: 'no-store',
            });
            if (!response.ok) return [symbol, null] as const;
            const quote = (await response.json()) as FinnhubQuote;
            if (!quote.c || quote.c <= 0) return [symbol, null] as const;
            return [
              symbol,
              {
                current: quote.c,
                change: quote.d ?? 0,
                changePercent: quote.dp ?? 0,
                previousClose: quote.pc ?? 0,
                timestamp: quote.t ?? 0,
                source: 'Finnhub',
                isExtended: false,
              },
            ] as const;
          } catch {
            return [symbol, null] as const;
          }
        }),
      )
    : [];
  const entries = [
    ...twelveEntries.filter(([, quote]) => quote !== null),
    ...finnhubEntries.filter(([, quote]) => quote !== null),
  ];

  return Response.json({
    quotes: Object.fromEntries(entries),
    fetchedAt: new Date().toISOString(),
  });
}
