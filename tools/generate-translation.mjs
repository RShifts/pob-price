// 生成 英文→中文 名称映射（基底类型/唯一装/宝石/命运卡等）
// 数据源（按优先级）：
//   1. PoeCharm（汉化版 POB，官方国服客户端汉化）Data/Translate/zh-rCN/*.csv
//   2. DonkiChen/Awakened-PoE-Trade-Simplified-Chinese en/zh_CN items.ndjson（按 refName 连接）
// 用法: node tools/generate-translation.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const OUT = join(ROOT, "src", "trade", "data", "en-cn.ts");
const POECHARM_DIR = join(ROOT, "research", "poecharm");

const POECHARM_CSVS = [
  "Items_Accessories.txt.csv", "Items_Armour.txt.csv", "Items_Flasks.txt.csv",
  "Items_Gems.txt.csv", "Items_Jewels.txt.csv", "Items_Weapons.txt.csv",
  "Uniques.txt.csv", "Gems_data.txt.csv", "Items_Gems.csv",
];

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "pob-price/0.5" }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.text();
}

/** 解析 PoeCharm CSV："英文",中文 */
function parseCsvLine(line) {
  const m = line.match(/^"((?:[^"]|"")*)"\s*,\s*(.*)$/);
  if (!m) return null;
  return [m[1].replace(/""/g, '"').trim(), m[2].trim()];
}

async function main() {
  const map = new Map();

  // 1) PoeCharm 官方汉化（本地 CSV）
  let pcCount = 0;
  for (const f of POECHARM_CSVS) {
    const file = join(POECHARM_DIR, f);
    if (!existsSync(file)) { console.log("跳过（无文件）:", f); continue; }
    const text = readFileSync(file, "utf8").replaceAll(CR, "");
    for (const line of text.split(LF)) {
      if (!line.trim()) continue;
      const pair = parseCsvLine(line);
      if (pair && pair[0] && pair[1]) { map.set(pair[0], pair[1]); pcCount++; }
    }
  }
  console.log("PoeCharm 词条:", pcCount);

  // 2) Awakened en/zh items.ndjson（按 refName 连接，作为补充）
  let awCount = 0;
  try {
    const dir = join(ROOT, "research");
    mkdirSync(dir, { recursive: true });
    const enFile = join(dir, "en-items.ndjson");
    const zhFile = join(dir, "zh-items.ndjson");
    if (!existsSync(enFile)) writeFileSync(enFile, await fetchText("https://cdn.jsdelivr.net/gh/DonkiChen/Awakened-PoE-Trade-Simplified-Chinese@master/renderer/public/data/en/items.ndjson"));
    if (!existsSync(zhFile)) writeFileSync(zhFile, await fetchText("https://cdn.jsdelivr.net/gh/DonkiChen/Awakened-PoE-Trade-Simplified-Chinese@master/renderer/public/data/zh_CN/items.ndjson"));
    const en = new Map();
    for (const line of readFileSync(enFile, "utf8").replaceAll(CR, "").split(LF)) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.refName) en.set(j.refName, j);
    }
    const zh = new Map();
    for (const line of readFileSync(zhFile, "utf8").replaceAll(CR, "").split(LF)) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.refName) zh.set(j.refName, j);
    }
    for (const [ref, e] of en) {
      const cn = zh.get(ref)?.name;
      if (!cn) continue;
      if (!map.has(e.name ?? ref)) { map.set(e.name ?? ref, cn); awCount++; }
      if (e.name && e.name !== ref && !map.has(ref)) { map.set(ref, cn); awCount++; }
    }
  } catch (e) {
    console.log("Awakened 数据补充失败（已用 PoeCharm 数据）:", e.message);
  }
  console.log("Awakened 补充词条:", awCount);

  // 3) 写出
  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted.map(([k, v]) => JSON.stringify(k) + ": " + JSON.stringify(v)).join("," + LF + "  ");
  const content =
    "// 自动生成：英文→中文 名称映射（基底类型/唯一装/宝石/命运卡等）" + LF +
    "// 来源: PoeCharm（官方国服客户端汉化）+ DonkiChen/Awakened-PoE-Trade-Simplified-Chinese（补充）" + LF +
    "// 共 " + sorted.length + " 条。" + LF +
    "// 重新生成: node tools/generate-translation.mjs" + LF +
    "export const EN_CN_NAMES: Record<string, string> = {" + LF +
    "  " + body + "," + LF +
    "};" + LF;
  writeFileSync(OUT, content);
  console.log("生成完成:", sorted.length, "条 ->", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
