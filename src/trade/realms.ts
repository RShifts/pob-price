import { EN_CN_NAMES } from "./data/en-cn.js";
import type { ParsedItem } from "../item/types.js";

export type RealmId = "intl" | "cn";

export interface RealmConfig {
  id: RealmId;
  host: string;
  /** 国服搜索需要登录会话 Cookie */
  needsCookie: boolean;
}

export const REALMS: Record<RealmId, RealmConfig> = {
  intl: { id: "intl", host: "https://www.pathofexile.com", needsCookie: false },
  cn: { id: "cn", host: "https://poe.game.qq.com", needsCookie: true },
};

export function realmOf(id: string): RealmConfig {
  return REALMS[id as RealmId] ?? REALMS.intl;
}

/** 英文名 → 中文名（国服市集名称）；查不到返回原值。 */
export function translateToCn(name: string): string {
  return EN_CN_NAMES[name] ?? EN_CN_NAMES[name.trim()] ?? name;
}

/** 物品本地化：国服查询前把 name/baseType 翻译成中文（stat 词缀 id 跨服通用，无需翻译）。 */
export function localizeItem(item: ParsedItem, realm: RealmId): ParsedItem {
  if (realm === "intl") return item;
  return {
    ...item,
    name: item.name ? translateToCn(item.name) : undefined,
    baseType: item.baseType ? translateToCn(item.baseType) : undefined,
  };
}

/** 宝石名本地化（国服）。 */
export function localizeGemName(name: string, realm: RealmId): string {
  return realm === "cn" ? translateToCn(name) : name;
}
