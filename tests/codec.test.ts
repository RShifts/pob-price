import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodePobCode, encodePobXml, looksLikePobCode } from "../src/pob/codec.js";

const FIXTURES = ["real-pobb.in", "import_code", "test_code"];

describe("codec", () => {
  for (const name of FIXTURES) {
    it(`解码真实 POB Code: ${name}`, () => {
      const code = readFileSync(`tests/fixtures/${name}.code`, "utf8").trim();
      const xml = decodePobCode(code);
      assert.ok(xml.startsWith("<?xml") || xml.startsWith("<PathOfBuilding"), "应以 XML 声明开头");
      assert.ok(xml.includes("<PathOfBuilding>"), "应包含 <PathOfBuilding>");
      assert.ok(xml.includes("<Build "), "应包含 <Build");
    });
  }

  it("编码→解码 往返一致", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="95" className="Ranger" ascendClassName="Deadeye">
    <Items><Item id="1">Rarity: UNIQUE</Item></Items>
  </Build>
</PathOfBuilding>`;
    const code = encodePobXml(xml);
    assert.ok(!/[+/=]/.test(code), "编码应为 URL-safe 无 padding");
    assert.equal(decodePobCode(code), xml);
  });

  it("兼容标准 base64 与带 padding 输入", () => {
    // "hello world" 的 zlib deflate + 标准 base64（来自 pob-parser 文档）
    const standardB64 = "eJzLSM3JyVcozy/KSQEAGgsEXQ==";
    assert.equal(decodePobCode(standardB64), "hello world");
  });

  it("looksLikePobCode 启发式", () => {
    // 真实 POB Code 很长（数千字符）
    assert.equal(looksLikePobCode(readFileSync("tests/fixtures/real-pobb.in.code", "utf8").trim()), true);
    assert.equal(looksLikePobCode("eJzLSM3JyVcozy/KSQEAGgsEXQ=="), false); // 太短，按启发式不算
    assert.equal(looksLikePobCode("short"), false);
    assert.equal(looksLikePobCode("你好世界"), false);
  });
});