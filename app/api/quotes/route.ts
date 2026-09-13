type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

const SYMBOL_PATTERN = /^[A-Z0-9.:-]{1,20}$/;

export async function POST(request: Request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: '尚未配置 Finnhub API Key' },
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

  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const url = new URL('https://finnhub.io/api/v1/quote');
        url.searchParams.set('symbol', symbol);
        const response = await fetch(url, {
          headers: { 'X-Finnhub-Token': apiKey },
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
          },
        ] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );

  return Response.json({
    quotes: Object.fromEntries(entries.filter(([, quote]) => quote !== null)),
    fetchedAt: new Date().toISOString(),
  });
}
