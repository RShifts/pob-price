import type { ParsedItem } from "../item/types.js";
import { StatMap, extractValues } from "./stats.js";

export interface QueryOptions {
  maxPrice?: number;
  /** 工艺词缀处理方式（默认 "none"）："none" 忽略 / "match" 按文本匹配工艺词缀 */
  craftedMode?: "none" | "match";
  /** 词缀数量上限（默认 8，防止查询过大） */
  maxMods?: number;
  /** 交易类型（如 auto_buyout=交易一口价/立即购买） */
  saleType?: string;
  /**
   * 国服必须用 any：国服后端对 status=online 静默返回 0。
   * 国际服固定 status=any + sale_type=securable（立即购买），不再按在线过滤。
   */
  statusAny?: boolean;
  /**
   * 匹配偏差百分比（0-50，默认 0）：
   * 词缀过滤的 min 值按该百分比放宽（如物品 +31 mana，偏差 10% → 查询 min=28），
   * 偏差越大找到的"类似装备"越多、越不精确。
   */
  deviationPct?: number;
}

export interface TradeQuery {
  query: Record<string, unknown>;
  sort: Record<string, string>;
}

/** 词缀重要性打分（数值越大越重要，用于 maxMods 截断时优先保留关键词缀）。 */
export function scoreModText(modText: string): number {
  const t = modText.toLowerCase();
  let s = 1;
  if (t.includes("maximum life")) s += 100;
  if (t.includes("maximum energy shield") || t.includes("maximum mana")) s += 70;
  if (t.includes("resistance")) s += 80;
  if (t.includes("attack speed") || t.includes("cast speed") || t.includes("movement speed")) s += 60;
  if (t.includes("critical")) s += 50;
  if (t.includes("added") || t.includes("damage")) s += 40;
  if (t.includes("strength") || t.includes("dexterity") || t.includes("intelligence")) s += 30;
  if (t.includes("physical") || t.includes("cold") || t.includes("fire") || t.includes("lightning") || t.includes("chaos")) s += 20;
  return s;
}

/** 词缀→stat 过滤项：min 按偏差百分比放宽（同类/略低的物品也能匹配）。 */
function statFilter(
  modText: string,
  stat: { id: string; type: string },
  deviationPct: number,
): { id: string; value: { min?: number; max?: number } } | null {
  const values = extractValues(modText);
  const value: { min?: number; max?: number } = {};
  const relax = (v: number) => Math.round(v * (1 - deviationPct / 100));
  if (values.length >= 1) value.min = relax(values[0]);
  if (values.length >= 2) value.max = values[1];
  if (value.min === undefined) return null;
  return { id: stat.id, value };
}

/**
 * 把解析出的物品 → 官方市集查询 JSON。
 *
 * - 唯一装：name + type 过滤（不搜词缀）
 * - 稀有/魔法：type + rarity + 词缀过滤（显性+裂痕+可选工艺，min 值按偏差百分比放宽；工艺词缀默认不查）
 */
export function buildSearchQuery(item: ParsedItem, statMap: StatMap, opts: QueryOptions = {}): TradeQuery {
  const maxMods = opts.maxMods ?? 8;
  const deviationPct = Math.min(50, Math.max(0, opts.deviationPct ?? 0));

  const typeFilters: Record<string, unknown> = {};
  const rarity = item.rarity.toLowerCase();
  if (["normal", "magic", "rare", "unique"].includes(rarity)) {
    typeFilters.rarity = { option: rarity };
  }

  const tradeFilters: Record<string, unknown> = {};
  if (opts.maxPrice != null) tradeFilters.price = { max: opts.maxPrice };
  if (opts.saleType) tradeFilters.sale_type = { option: opts.saleType };
  // status 恒为 any：不按在线过滤（国际服靠 sale_type=securable 保证可立即购买；国服 online 会静默返回 0）
  const query: Record<string, unknown> = {
    status: { option: "any" },
    filters: {
      type_filters: { filters: typeFilters },
      trade_filters: { filters: tradeFilters },
      misc_filters: { filters: {} },
    },
  };
  if (item.rarity === "Unique" && item.name) query.name = { option: item.name };
  if (item.baseType) query.type = { option: item.baseType };

  // 武器 / 身体装备：孔数加入查询；6 连额外要求链接数（六连对价格影响极大）
  const baseLower = (item.baseType ?? "").toLowerCase();
  const isWeapon = /axe|sword|dagger|claw|mace|staff|wand|bow|sceptre|hammer|rapier|foil|talon|sickle|spear|trident|warhammer|maul|warstaff|sai|hook|harpoon|bayonet|jade hatchet|sharktooth/.test(baseLower);
  const isBodyArmour = /garb|regalia|armou?r|plate|mail|jacket|coat|gown|robe|vest|mantle|cuirass|breastplate/.test(baseLower);
  if ((isWeapon || isBodyArmour) && item.linkCount != null && item.linkCount > 0) {
    const misc = (query.filters as Record<string, unknown>).misc_filters as Record<string, unknown>;
    const filters = (misc.filters ?? {}) as Record<string, unknown>;
    // 官方 misc_filters：sockets=孔数、links=最大相连组孔数
    filters.sockets = { min: item.socketCount ?? item.linkCount };
    if (item.linkCount >= 6) filters.links = { min: item.linkCount };
    misc.filters = filters;
  }

  if (item.rarity !== "Unique" && item.rarity !== "Normal") {
    const candidates: { modText: string; prefer?: string; score: number }[] = [];
    const add = (mods: string[], prefer?: string) => {
      for (const modText of mods) candidates.push({ modText, prefer, score: scoreModText(modText) });
    };
    add(item.explicitMods, "explicit");
    if (opts.craftedMode === "match") add(item.craftMods, "crafted");
    add(item.fracturedMods, "fractured");
    candidates.sort((a, b) => b.score - a.score);

    const and: { id: string; value: { min?: number; max?: number } }[] = [];
    for (const c of candidates) {
      if (and.length >= maxMods) break;
      const matches = statMap.match(c.modText, c.prefer);
      if (matches.length === 0) continue;
      const f = statFilter(c.modText, matches[0], deviationPct);
      if (f) and.push(f);
    }
    if (and.length > 0) query.stats = [{ type: "and", filters: and }];
  }

  return { query, sort: { price: "asc" } };
}

/** 技能宝石查询：按宝石名 + 最低等级过滤（quality 官方 API 不支持过滤）。 */
export function buildGemQuery(name: string, level: number, opts: { saleType?: string } = {}): TradeQuery {
  return {
    query: {
      status: { option: "any" },
      type: { option: name },
      filters: {
        type_filters: { filters: {} },
        misc_filters: { filters: level > 0 ? { gem_level: { min: level } } : {} },
        trade_filters: { filters: opts.saleType ? { sale_type: { option: opts.saleType } } : {} },
      },
    },
    sort: { price: "asc" },
  };
}

/** 生成官方市集网页链接（可浏览器打开）。 */
export function tradeSearchUrl(host: string, league: string, searchId: string): string {
  return host + "/trade/search/" + encodeURIComponent(league) + "/" + searchId;
}
