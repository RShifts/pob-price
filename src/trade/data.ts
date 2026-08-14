import { DiskCache } from "./cache.js";
import type { ItemGroup, StatEntry, StatGroup, TradeLeague } from "./types.js";

export const DEFAULT_UA = "pob-price/0.2 (local POB price checker; private use)";
export const INTERNATIONAL_HOST = "https://www.pathofexile.com";

const TTL = { leagues: 60 * 60 * 1000, stats: 60 * 60 * 1000, items: 60 * 60 * 1000 };

/**
 * 官方市集数据接口：leagues / stats / items。
 * 设计上以 host 参数抽象国际服与国服（国服 poe.game.qq.com 同构，M4 接入）。
 */
export class TradeData {
  private cache: DiskCache;
  private host: string;

  constructor(host = INTERNATIONAL_HOST, cache?: DiskCache) {
    this.host = host;
    this.cache = cache ?? new DiskCache();
  }

  private async getJson<T>(path: string, key: string, ttlMs: number): Promise<T> {
    const cached = this.cache.get<T>(key);
    if (cached !== null) return cached;
    const res = await fetch(this.host + path, {
      headers: { "User-Agent": DEFAULT_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`市集数据拉取失败 ${res.status}: ${path}`);
    const data = (await res.json()) as T;
    this.cache.set(key, data, ttlMs);
    return data;
  }

  async leagues(): Promise<TradeLeague[]> {
    const j = await this.getJson<{ result: TradeLeague[] }>("/api/trade/data/leagues", "trade:leagues:" + this.host, TTL.leagues);
    return j.result ?? [];
  }

  /** 展平后的全部词缀（含 explicit/implicit/craft/enchant/pseudo 等）。 */
  async stats(): Promise<StatEntry[]> {
    const j = await this.getJson<{ result: StatGroup[] }>("/api/trade/data/stats", "trade:stats:" + this.host, TTL.stats);
    const out: StatEntry[] = [];
    for (const g of j.result ?? []) for (const e of g.entries ?? []) out.push(e);
    return out;
  }

  /** 基底类型分组（类别 id 即组 id，如 accessory / weapon.oneaxe）。 */
  async itemGroups(): Promise<ItemGroup[]> {
    const j = await this.getJson<{ result: ItemGroup[] }>("/api/trade/data/items", "trade:items:" + this.host, TTL.items);
    return j.result ?? [];
  }

  /** 取默认联赛：优先 realm=pc 且非 HC/Ruthless 的当前挑战联赛。 */
  async pickLeague(): Promise<string> {
    const leagues = await this.leagues();
    const pc = leagues.filter((l) => l.realm === "pc");
    const preferred =
      pc.find((l) => !/ruthless|hardcore|standard|ssf/i.test(l.id)) ?? pc[0] ?? leagues[0];
    if (!preferred) throw new Error("无法获取联赛列表");
    return preferred.id;
  }
}