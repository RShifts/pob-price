import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGemQuery, buildSearchQuery, scoreModText } from "../src/trade/query.js";
import { StatMap } from "../src/trade/stats.js";
import { parseItemText } from "../src/item/parser.js";

describe("buildGemQuery", () => {
  it("按宝石名 + 最低等级过滤", () => {
    const q = buildGemQuery("Tornado Shot", 20);
    const query = q.query as Record<string, any>;
    assert.equal(query.type.option, "Tornado Shot");
    assert.deepEqual(query.filters.misc_filters.filters.gem_level, { min: 20 });
    assert.equal(query.status.option, "online");
  });

  it("等级 0 时不加过滤", () => {
    const q = buildGemQuery("Enlighten", 0);
    const query = q.query as Record<string, any>;
    assert.deepEqual(query.filters.misc_filters.filters, {});
  });
});

describe("scoreModText", () => {
  it("生命/抗性优先级高于普通词缀", () => {
    assert.ok(scoreModText("+80 to maximum Life") > scoreModText("+12 to Accuracy Rating"));
    assert.ok(scoreModText("+40% to Fire Resistance") > scoreModText("+12 to Accuracy Rating"));
  });
});

describe("buildSearchQuery 词缀排序", () => {
  const statMap = new StatMap([
    { id: "explicit.stat_life", text: "+# to maximum Life", type: "explicit" },
    { id: "explicit.stat_acc", text: "+# to Accuracy Rating", type: "explicit" },
  ]);
  const item = parseItemText(`Rarity: RARE
Vaal Regalia
Body Armours
Item Level: 83
Implicits: 0
+12 to Accuracy Rating
+80 to maximum Life`);

  it("maxMods=1 时优先保留生命词缀", () => {
    const q = buildSearchQuery(item, statMap, { mode: "loose", maxMods: 1 });
    const query = q.query as Record<string, any>;
    assert.equal(query.stats[0].filters[0].id, "explicit.stat_life");
  });
});
