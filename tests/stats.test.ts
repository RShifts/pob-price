import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeStatText, extractValues, StatMap } from "../src/trade/stats.js";

describe("normalizeStatText", () => {
  it("数字归一化为 #", () => {
    assert.equal(normalizeStatText("+31 to maximum Mana"), "# to maximum mana");
    assert.equal(normalizeStatText("+# to maximum Mana"), "# to maximum mana");
  });
  it("百分号与标点", () => {
    assert.equal(normalizeStatText("+20% to Lightning Resistance"), "#% to lightning resistance");
    assert.equal(normalizeStatText("Adds 5 to 10 Fire Damage"), "adds # to # fire damage");
    assert.equal(normalizeStatText("Curse Enemies with Level 12 Warlord's Mark on Hit"), "curse enemies with level # warlord s mark on hit");
  });
  it("小数与范围", () => {
    assert.equal(normalizeStatText("+1.5% to Critical Strike Chance"), "#% to critical strike chance");
  });
});

describe("extractValues", () => {
  it("取数值", () => {
    assert.deepEqual(extractValues("+31 to maximum Mana"), [31]);
    assert.deepEqual(extractValues("Adds 5 to 10 Fire Damage"), [5, 10]);
    assert.deepEqual(extractValues("20% increased Attack Speed"), [20]);
    assert.deepEqual(extractValues("Curse Enemies with Level 12 Warlord's Mark on Hit"), [12]);
  });
});

describe("StatMap.match", () => {
  const map = new StatMap([
    { id: "explicit.stat_1050105434", text: "+# to maximum Mana", type: "explicit" },
    { id: "implicit.stat_123", text: "+# to maximum Mana", type: "implicit" },
    { id: "explicit.stat_456", text: "#% to Lightning Resistance", type: "explicit" },
    { id: "craft.stat_789", text: "Curse Enemies with Level # Warlord's Mark on Hit", type: "craft" },
  ]);

  it("按文本匹配并优先 type", () => {
    assert.deepEqual(map.match("+31 to maximum Mana", "explicit"), [{ id: "explicit.stat_1050105434", type: "explicit" }]);
    assert.deepEqual(map.match("+31 to maximum Mana", "implicit"), [{ id: "implicit.stat_123", type: "implicit" }]);
    assert.deepEqual(map.match("Curse Enemies with Level 12 Warlord's Mark on Hit", "craft"), [{ id: "craft.stat_789", type: "craft" }]);
  });

  it("无匹配返回空", () => {
    assert.deepEqual(map.match("Completely Unknown Mod Here"), []);
  });

  it("无 prefer 时返回全部候选", () => {
    assert.equal(map.match("+31 to maximum Mana").length, 2);
  });
});