import type { BatchItemResult } from "./engine.js";

/** 导出 CSV（UTF-8 带 BOM，Excel 直接打开中文不乱码）。 */
export function itemsToCsv(results: BatchItemResult[]): string {
  const header = ["类别", "名称", "基底", "稀有度", "ILv/等级", "数量", "最低(c)", "中位(c)", "均价(c)", "样本", "市集匹配", "市集链接", "备注"];
  const rows = results.map((r) => {
    const lvl = r.kind === "gem" ? (r.gemLevel ?? "") : (r.ilvl ?? "");
    return [
      r.category,
      r.name,
      r.baseType ?? "",
      r.rarity ?? "",
      lvl,
      r.count,
      fmt(r.minChaos),
      fmt(r.medianChaos),
      fmt(r.avgChaos),
      r.sampleCount,
      r.total,
      r.url,
      r.error ?? "",
    ];
  });
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header, ...rows].map((row) => row.map(esc).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function fmt(v: number | null): string {
  return v == null ? "" : v.toFixed(1);
}
