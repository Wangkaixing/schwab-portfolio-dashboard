type TwelveDataResponse = {
  status?: string;
  code?: number;
  message?: string;
  values?: Array<{ datetime?: string; close?: string }>;
};

type AlpacaBarsResponse = {
  bars?: Record<string, Array<{ t?: string; c?: number }>>;
};

type CandleSeries = {
  closes: number[];
  timestamps: number[];
};

const PAIR_SYMBOLS = ['CGDV', 'VTV', 'SCHD', 'KO', 'QQQ'] as const;

function candleSeries(
  points: Array<{ close: number; timestamp: number }>,
): CandleSeries | null {
  const validPoints = points
    .filter(
      (point) =>
        Number.isFinite(point.close) &&
        point.close > 0 &&
        Number.isFinite(point.timestamp),
    )
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-200);
  if (!validPoints.length) return null;
  return {
    closes: validPoints.map((point) => point.close),
    timestamps: validPoints.map((point) => point.timestamp),
  };
}

async function fetchTwelveSeries(symbol: string, apiKey: string) {
  try {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1day');
    url.searchParams.set('outputsize', '200');
    url.searchParams.set('format', 'JSON');
    url.searchParams.set('apikey', apiKey);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as TwelveDataResponse;
    if (payload.status === 'error' || !Array.isArray(payload.values)) {
      return null;
    }
    return candleSeries(
      payload.values.map((point) => ({
        close: Number(point.close),
        timestamp: point.datetime
          ? Date.parse(`${point.datetime}T00:00:00Z`) / 1000
          : Number.NaN,
      })),
    );
  } catch {
    return null;
  }
}

export async function GET() {
  const alpacaApiKeyId = process.env.ALPACA_API_KEY_ID;
  const alpacaApiSecretKey = process.env.ALPACA_API_SECRET_KEY;
  const twelveDataApiKey = process.env.TWELVE_DATA_API_KEY;
  if ((!alpacaApiKeyId || !alpacaApiSecretKey) && !twelveDataApiKey) {
    return Response.json(
      { error: '尚未配置 Alpaca 或 Twelve Data API Key' },
      { status: 503 },
    );
  }

  const series: Record<string, CandleSeries> = {};
  if (alpacaApiKeyId && alpacaApiSecretKey) {
    try {
      const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
      const start = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000);
      url.searchParams.set('symbols', PAIR_SYMBOLS.join(','));
      url.searchParams.set('timeframe', '1Day');
      url.searchParams.set('start', start.toISOString());
      url.searchParams.set('limit', '10000');
      url.searchParams.set('adjustment', 'all');
      url.searchParams.set('feed', 'sip');
      url.searchParams.set('sort', 'asc');
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': alpacaApiKeyId,
          'APCA-API-SECRET-KEY': alpacaApiSecretKey,
        },
        cache: 'no-store',
      });
      const payload = (await response.json()) as AlpacaBarsResponse;
      if (response.ok && payload.bars) {
        for (const symbol of PAIR_SYMBOLS) {
          const bars = payload.bars[symbol];
          if (!Array.isArray(bars)) continue;
          const normalized = candleSeries(
            bars.map((bar) => ({
              close: Number(bar.c),
              timestamp: bar.t ? Date.parse(bar.t) / 1000 : Number.NaN,
            })),
          );
          if (normalized) series[symbol] = normalized;
        }
      }
    } catch {
      // Twelve Data fills any series missing from the Alpaca batch.
    }
  }

  if (twelveDataApiKey) {
    const missingSymbols = PAIR_SYMBOLS.filter((symbol) => !series[symbol]);
    const fallbackEntries = await Promise.all(
      missingSymbols.map(
        async (symbol) =>
          [symbol, await fetchTwelveSeries(symbol, twelveDataApiKey)] as const,
      ),
    );
    for (const [symbol, value] of fallbackEntries) {
      if (value) series[symbol] = value;
    }
  }

  if (!series.QQQ) {
    return Response.json(
      { error: '无法获取 QQQ 历史行情，请检查 Alpaca/Twelve Data Key 或额度' },
      { status: 502 },
    );
  }
  return Response.json({ series, fetchedAt: new Date().toISOString() });
}
