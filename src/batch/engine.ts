import { categorizeItem } from "../item/category.js";
import { parseItemText } from "../item/parser.js";
import type { ParsedItem } from "../item/types.js";
import type { RawBuild, RawItemSlot } from "../pob/types.js";
import { localizeGemName, localizeItem, REALMS } from "../trade/realms.js";
import type { RealmId } from "../trade/realms.js";
import { aggregatePrices, toPriceSamples } from "../trade/price.js";
import { buildGemQuery, buildSearchQuery, tradeSearchUrl } from "../trade/query.js";
import { StatMap } from "../trade/stats.js";
import type { Listing, SearchResponse, StatEntry } from "../trade/types.js";
import { fetchChaosConversion } from "../pricer/ninja.js";

/** 数据提供方（TradeData 满足该结构）。 */
export interface DataProvider {
  stats(): Promise<StatEntry[]>;
}

/** 客户端提供方（TradeClient 满足该结构）。 */
export interface ClientProvider {
  search(league: string, query: unknown): Promise<SearchResponse>;
  fetchListings(searchId: string, ids: string[]): Promise<Listing[]>;
}

export interface BatchOptions {
  league: string;
  /** 匹配偏差百分比（0-50），词缀 min 值按此放宽 */
  deviationPct?: number;
  /** 每件取前 n 个挂牌 */
  limit: number;
  /** 交易类型（如 securable=立即购买）。国际服默认 securable；国服不传（sale_type 会致 0） */
  saleType?: string;
  /** 词缀过滤上限 */
  maxMods: number;
  /** 是否给技能宝石查价 */
  includeGems: boolean;
  /** 进度回调（已处理数, 总数, 标签） */
  onProgress?: (done: number, total: number, label: string) => void;
  /** 逐项完成回调（用于 UI 实时展示部分结果） */
  onItem?: (result: BatchItemResult) => void;
  /** 只查价指定物品 id（装备/珠宝的 id），缺省查全部 */
  onlyIds?: string[];
  /** 服：intl 国际服 / cn 国服（默认 intl） */
  realm?: RealmId;
  /** 市集域名（默认按 realm 取） */
  host?: string;
}

export interface BatchItemResult {
  kind: "item" | "gem";
  /** 去重键 */
  key: string;
  /** 对应的装备槽位 id（用于 UI 单件重试） */
  ids?: string[];
  /** 同键数量（同款多件时价格×数量） */
  count: number;
  category: string;
  name: string;
  /** 中文名（UI 展示用，由服务端附加） */
  nameCn?: string;
  /** 查询中使用的词缀过滤数（UI 展示"词缀N"） */
  statCount?: number;
  baseType?: string;
  rarity?: string;
  ilvl?: number;
  gemLevel?: number;
  gemQuality?: number;
  /** 市集匹配总数 */
  total: number;
  minChaos: number | null;
  medianChaos: number | null;
  avgChaos: number | null;
  sampleCount: number;
  url: string;
  error?: string;
}

export interface BatchSummary {
  results: BatchItemResult[];
  totalChaosMin: number;
  totalChaosMedian: number;
  pricedCount: number;
  failedCount: number;
  durationMs: number;
  league: string;
}

interface GemEntry {
  name: string;
  gemId: string;
  level: number;
  quality: number;
  slot: string;
}

/** 市集里的宝石类型名：辅助宝石在显示名后带 "Support" 后缀（如 Enlighten → Enlighten Support）。 */
function gemTypeName(name: string, gemId: string): string {
  const isSupport = gemId.includes("SupportGem");
  if (isSupport && !/support$/i.test(name)) return name + " Support";
  return name;
}

/** 批量查价引擎：整份构建的所有装备/药剂/珠宝/宝石排队查价。 */
export class BatchPriceEngine {
  private data: DataProvider;
  private client: ClientProvider;
  private conversionProvider: (league: string) => Promise<ReadonlyMap<string, number>>;

