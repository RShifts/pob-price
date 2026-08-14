import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBuildXml } from "../src/pob/xml.js";
import { looksLikePobCode, decodePobCode } from "../src/pob/codec.js";

const real = readFileSync("tests/fixtures/real-pobb.in.xml", "utf8");
const importCode = readFileSync("tests/fixtures/import_code.xml", "utf8");
const testCode = readFileSync("tests/fixtures/test_code.xml", "utf8");

describe("parseBuildXml — 真实构建", () => {
  it("real-pobb.in（Ranger/Deadeye 95 级）", () => {
    const b = parseBuildXml(real);
    assert.equal(b.info.className, "Ranger");
    assert.equal(b.info.ascendClassName, "Deadeye");
    assert.equal(b.info.level, 95);
    assert.ok(b.items.length > 10, `装备数应>10，实际 ${b.items.length}`);
    assert.ok(b.skills.length > 0, "应有技能组");
    assert.ok(b.tree, "应有天赋树");
    assert.ok(b.tree!.nodes.length > 100, "天赋节点应>100");
    assert.ok(b.tree!.sockets.length > 0, "应有天赋珠宝插槽");
    for (const it of b.items) assert.ok(it.rawText.trim().length > 0, "物品文本不应为空");
  });

  it("import_code（Witch/Elementalist 100 级，21 件装备）", () => {
    const b = parseBuildXml(importCode);
    assert.equal(b.info.className, "Witch");
    assert.equal(b.info.ascendClassName, "Elementalist");
    assert.equal(b.items.length, 21);
    assert.equal(b.items[0].id, "1");
  });

  it("test_code（Scion/Ascendant 1 级，2 件装备）", () => {
    const b = parseBuildXml(testCode);
    assert.equal(b.info.className, "Scion");
    assert.equal(b.items.length, 2);
  });

  it("技能宝石：每个 gem 都有 Metadata 路径与等级", () => {
    const b = parseBuildXml(real);
    assert.ok(b.skills.length > 0, "应有技能组");
    const allGems = b.skills.flatMap((s) => s.gems);
    assert.ok(allGems.length > 0, `应有宝石，实际 ${allGems.length}`);
    for (const s of b.skills) {
      assert.ok(s.slot, "技能组应有槽位");
      for (const g of s.gems) {
        assert.match(g.gemId, /^Metadata\/Items\/Gems\//);
        assert.ok(g.level >= 1, `宝石等级应>=1，实际 ${g.level}`);
      }
    }
  });

  it("天赋珠宝插槽映射到已有物品", () => {
    const b = parseBuildXml(real);
    const ids = new Set(b.items.map((i) => i.id));
    for (const sock of b.tree!.sockets) {
      assert.ok(ids.has(sock.itemId), `itemId ${sock.itemId} 应在物品列表中`);
      assert.ok(sock.nodeId, "nodeId 不应为空");
    }
  });

  it("XML 实体正确解码（Warlord&apos;s Mark → Warlord's Mark）", () => {
    const b = parseBuildXml(importCode);
    const all = b.items.map((i) => i.rawText).join("\n");
    assert.ok(all.includes("Warlord's Mark"));
    assert.ok(!all.includes("&apos;"));
  });

  it("fixture 的 .code 与 .xml 解码一致", () => {
    for (const name of ["real-pobb.in", "import_code", "test_code"]) {
      const code = readFileSync(`tests/fixtures/${name}.code`, "utf8").trim();
      const xml = readFileSync(`tests/fixtures/${name}.xml`, "utf8");
      assert.equal(looksLikePobCode(code), true);
      const decoded = decodePobCode(code);
      assert.ok(decoded.replace(/\s+/g, " ").includes("<PathOfBuilding>"));
    }
  });
});