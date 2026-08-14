import { DiskCache } from "../trade/cache.js";

const TTL = 15 * 60 * 1000;

/**
 * poe.ninja 通货 → 混沌折算表。
 * GET /api/data/CurrencyOverview?league={league}&type=Currency
 * 失败时返回空表（调用方降级为原价展示）。
 */
export async function fetchChaosConversion(
  league: string,
  cache?: DiskCache,
): Promise<Map<string, number>> {
  const c = cache ?? new DiskCache();
  const key = `ninja:currency:${league}`;
  const cached = c.get<Map<string, number>>(key);
  if (cached) return cached;

  const url = `https://poe.ninja/api/data/CurrencyOverview?league=${encodeURIComponent(league)}&type=Currency`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "pob-price/0.3 (local POB price checker)", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`poe.ninja 拉取失败 HTTP ${res.status}`);
    const j = (await res.json()) as { lines?: { currencyTypeName: string; chaosEquivalent: number }[] };
    const map = new Map<string, number>();
    for (const line of j.lines ?? []) {
      if (typeof line.chaosEquivalent === "number") map.set(line.currencyTypeName, line.chaosEquivalent);
    }
    map.set("chaos", 1);
    c.set(key, map, TTL);
    return map;
  } catch (err) {
    // 失败负缓存：短时间内不重试（避免每批都白等超时）
    c.set(key, new Map(), 10 * 60 * 1000);
    throw err;
  }
}