  constructor(
    data: DataProvider,
    client: ClientProvider,
    conversionProvider: (league: string) => Promise<ReadonlyMap<string, number>> = fetchChaosConversion,
  ) {
    this.data = data;
    this.client = client;
    this.conversionProvider = conversionProvider;
  }

  private buildEntries(build: RawBuild, opts: Pick<BatchOptions, "includeGems" | "onlyIds">): ({ kind: "item"; slot: RawItemSlot; count: number; sig: string } | { kind: "gem"; gem: GemEntry; count: number; sig: string })[] {
    const entries: ({ kind: "item"; slot: RawItemSlot; count: number; sig: string } | { kind: "gem"; gem: GemEntry; count: number; sig: string })[] = [];
    const onlyIds = opts.onlyIds ? new Set(opts.onlyIds) : null;
    // 装备/珠宝/药剂：按 uniqueId 或原始文本去重
    const seenItems = new Map<string, RawItemSlot>();
    for (const slot of build.items) {
      if (onlyIds && !onlyIds.has(slot.id)) continue;
      const parsed = parseItemText(slot.rawText);
      const sig = parsed.uniqueId ?? slot.rawText;
      if (!seenItems.has(sig)) seenItems.set(sig, slot);
      else continue; // 同款只查一次，数量在结果里累计
    }
    for (const [sig, slot] of seenItems) entries.push({ kind: "item", slot, count: build.items.filter((i) => (parseItemText(i.rawText).uniqueId ?? i.rawText) === sig).length, sig });

    if (opts.includeGems) {
      const seenGems = new Map<string, GemEntry>();
      for (const skill of build.skills) {
        for (const g of skill.gems) {
          if (!g.enabled) continue;
          const name = g.name ?? g.gemId.split("/").pop() ?? "?";
          const sig = name + "@" + g.level + ":" + g.quality;
          // 支持按宝石 id（"gem:" + sig）单件重试
          if (onlyIds && !onlyIds.has("gem:" + sig)) continue;
          if (!seenGems.has(sig)) seenGems.set(sig, { name, gemId: g.gemId, level: g.level, quality: g.quality, slot: skill.slot ?? "" });
        }
      }
      for (const [sig, gem] of seenGems) entries.push({ kind: "gem", gem, count: 1, sig });
    }
    return entries;
  }

