import type { Listing, ListingPrice } from "./types.js";

export interface PriceSample {
  amount: number;
  currency: string;
  /** 折算后的混沌价值（无法折算为 null） */
  chaosValue: number | null;
  account: string;
  onlineStatus?: string;
  indexed: string;
  whisper: string;
}

export interface PriceSummary {
  /** 折算后的统计（仅含可折算样本） */
  minChaos: number | null;
  medianChaos: number | null;
  avgChaos: number | null;
  count: number;
  sampleCount: number;
  samples: PriceSample[];
}

/** 把挂牌列表 → 价格样本（用通货→混沌折算表换算）。 */
export function toPriceSamples(
  listings: Listing[],
  conversion: ReadonlyMap<string, number>,
): PriceSample[] {
  const samples: PriceSample[] = [];
  for (const l of listings) {
    const p: ListingPrice | undefined = l.listing?.price;
    if (!p || typeof p.amount !== "number") continue; // 未标价的挂牌跳过
    const rate = conversion.get(p.currency);
    // 混沌为基准通货：即使折算表不可用（如 poe.ninja 不可达）也按 1:1 计入
    const chaosValue = p.currency === "chaos" ? p.amount : rate != null && rate > 0 ? p.amount * rate : null;
    samples.push({
      amount: p.amount,
      currency: p.currency,
      chaosValue,
      account: l.listing?.account?.name ?? "?",
      onlineStatus: (l.listing?.account?.online as { status?: string } | null | undefined)?.status,
      indexed: l.listing?.indexed ?? "",
      whisper: l.listing?.whisper ?? "",
    });
  }
  return samples;
}

/** 价格统计：最低 / 中位 / 均价（仅统计可折算到混沌的样本）。 */
export function aggregatePrices(samples: PriceSample[]): PriceSummary {
  const chaos = samples
    .map((s) => s.chaosValue)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const n = chaos.length;
  const sum = chaos.reduce((a, b) => a + b, 0);
  const min = n > 0 ? chaos[0] : null;
  const median = n > 0 ? (n % 2 === 1 ? chaos[(n - 1) / 2] : (chaos[n / 2 - 1] + chaos[n / 2]) / 2) : null;
  const avg = n > 0 ? sum / n : null;
  return { minChaos: min, medianChaos: median, avgChaos: avg, count: n, sampleCount: samples.length, samples };
}