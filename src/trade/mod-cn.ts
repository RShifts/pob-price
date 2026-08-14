// 词缀文本 → 中文翻译
// 原理：把物品词缀文本中的数字归一化为 #（保留 +/- 符号与 %），
// 在 MOD_CN_MAP（由 PoeCharm statDescriptions.csv / Query_Mod.csv 生成）中查表，
// 再把中文模板中的占位符（# 或 {0}/{1}...）替换回原始数字。
import { MOD_CN_MAP } from "./data/en-cn-mods.js";

/** 匹配数字（含 +/- 符号、小数），不吞 % */
const NUM_RE = /[+-]?\d+(?:\.\d+)?/g;

/** POB 珠宝半径等固定标注文本（无数字，statDescriptions 不含） */
const FIXED_CN: Record<string, string> = {
  "Radius: Small": "半径：小型",
  "Radius: Medium": "半径：中型",
  "Radius: Large": "半径：大型",
  "Radius: Very Large": "半径：超大型",
  "Radius: Grand": "半径：巨型",
  "Radius: Massive": "半径：庞大",
  "Allocated Small Passive": "已配置小型天赋",
  "Unallocated Small Passive": "未配置小型天赋",
  "Allocated Notable Passive": "已配置核心天赋",
  "Unallocated Notable Passive": "未配置核心天赋",
  "Allocated Keystone Passive": "已配置基石天赋",
  "Unallocated Keystone Passive": "未配置基石天赋",
  "Limited to: 1": "限制：1",
  "Limited to: 1 Unique": "限制：1 件传奇装备",
  "Limited to: 2": "限制：2",
  "Limited to: 3": "限制：3",
};

/**
 * 把一条词缀文本翻译成中文。
 * @returns 中文文本；找不到对应翻译时返回 null
 */
export function translateModToCn(text: string): string | null {
  const fixed = FIXED_CN[text];
  if (fixed) return fixed;
  const tokens: string[] = [];
  const key = text.replace(NUM_RE, (m) => { tokens.push(m); return "#"; });
  const cn = MOD_CN_MAP.get(key);
  if (!cn) return null;
  let next = 0;
  return cn.replace(/(?:#|\{(\d+)\})/g, (_m, idx) => {
    const i = idx === undefined ? next++ : Number(idx);
    return tokens[i] ?? "?";
  });
}

/** 批量翻译，返回 [{ en, cn }]；cn 为 null 表示未翻译 */
export function translateModsToCn(mods: readonly string[] | undefined): { en: string; cn: string | null }[] {
  if (!mods) return [];
  return mods.map((en) => ({ en, cn: translateModToCn(en) }));
}