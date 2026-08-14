import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseItemText } from "../src/item/parser.js";
import { buildSearchQuery } from "../src/trade/query.js";
import { StatMap } from "../src/trade/stats.js";

const statMap = new StatMap([
  { id: "explicit.stat_mana", text: "+# to maximum Mana", type: "explicit" },
  { id: "explicit.stat_fireres", text: "+#% to Fire Resistance", type: "explicit" },
  { id: "craft.stat_life", text: "+# to maximum Life", type: "craft" },
  { id: "implicit.stat_allres", text: "+#% to Fire and Lightning Resistances", type: "implicit" },
]);

const ring = `Rarity: RARE
Storm Circle
Two-Stone Ring
Unique ID: abc
Item Level: 83
Implicits: 1
+16% to Fire and Lightning Resistances
+31 to maximum Mana
+20% to Lightning Resistance
Curse Enemies with Level 12 Warlord's Mark on Hit
{crafted}+54 to maximum Life`;

describe("buildSearchQuery", () => {
  it("唯一装：name + type，无词缀过滤", () => {
    const item = parseItemText(`Rarity: UNIQUE
Inpulsa's Broken Heart
Sadist Garb
Item Level: 71`);
    const q = buildSearchQuery(item, statMap, {});
    const query = q.query as Record<string, any>;
    assert.equal(query.name.option, "Inpulsa's Broken Heart");
    assert.equal(query.type.option, "Sadist Garb");
    assert.equal(query.status.option, "online");
    assert.equal(query.stats, undefined);
    assert.equal(q.sort.price, "asc");
  });

  it("稀有装 loose：explicit + craft 词缀，数值取 min", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, {});
    const query = q.query as Record<string, any>;
    assert.equal(query.type.option, "Two-Stone Ring");
    assert.equal(query.filters.type_filters.filters.rarity.option, "rare");
    const and = query.stats[0].filters;
    const ids = and.map((f: any) => f.id);
    assert.ok(ids.includes("explicit.stat_mana"), "应包含 mana 词缀");
    assert.ok(ids.includes("craft.stat_life"), "应包含 crafted 词缀");
    const mana = and.find((f: any) => f.id === "explicit.stat_mana");
    assert.deepEqual(mana.value, { min: 31 });
  });

  it("稀有装：偏差百分比放宽 min 值", () => {
    const item = parseItemText(ring);
    // 0% 偏差：min 保持原值
    const exact = buildSearchQuery(item, statMap, {});
    const e = (exact.query as Record<string, any>).stats[0].filters.find((f: any) => f.id === "explicit.stat_mana");
    assert.deepEqual(e.value, { min: 31 });
    // 10% 偏差：min 按 90% 放宽
    const dev = buildSearchQuery(item, statMap, { deviationPct: 10 });
    const d = (dev.query as Record<string, any>).stats[0].filters.find((f: any) => f.id === "explicit.stat_mana");
    assert.equal(d.value.min, 28); // 31 * 0.9 = 27.9 → round 28
  });

  it("maxMods 上限生效", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, { maxMods: 2 });
    const query = q.query as Record<string, any>;
    assert.ok(query.stats[0].filters.length <= 2);
  });

  it("offline 选项", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, { online: false });
    assert.equal((q.query as Record<string, any>).status.option, "any");
  });
});