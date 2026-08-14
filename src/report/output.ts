import { categorizeItem } from "../item/category.js";
import type { ParsedItem } from "../item/types.js";
import { displayName } from "../item/types.js";
import type { RawBuild } from "../pob/types.js";

function pad(s: string, n: number): string {
  const w = [...s];
  return s + " ".repeat(Math.max(0, n - w.length));
}

/** 渲染构建解析报告（CLI 文本表格）。 */
export function renderBuildReport(build: RawBuild, parseItem: (rawText: string) => ParsedItem): string {
  const out: string[] = [];
  const info = build.info;
  out.push(
    `构建: ${info.className ?? "?"}${info.ascendClassName ? " / " + info.ascendClassName : ""}  Lv.${info.level ?? "?"}  targetVersion=${info.targetVersion ?? "?"}`,
  );
  out.push(
    `装备 ${build.items.length} 件 | 天赋珠宝 ${build.jewels.length} 颗（树内插槽 ${build.tree?.sockets.length ?? 0} 个） | 技能宝石 ${build.skills.reduce((n, s) => n + s.gems.length, 0)} 颗 | 天赋节点 ${build.tree?.nodes.length ?? 0} 个${build.tree && !build.tree.nodesComplete ? "（部分）" : ""}`,
  );
  out.push("");

  const header = ["ID", "类型", "稀有度", "名称/基底", "ILv", "品质", "孔", "腐化", "词缀"];
  out.push(header.join("  "));
  out.push("-".repeat(96));

  const rows: string[] = [];
  const seenItems = new Set<string>();
  for (const item of build.items) {
    const p = parseItem(item.rawText);
    if (seenItems.has(p.uniqueId ?? item.rawText)) continue;
    seenItems.add(p.uniqueId ?? item.rawText);
    rows.push(
      [
        pad(item.id, 3),
        pad(categorizeItem(p), 8),
        pad(p.rarity, 7),
        pad(displayName(p) + (p.baseType && p.baseType !== p.name ? " [" + p.baseType + "]" : ""), 42),
        pad(String(p.itemLevel ?? ""), 4),
        pad(p.quality != null ? "+" + p.quality + "%" : "", 5),
        pad(p.sockets ?? "", 8),
        p.corrupted ? "✓" : "",
        String(p.implicitMods.length + p.explicitMods.length + p.craftMods.length + p.fracturedMods.length + p.synthesizedMods.length),
      ].join("  "),
    );
  }
  out.push(...rows);

  if (build.jewels.length > 0) {
    out.push("");
    out.push("天赋珠宝（<Jewels>）:");
    for (const j of build.jewels) {
      const p = parseItem(j.rawText);
      out.push(`  节点 ${j.nodeId}  ${p.rarity}  ${displayName(p)}  [${p.baseType ?? ""}]`);
    }
  }

  if (build.skills.length > 0) {
    out.push("");
    out.push("技能宝石:");
    for (const s of build.skills) {
      const parts = s.gems.map(
        (g) => `${g.name ?? g.gemId.split("/").pop() ?? "?"} ${g.level}${g.quality ? "/q" + g.quality : ""}${s.mainActiveSkill ? "*" : ""}`,
      );
      out.push(`  [${s.slot ?? "?"}] ${parts.join(", ")}`);
    }
  }

  if (build.tree?.url) out.push("");
  out.push(`\n天赋树: ${build.tree?.url ?? "(无 URL)"}`);
  return out.join("\n");
}

