type TwelveDataResponse = {
  status?: string;
  code?: number;
  message?: string;
  values?: Array<{ datetime?: string; close?: string }>;
};

const PAIR_SYMBOLS = ['CGDV', 'VTV', 'SCHD', 'KO', 'QQQ'] as const;

export async function GET() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: '尚未配置 Twelve Data API Key' },
      { status: 503 },
    );
  }

  const entries = await Promise.all(
    PAIR_SYMBOLS.map(async (symbol) => {
      try {
        const url = new URL('https://api.twelvedata.com/time_series');
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('interval', '1day');
        url.searchParams.set('outputsize', '200');
        url.searchParams.set('format', 'JSON');
        url.searchParams.set('apikey', apiKey);
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return [symbol, null] as const;
        const payload = (await response.json()) as TwelveDataResponse;
        if (payload.status === 'error' || !Array.isArray(payload.values)) {
          return [symbol, null] as const;
        }
        const points = payload.values
          .map((point) => ({
            close: Number(point.close),
            timestamp: point.datetime
              ? Date.parse(`${point.datetime}T00:00:00Z`) / 1000
              : Number.NaN,
          }))
          .filter(
            (point) =>
              Number.isFinite(point.close) &&
              point.close > 0 &&
              Number.isFinite(point.timestamp),
          )
          .sort((a, b) => a.timestamp - b.timestamp);
        if (!points.length) return [symbol, null] as const;
        return [
          symbol,
          {
            closes: points.map((point) => point.close),
            timestamps: points.map((point) => point.timestamp),
          },
        ] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );

  const series = Object.fromEntries(entries.filter(([, value]) => value));
  if (!series.QQQ) {
    return Response.json(
      { error: '无法获取 QQQ 历史行情，请检查 Twelve Data Key 或额度' },
      { status: 502 },
    );
  }
  return Response.json({ series, fetchedAt: new Date().toISOString() });
}
