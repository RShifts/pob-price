import { DiskCache } from "../trade/cache.js";

const TTL = 15 * 60 * 1000;

/**
 * 挂牌货币简写 → poe.ninja 通货全名。
 * 市集挂牌 currency 用简写（divine/chaos/exalted），poe.ninja 用全名（Divine Orb/Chaos Orb）。
 */
const CURRENCY_FULL_NAMES: Record<string, string> = {
  chaos: "Chaos Orb",
  divine: "Divine Orb",
  exalted: "Exalted Orb",
  exalt: "Exalted Orb",
  annul: "Orb of Annulment",
  alch: "Orb of Alchemy",
  alc: "Orb of Alchemy",
  alt: "Orb of Alteration",
  alts: "Orb of Alteration",
  fusing: "Orb of Fusing",
  fuse: "Orb of Fusing",
  jew: "Jeweller's Orb",
  chrome: "Chromatic Orb",
  vaal: "Vaal Orb",
  regal: "Regal Orb",
  scouring: "Orb of Scouring",
  scour: "Orb of Scouring",
  mirror: "Mirror of Kalandra",
  blessing: "Blessing of Chayula",
  chayula: "Blessing of Chayula",
  ancient: "Ancient Orb",
  awakened: "Awakened Sextant",
  gcp: "Gemcutter's Prism",
  gemcutter: "Gemcutter's Prism",
  scroll: "Scroll of Wisdom",
  wisdom: "Scroll of Wisdom",
  portal: "Portal Scroll",
  silver: "Silver Coin",
  cartographer: "Cartographer's Chisel",
  chisel: "Cartographer's Chisel",
};

/** 常见通货 → 混沌的兜底汇率（poe.ninja 不可达时使用；大致当前赛季水平）。 */
const FALLBACK_RATES: Record<string, number> = {
  chaos: 1,
  divine: 200,
  exalted: 30,
  exalt: 30,
  annul: 12,
  alch: 0.3,
  alt: 0.03,
  fusing: 0.4,
  jew: 0.2,
  chrome: 0.15,
  vaal: 0.5,
  regal: 1.5,
  scouring: 1.2,
  mirror: 400000,
  ancient: 4,
  gcp: 1,
  scroll: 0.01,
};

/**
 * poe.ninja 通货 → 混沌折算表。
 * GET /api/data/CurrencyOverview?league={league}&type=Currency
 * 失败时用内置兜底汇率（fallback），保证非混沌价格也能折算。
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
    // poe.ninja 不可达：用内置兜底汇率（仍按简写键存储，避免每批重试超时）
    const fallback = new Map<string, number>();
    for (const [short, full] of Object.entries(CURRENCY_FULL_NAMES)) {
      const rate = FALLBACK_RATES[short];
      if (rate != null) fallback.set(short, rate);
    }
    fallback.set("chaos", 1);
    c.set(key, fallback, 10 * 60 * 1000);
    return fallback;
  }
}

/** 把折算表补上简写键（poe.ninja 成功时全名键 + 简写键都可用）。 */
export function normalizeConversion(map: Map<string, number>): Map<string, number> {
  const out = new Map(map);
  for (const [short, full] of Object.entries(CURRENCY_FULL_NAMES)) {
    const v = out.get(full);
    if (v != null && out.get(short) == null) out.set(short, v);
  }
  return out;
}