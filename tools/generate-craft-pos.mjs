// 生成 工艺词缀文本→前后缀 映射表
// 数据源: PathOfBuildingCommunity/PathOfBuilding dev/src/Data/ModMaster.lua（工艺台词缀库）
// 键为归一化英文词缀文本（数字范围/值 → #）；值为 Prefix/Suffix
// 用法: node tools/generate-craft-pos.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW = join(ROOT, "research", "raw");
const OUT = join(ROOT, "src", "trade", "data", "craft-pos.ts");
const SRC = join(RAW, "ModMaster.lua");

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "pob-price/0.5" }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.text();
}

function norm(text) {
  return text
    .toLowerCase()
    .replace(/\(?(\d+[\-–\d,.]*)\)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  if (!existsSync(SRC)) {
    writeFileSync(SRC, await fetchText("https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/Data/ModMaster.lua"));
    console.log("已下载 ModMaster.lua");
  }
  const t = readFileSync(SRC, "utf8");
  const map = new Map();
  let rows = 0;
  for (const line of t.split("\n")) {
    const tm = line.match(/type = "([^"]+)"/);
    if (!tm) continue;
    const after = line.slice(line.indexOf("},") + 2);
    const tm2 = after.match(/"([^"]+)"/);
    if (!tm2) continue;
    rows++;
    const key = norm(tm2[1]);
    if (key && !map.has(key)) map.set(key, tm[1] === "Prefix" ? "prefix" : "suffix");
  }
  console.log("ModMaster 词条:", rows, "| 唯一模式:", map.size);

  const entries = [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  const lines = [
    "// 自动生成：工艺词缀文本→前后缀 映射（Prefix/Suffix）",
    "// 来源: PathOfBuildingCommunity/PathOfBuilding ModMaster.lua（工艺台词缀库）",
    "// 键为归一化英文词缀文本（数字→#）；值 \"prefix\" 或 \"suffix\"",
    "// 重新生成: node tools/generate-craft-pos.mjs",
    "export const CRAFT_POS: ReadonlyMap<string, \"prefix\" | \"suffix\"> = new Map([",
  ];
  for (const [k, v] of entries) lines.push("  [" + JSON.stringify(k) + ", " + JSON.stringify(v) + "],");
  lines.push("]);");
  lines.push("");
  writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log("已生成:", OUT, Buffer.byteLength(lines.join("\n"), "utf8"), "bytes");
}

main().catch((e) => { console.error(e); process.exit(1); });