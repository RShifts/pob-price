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
    assert.equal(query.status.option, "any");
    assert.equal(query.stats, undefined);
    assert.equal(q.sort.price, "asc");
  });

  it("稀有装 loose：explicit 词缀数值取 min；工艺词缀默认不纳入", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, {});
    const query = q.query as Record<string, any>;
    assert.equal(query.type.option, "Two-Stone Ring");
    assert.equal(query.filters.type_filters.filters.rarity.option, "rare");
    const and = query.stats[0].filters;
    const ids = and.map((f: any) => f.id);
    assert.ok(ids.includes("explicit.stat_mana"), "应包含 mana 词缀");
    assert.ok(!ids.includes("craft.stat_life"), "工艺词缀默认不纳入过滤");
    const mana = and.find((f: any) => f.id === "explicit.stat_mana");
    assert.deepEqual(mana.value, { min: 31 });
  });

  it("craftedMode=match 时工艺词缀按文本纳入过滤", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, { craftedMode: "match" });
    const query = q.query as Record<string, any>;
    const ids = query.stats[0].filters.map((f: any) => f.id);
    assert.ok(ids.includes("craft.stat_life"), "match 模式应包含工艺词缀");
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

  it("国际服固定 sale_type=priced（有标价可立即购买）", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, { saleType: "priced" });
    const query = q.query as Record<string, any>;
    assert.equal(query.status.option, "any");
    assert.equal(query.filters.trade_filters.filters.sale_type.option, "priced");
  });

  it("武器/身体 6 连：misc 加 sockets + links", () => {
    const item = parseItemText(`Rarity: RARE\nAssassin Garb\nItem Level: 86\nSockets: R-R-G-G-B-B\n+31 to maximum Mana`);
    const q = buildSearchQuery(item, statMap, {});
    const misc = (q.query as Record<string, any>).filters.misc_filters.filters;
    assert.deepEqual(misc.sockets, { min: 6 });
    assert.deepEqual(misc.links, { min: 6 });
  });

  it("非 6 连武器：只加 sockets，不加 links", () => {
    const item = parseItemText(`Rarity: RARE\nQuartz Sceptre\nItem Level: 80\nSockets: G-R-B\n+31 to maximum Mana`);
    const q = buildSearchQuery(item, statMap, {});
    const misc = (q.query as Record<string, any>).filters.misc_filters.filters;
    assert.deepEqual(misc.sockets, { min: 3 });
    assert.equal(misc.links, undefined);
  });

  it("非身体/武器（戒指）：不加孔位过滤", () => {
    const item = parseItemText(`Rarity: RARE\nTwo-Stone Ring\nItem Level: 83\n+31 to maximum Mana`);
    const q = buildSearchQuery(item, statMap, {});
    const misc = (q.query as Record<string, any>).filters.misc_filters.filters;
    assert.deepEqual(misc, {});
  });

  it("国服不传 sale_type", () => {
    const item = parseItemText(ring);
    const q = buildSearchQuery(item, statMap, {});
    const query = q.query as Record<string, any>;
    assert.equal(query.filters.trade_filters.filters.sale_type, undefined);
  });
});