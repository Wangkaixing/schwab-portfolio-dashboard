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

type AlpacaQuote = {
  ap?: number;
  bp?: number;
  t?: string;
};

type AlpacaQuotesResponse = {
  quotes?: Record<string, AlpacaQuote>;
};

type MarketSession = 'overnight' | 'premarket' | 'regular' | 'postmarket';

type NormalizedQuote = {
  current: number;
  change: number;
  changePercent: number;
  previousClose: number;
  timestamp: number;
  source: 'Twelve Data' | 'Finnhub' | 'Alpaca';
  isExtended: boolean;
  marketSession?: MarketSession;
  isDelayed?: boolean;
  isIndicative?: boolean;
};

const SYMBOL_PATTERN = /^[A-Z0-9.:-]{1,20}$/;

function quoteTimestamp(value: number | string | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const normalized = `${value.replace(' ', 'T')}${value.endsWith('Z') ? '' : 'Z'}`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function easternMarketSession(date = new Date()): MarketSession | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const weekday = value('weekday');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const isWeekday = weekdays.includes(weekday);
  const minutes = hour * 60 + minute;
  const isOvernight =
    (weekday === 'Sun' && minutes >= 20 * 60) ||
    (['Mon', 'Tue', 'Wed', 'Thu'].includes(weekday) && minutes >= 20 * 60) ||
    (isWeekday && minutes < 4 * 60);
  if (isOvernight) return 'overnight';
  if (!isWeekday) return null;
  if (minutes < 9 * 60 + 30) return 'premarket';
  if (minutes < 16 * 60) return 'regular';
  if (minutes < 20 * 60) return 'postmarket';
  return null;
}

function alpacaQuotePrice(quote: AlpacaQuote) {
  const ask = Number(quote.ap);
  const bid = Number(quote.bp);
  const hasAsk = Number.isFinite(ask) && ask > 0;
  const hasBid = Number.isFinite(bid) && bid > 0;
  if (hasAsk && hasBid) return (ask + bid) / 2;
  if (hasAsk) return ask;
  if (hasBid) return bid;
  return 0;
}

export function GET() {
  return Response.json({
    twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY),
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
    alpacaConfigured: Boolean(
      process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY,
    ),
    strategy: 'twelve-finnhub-with-alpaca-extended-hours',
  });
}

export async function POST(request: Request) {
  const twelveDataApiKey = process.env.TWELVE_DATA_API_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY;
  const alpacaApiKeyId = process.env.ALPACA_API_KEY_ID;
  const alpacaApiSecretKey = process.env.ALPACA_API_SECRET_KEY;
  if (
    !twelveDataApiKey &&
    !finnhubApiKey &&
    (!alpacaApiKeyId || !alpacaApiSecretKey)
  ) {
    return Response.json(
      { error: '尚未配置任何行情 API Key' },
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
        const hasExtendedPrice =
          Number.isFinite(extendedPrice) && extendedPrice > 0;
        const isExtended = quote.is_extended_hours === true;
        const current = isExtended && hasExtendedPrice ? extendedPrice : close;
        const previousClose = Number(quote.previous_close) || 0;
        if (!Number.isFinite(current) || current <= 0) {
          return [symbol, null] as const;
        }
        const reportedChange = Number(
          isExtended ? (quote.extended_change ?? quote.change) : quote.change,
        );
        const change = Number.isFinite(reportedChange)
          ? reportedChange
          : current - previousClose;
        const reportedPercent = Number(
          isExtended
            ? (quote.extended_percent_change ?? quote.percent_change)
            : quote.percent_change,
        );
        const changePercent = Number.isFinite(reportedPercent)
          ? reportedPercent
          : previousClose
            ? (change / previousClose) * 100
            : 0;
        const timestamp = quoteTimestamp(
          isExtended
            ? (quote.extended_timestamp ??
                quote.last_update_at ??
                quote.last_quote_at ??
                quote.timestamp)
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

  const quotes = Object.fromEntries(entries) as Record<string, NormalizedQuote>;
  const marketSession = easternMarketSession();
  const alpacaFeed =
    marketSession === 'overnight'
      ? 'overnight'
      : marketSession === 'premarket' || marketSession === 'postmarket'
        ? 'delayed_sip'
        : null;

  if (alpacaApiKeyId && alpacaApiSecretKey && alpacaFeed && marketSession) {
    try {
      const url = new URL(
        'https://data.alpaca.markets/v2/stocks/quotes/latest',
      );
      url.searchParams.set('symbols', symbols.join(','));
      url.searchParams.set('feed', alpacaFeed);
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': alpacaApiKeyId,
          'APCA-API-SECRET-KEY': alpacaApiSecretKey,
        },
        cache: 'no-store',
      });
      const payload = (await response.json()) as AlpacaQuotesResponse;
      if (response.ok && payload.quotes) {
        const oldestAcceptedTimestamp = Math.floor(Date.now() / 1000) - 90 * 60;
        for (const symbol of symbols) {
          const alpacaQuote = payload.quotes[symbol];
          if (!alpacaQuote) continue;
          const current = alpacaQuotePrice(alpacaQuote);
          const timestamp = quoteTimestamp(alpacaQuote.t);
          if (current <= 0 || timestamp < oldestAcceptedTimestamp) continue;
          const baseQuote = quotes[symbol];
          const previousClose =
            baseQuote?.previousClose || baseQuote?.current || 0;
          const change = previousClose ? current - previousClose : 0;
          quotes[symbol] = {
            current,
            change,
            changePercent: previousClose ? (change / previousClose) * 100 : 0,
            previousClose,
            timestamp,
            source: 'Alpaca',
            isExtended: true,
            marketSession,
            isDelayed: alpacaFeed === 'delayed_sip',
            isIndicative: alpacaFeed === 'overnight',
          };
        }
      }
    } catch {
      // Keep the regular-session quote when Alpaca is unavailable.
    }
  }

  return Response.json({
    quotes,
    fetchedAt: new Date().toISOString(),
  });
}
