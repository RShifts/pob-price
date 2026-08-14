import type { StatEntry } from "./types.js";

/**
 * 词缀文本 → stat id 的匹配。
 *
 * 官方 data/stats 的 text 用 "#" 作数字占位（如 "+# to maximum Mana"），
 * 物品词缀文本（如 "+31 to maximum Mana"）通过归一化后按文本匹配。
 * 归一化：数字 → "#"，其余标点 → 空格，小写化。
 */
export function normalizeStatText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[+-]?\d+(?:\.\d+)?/g, "#")
    .replace(/[^a-z#% ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 提取词缀文本里的数值（含负数）。 */
export function extractValues(modText: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(modText)) !== null) out.push(parseFloat(m[0]));
  return out;
}

/** 归一化文本 → 候选 stat 的映射。 */
export class StatMap {
  private byText = new Map<string, StatEntry[]>();

  constructor(entries: StatEntry[]) {
    for (const e of entries) {
      const key = normalizeStatText(e.text);
      const list = this.byText.get(key);
      if (list) list.push(e);
      else this.byText.set(key, [e]);
    }
  }

  /**
   * 匹配一条物品词缀。
   * @param modText 词缀文本（不含 {crafted} 等前缀）
   * @param prefer 优先的 stat type（explicit / implicit / craft ...）
   * @returns 匹配到的 stat id 列表（可能多个同文不同 id，取全部）
   */
  match(modText: string, prefer?: string): { id: string; type: string }[] {
    const key = normalizeStatText(modText);
    const candidates = this.byText.get(key);
    if (!candidates || candidates.length === 0) return [];
    if (prefer) {
      const preferred = candidates.filter((c) => c.type === prefer);
      if (preferred.length > 0) return preferred.map((c) => ({ id: c.id, type: c.type }));
    }
    return candidates.map((c) => ({ id: c.id, type: c.type }));
  }
}
