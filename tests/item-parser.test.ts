import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseItemText } from "../src/item/parser.js";
import { parseBuildXml } from "../src/pob/xml.js";

const importCode = readFileSync("tests/fixtures/import_code.xml", "utf8");
const realPobb = readFileSync("tests/fixtures/real-pobb.in.xml", "utf8");

function itemTextByName(buildXml: string, name: string): string {
  const b = parseBuildXml(buildXml);
  const it = b.items.find((i) => i.rawText.includes(name));
  assert.ok(it, `fixture 中应存在 ${name}`);
  return it!.rawText;
}

describe("parseItemText — POB 导出格式", () => {
  it("稀有戒指：名字+基底、Implicits 计数、crafted 词缀", () => {
    const p = parseItemText(itemTextByName(importCode, "Storm Circle"));
    assert.equal(p.rarity, "Rare");
    assert.equal(p.name, "Storm Circle");
    assert.equal(p.baseType, "Two-Stone Ring");
    assert.equal(p.itemLevel, 83);
    assert.equal(p.implicitsCount, 1);
    assert.ok(p.implicitMods.includes("+16% to Fire and Lightning Resistances"));
    assert.equal(p.explicitMods.length, 3);
    assert.ok(p.craftMods.includes("+54 to maximum Life"));
  });

  it("唯一装备：名字与基底", () => {
    const p = parseItemText(itemTextByName(importCode, "Inpulsa's Broken Heart"));
    assert.equal(p.rarity, "Unique");
    assert.equal(p.name, "Inpulsa's Broken Heart");
    assert.ok(p.baseType, "应有基底类型");
  });

  it("稀有珠宝（cluster jewel）：crafted 词缀与 Implicits 归位", () => {
    const p = parseItemText(itemTextByName(realPobb, "Maelstrom Creed"));
    assert.equal(p.rarity, "Rare");
    assert.ok((p.baseType ?? "").includes("Cluster Jewel"));
    assert.ok(p.craftMods.length > 0, "cluster jewel 应有 crafted 词缀");
  });

  it("魔法物品（Magic）：从显示名提取基底，词缀不误当基底", () => {
    const p = parseItemText(itemTextByName(realPobb, "Quicksilver Flask of Incision"));
    assert.equal(p.rarity, "Magic");
    assert.equal(p.baseType, "Quicksilver Flask");
    assert.ok(!(p.baseType ?? "").includes("chance to gain"), "词缀文本不应被当作基底");
    assert.ok(p.explicitMods.length > 0, "词缀应正常解析");
  });

  it("腐化标记识别", () => {
    const b = parseBuildXml(importCode);
    const hasCorruptedLine = b.items.some((i) =>
      i.rawText.split(/\r?\n/).some((l) => l.trim() === "Corrupted"),
    );
    if (hasCorruptedLine) {
      const corrupted = b.items.filter((i) => parseItemText(i.rawText).corrupted);
      assert.ok(corrupted.length > 0, "应识别出腐化物品");
    }
  });
});

describe("parseItemText — 游戏内 Ctrl+C 格式", () => {
  const inGame = `Item Class: Body Armours
Rarity: Rare
Vaal Regalia
--------
Quality: +20% (augmented)
Armour: 512 (augmented)
Energy Shield: 103 (augmented)
--------
+1 to Level of all Socketed Gems (implicit)
--------
+90 to maximum Life
+40% to Fire Resistance
+30% to Lightning Resistance
--------
Corrupted`;

  it("分区解析 implicit/explicit，属性段被丢弃", () => {
    const p = parseItemText(inGame);
    assert.equal(p.rarity, "Rare");
    assert.equal(p.baseType, "Vaal Regalia");
    assert.equal(p.itemClass, "Body Armours");
    assert.equal(p.quality, 20);
    assert.equal(p.corrupted, true);
    assert.ok(p.implicitMods.includes("+1 to Level of all Socketed Gems (implicit)"));
    assert.ok(p.explicitMods.includes("+90 to maximum Life"));
    assert.ok(!p.explicitMods.includes("Quality: +20% (augmented)"));
    assert.equal(p.otherMods.length, 0);
  });
});