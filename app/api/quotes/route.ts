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

type AlpacaTrade = {
  p?: number;
  t?: string;
};

type AlpacaBar = {
  c?: number;
  t?: string;
};

type AlpacaSnapshot = {
  latestQuote?: AlpacaQuote;
  latestTrade?: AlpacaTrade;
  minuteBar?: AlpacaBar;
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
};

type AlpacaSnapshotsResponse = Record<string, AlpacaSnapshot | null>;

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

function alpacaSnapshotPrice(snapshot: AlpacaSnapshot) {
  const quotePrice = snapshot.latestQuote
    ? alpacaQuotePrice(snapshot.latestQuote)
    : 0;
  if (quotePrice > 0) return quotePrice;
  for (const value of [
    snapshot.latestTrade?.p,
    snapshot.minuteBar?.c,
    snapshot.dailyBar?.c,
  ]) {
    const price = Number(value);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return 0;
}

function alpacaSnapshotTimestamp(snapshot: AlpacaSnapshot) {
  return quoteTimestamp(
    snapshot.latestQuote?.t ??
      snapshot.latestTrade?.t ??
      snapshot.minuteBar?.t ??
      snapshot.dailyBar?.t,
  );
}

export function GET() {
  return Response.json({
    twelveDataConfigured: Boolean(process.env.TWELVE_DATA_API_KEY),
    finnhubConfigured: Boolean(process.env.FINNHUB_API_KEY),
    alpacaConfigured: Boolean(
      process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY,
    ),
    strategy: 'alpaca-first-with-twelve-and-finnhub-fallbacks',
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

  let body: { symbols?: unknown; includeExtendedHours?: unknown };
  try {
    body = (await request.json()) as {
      symbols?: unknown;
      includeExtendedHours?: unknown;
    };
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

  const includeExtendedHours = body.includeExtendedHours !== false;
  const quotes: Record<string, NormalizedQuote> = {};
  const referenceCloses: Record<string, number> = {};
  const marketSession = easternMarketSession();
  const alpacaHeaders =
    alpacaApiKeyId && alpacaApiSecretKey
      ? {
          'APCA-API-KEY-ID': alpacaApiKeyId,
          'APCA-API-SECRET-KEY': alpacaApiSecretKey,
        }
      : null;

  if (alpacaHeaders && (includeExtendedHours || marketSession === 'regular')) {
    try {
      const url = new URL('https://data.alpaca.markets/v2/stocks/snapshots');
      url.searchParams.set('symbols', symbols.join(','));
      url.searchParams.set('feed', 'delayed_sip');
      const response = await fetch(url, {
        headers: alpacaHeaders,
        cache: 'no-store',
      });
      const snapshots = (await response.json()) as AlpacaSnapshotsResponse;
      if (response.ok) {
        const oldestAcceptedTimestamp = Math.floor(Date.now() / 1000) - 90 * 60;
        for (const symbol of symbols) {
          const snapshot = snapshots[symbol];
          if (!snapshot) continue;
          const dailyClose = Number(snapshot.dailyBar?.c);
          const previousDailyClose = Number(snapshot.prevDailyBar?.c);
          const referenceClose =
            marketSession === 'overnight' || marketSession === null
              ? dailyClose
              : previousDailyClose;
          if (Number.isFinite(referenceClose) && referenceClose > 0) {
            referenceCloses[symbol] = referenceClose;
          }

          if (!includeExtendedHours && marketSession !== 'regular') continue;

          const current = alpacaSnapshotPrice(snapshot);
          const timestamp = alpacaSnapshotTimestamp(snapshot);
          const isFresh =
            marketSession === null || timestamp >= oldestAcceptedTimestamp;
          if (current <= 0 || !timestamp || !isFresh) continue;
          const previousClose = referenceCloses[symbol] || 0;
          const change = previousClose ? current - previousClose : 0;
          quotes[symbol] = {
            current,
            change,
            changePercent: previousClose ? (change / previousClose) * 100 : 0,
            previousClose,
            timestamp,
            source: 'Alpaca',
            isExtended:
              marketSession === 'overnight' ||
              marketSession === 'premarket' ||
              marketSession === 'postmarket',
            marketSession: marketSession ?? undefined,
            isDelayed: marketSession !== null,
            isIndicative: false,
          };
        }
      }
    } catch {
      // Twelve Data will fill symbols when the batch snapshot is unavailable.
    }
  }

  const liveAlpacaFeed =
    marketSession === 'regular'
      ? 'iex'
      : includeExtendedHours && marketSession === 'overnight'
        ? 'overnight'
        : null;
  if (alpacaHeaders && liveAlpacaFeed && marketSession) {
    try {
      const url = new URL(
        'https://data.alpaca.markets/v2/stocks/quotes/latest',
      );
      url.searchParams.set('symbols', symbols.join(','));
      url.searchParams.set('feed', liveAlpacaFeed);
      const response = await fetch(url, {
        headers: alpacaHeaders,
        cache: 'no-store',
      });
      const payload = (await response.json()) as AlpacaQuotesResponse;
      if (response.ok && payload.quotes) {
        const maximumAgeMinutes = liveAlpacaFeed === 'iex' ? 30 : 90;
        const oldestAcceptedTimestamp =
          Math.floor(Date.now() / 1000) - maximumAgeMinutes * 60;
        for (const symbol of symbols) {
          const alpacaQuote = payload.quotes[symbol];
          if (!alpacaQuote) continue;
          const current = alpacaQuotePrice(alpacaQuote);
          const timestamp = quoteTimestamp(alpacaQuote.t);
          if (current <= 0 || timestamp < oldestAcceptedTimestamp) continue;
          const previousClose =
            referenceCloses[symbol] || quotes[symbol]?.previousClose || 0;
          const change = previousClose ? current - previousClose : 0;
          quotes[symbol] = {
            current,
            change,
            changePercent: previousClose ? (change / previousClose) * 100 : 0,
            previousClose,
            timestamp,
            source: 'Alpaca',
            isExtended: marketSession === 'overnight',
            marketSession,
            isDelayed: false,
            isIndicative: marketSession === 'overnight',
          };
        }
      }
    } catch {
      // Keep delayed SIP snapshots when the live subset is unavailable.
    }
  }

  const missingAfterAlpaca = symbols.filter((symbol) => !quotes[symbol]);
  const twelveEntries = await Promise.all(
    missingAfterAlpaca.map(async (symbol) => {
      try {
        if (!twelveDataApiKey) return [symbol, null] as const;
        const url = new URL('https://api.twelvedata.com/quote');
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('timezone', 'UTC');
        url.searchParams.set('prepost', String(includeExtendedHours));
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
        const isExtended =
          includeExtendedHours && quote.is_extended_hours === true;
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

  for (const [symbol, quote] of twelveEntries) {
    if (quote) quotes[symbol] = quote;
  }

  const missingSymbols = symbols.filter((symbol) => !quotes[symbol]);
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
  for (const [symbol, quote] of finnhubEntries) {
    if (quote) quotes[symbol] = quote;
  }

  return Response.json({
    quotes,
    fetchedAt: new Date().toISOString(),
  });
}