  private async priceEntry(
    entry: { kind: "item"; slot: RawItemSlot; count: number; sig: string } | { kind: "gem"; gem: GemEntry; count: number; sig: string },
    statMap: StatMap,
    conversion: ReadonlyMap<string, number>,
    opts: BatchOptions,
  ): Promise<BatchItemResult> {
    const base = { count: entry.count, minChaos: null as number | null, medianChaos: null as number | null, avgChaos: null as number | null, sampleCount: 0 };

    if (entry.kind === "item") {
      const parsed = localizeItem(parseItemText(entry.slot.rawText), opts.realm ?? "intl");
      // 国服：status 必须 any（online 会静默返回 0）；sale_type 会致 0，不传
      const query = buildSearchQuery(parsed, statMap, { deviationPct: opts.deviationPct, saleType: opts.saleType, maxMods: opts.maxMods, statusAny: opts.realm === "cn" });
      const search = await this.client.search(opts.league, query);
      const statCount = ((query.query as Record<string, unknown>).stats as { filters?: unknown[] }[] | undefined)?.[0]?.filters?.length ?? 0;
      const result: BatchItemResult = {
        kind: "item",
        key: parsed.uniqueId ?? entry.slot.rawText,
        ids: [entry.slot.id],
        statCount,
        category: categorizeItem(parsed),
        name: parsed.name ?? parsed.baseType ?? "(未命名)",
        baseType: parsed.baseType,
        rarity: parsed.rarity,
        ilvl: parsed.itemLevel,
        total: search.total,
        url: search.id ? tradeSearchUrl(opts.host ?? REALMS[opts.realm ?? "intl"].host, opts.league, search.id) : "",
        ...base,
      };
      if (search.total > 0 && search.result.length > 0) {
        const listings = await this.client.fetchListings(search.id, search.result.slice(0, opts.limit));
        const samples = toPriceSamples(listings, conversion);
        const agg = aggregatePrices(samples);
        result.minChaos = agg.minChaos;
        result.medianChaos = agg.medianChaos;
        result.avgChaos = agg.avgChaos;
        result.sampleCount = agg.sampleCount;
      }
      return result;
    } else {
      const gem = entry.gem;
      const typeName = localizeGemName(gemTypeName(gem.name, gem.gemId), opts.realm ?? "intl");
      const query = buildGemQuery(typeName, gem.level, { saleType: opts.saleType });
      const search = await this.client.search(opts.league, query);
      const result: BatchItemResult = {
        kind: "gem",
        key: gem.name + "@" + gem.level,
        ids: ["gem:" + entry.sig],
        category: "宝石",
        name: gem.name,
        gemLevel: gem.level,
        gemQuality: gem.quality,
        total: search.total,
        url: search.id ? tradeSearchUrl(opts.host ?? REALMS[opts.realm ?? "intl"].host, opts.league, search.id) : "",
        ...base,
      };
      if (search.total > 0 && search.result.length > 0) {
        const listings = await this.client.fetchListings(search.id, search.result.slice(0, opts.limit));
        const samples = toPriceSamples(listings, conversion);
        const agg = aggregatePrices(samples);
        result.minChaos = agg.minChaos;
        result.medianChaos = agg.medianChaos;
        result.avgChaos = agg.avgChaos;
        result.sampleCount = agg.sampleCount;
      }
      return result;
    }
  }

  async run(build: RawBuild, opts: BatchOptions): Promise<BatchSummary> {
    const started = Date.now();
    // 国际服固定 sale_type=securable（立即购买）；国服不传（sale_type 会致 0）
    if (opts.saleType === undefined && opts.realm !== "cn") opts.saleType = "securable";
    const entries = this.buildEntries(build, { includeGems: opts.includeGems, onlyIds: opts.onlyIds });
    const statMap = new StatMap(await this.data.stats());

    let conversion = new Map<string, number>();
    try {
      conversion = new Map(await this.conversionProvider(opts.league));
    } catch {
      // 折算表不可用：混沌基准 1:1（price.ts 已兜底）
    }

    const results: BatchItemResult[] = [];
    let done = 0;
    for (const entry of entries) {
      const label = entry.kind === "item" ? (parseItemText(entry.slot.rawText).name ?? entry.slot.rawText.split("\n")[0] ?? entry.slot.id) : entry.gem.name;
      opts.onProgress?.(done, entries.length, label);
      let result: BatchItemResult;
      try {
        result = await this.priceEntry(entry, statMap, conversion, opts);
      } catch (err) {
        result = {
          kind: entry.kind,
          key: entry.sig,
          count: entry.count,
          category: entry.kind === "gem" ? "宝石" : "装备",
          name: label,
          total: 0,
          minChaos: null,
          medianChaos: null,
          avgChaos: null,
          sampleCount: 0,
          url: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      results.push(result);
      opts.onItem?.(result);
      done++;
    }
    opts.onProgress?.(done, entries.length, "完成");

    const priced = results.filter((r) => !r.error);
    const totalChaosMin = priced.reduce((sum, r) => sum + (r.minChaos ?? 0) * r.count, 0);
    const totalChaosMedian = priced.reduce((sum, r) => sum + (r.medianChaos ?? 0) * r.count, 0);

    return {
      results,
      totalChaosMin,
      totalChaosMedian,
      pricedCount: priced.length,
      failedCount: results.length - priced.length,
      durationMs: Date.now() - started,
      league: opts.league,
    };
  }
}
