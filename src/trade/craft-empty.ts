// 工艺词缀 → 空位过滤
// 需求：装备带工艺词缀时，判断它是前缀还是后缀，查询时把工艺词缀文本过滤
// 替换为「空 1 前缀」/「空 1 后缀」条件 —— 这样搜到的是还有空位、可以自己上工艺的装备。
import { CRAFT_POS } from "./data/craft-pos.js";

/** 归一化：数字范围/值 → #（与 craft-pos.ts 的键一致） */
function normMod(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(?(\d+[\-–\d,.]*)\)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export type CraftPos = "prefix" | "suffix" | null;

/**
 * 判断一条工艺词缀文本占前缀还是后缀。
 * @returns "prefix" | "suffix" | null（无法判断）
 */
export function craftPosOf(modText: string): CraftPos {
  return CRAFT_POS.get(normMod(modText)) ?? null;
}

export interface EmptyModsFilter {
  /** 需要空 1 前缀（empty_prefix_mods min 1） */
  emptyPrefix: boolean;
  /** 需要空 1 后缀（empty_suffix_mods min 1） */
  emptySuffix: boolean;
}

/**
 * 汇总一批工艺词缀的空位需求：任一工艺词缀判定为前缀 → 空前缀；后缀 → 空后缀。
 * 无法判定的工艺词缀忽略（不会产生空位需求）。
 */
export function emptyModsFromCrafts(craftMods: readonly string[] | undefined): EmptyModsFilter {
  let emptyPrefix = false;
  let emptySuffix = false;
  for (const m of craftMods ?? []) {
    const pos = craftPosOf(m);
    if (pos === "prefix") emptyPrefix = true;
    else if (pos === "suffix") emptySuffix = true;
  }
  return { emptyPrefix, emptySuffix };
}

/** 把空位需求写入查询的 misc_filters */
export function applyEmptyMods(query: Record<string, unknown>, f: EmptyModsFilter): void {
  const misc = (query.filters as Record<string, unknown> | undefined)?.misc_filters as Record<string, unknown> | undefined;
  if (!misc) return;
  const filters = (misc.filters ?? {}) as Record<string, unknown>;
  if (f.emptyPrefix) filters.empty_prefix_mods = { min: 1 };
  if (f.emptySuffix) filters.empty_suffix_mods = { min: 1 };
  misc.filters = filters;
}