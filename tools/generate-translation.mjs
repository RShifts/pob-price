// 从 DonkiChen/Awakened-PoE-Trade-Simplified-Chinese 仓库的 en/zh_CN items.ndjson
// 按 refName 连接生成 英文→中文 名称映射，输出为 TS 源码（运行时零外部依赖）。
// 用法: node tools/generate-translation.mjs [en.ndjson] [zh.ndjson]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

const EN_FILE = process.argv[2] ?? join(ROOT, "research", "en-items.ndjson");
const ZH_FILE = process.argv[3] ?? join(ROOT, "research", "zh-items.ndjson");
const OUT = join(ROOT, "src", "trade", "data", "en-cn.ts");

function parse(file) {
  const map = new Map();
  const text = readFileSync(file, "utf8").replaceAll(CR, "");
  for (const line of text.split(LF)) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    if (!j.refName) continue;
    map.set(j.refName, j);
  }
  return map;
}

const en = parse(EN_FILE);
const zh = parse(ZH_FILE);

const out = new Map();
let joined = 0;
for (const [ref, e] of en) {
  const cnName = zh.get(ref)?.name;
  if (!cnName) continue;
  joined++;
  out.set(e.name ?? ref, cnName);
  if (e.name && e.name !== ref) out.set(ref, cnName);
}

const sorted = [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const body = sorted
  .map(([k, v]) => JSON.stringify(k) + ": " + JSON.stringify(v))
  .join("," + LF + "  ");
const content =
  "// 自动生成：英文→中文 名称映射（基底类型/唯一装/宝石/命运卡等）" + LF +
  "// 来源: DonkiChen/Awakened-PoE-Trade-Simplified-Chinese (en/zh_CN items.ndjson, 按 refName 连接)" + LF +
  "// 共 " + sorted.length + " 条（" + en.size + " 个英文条目中 " + joined + " 条命中中文）。" + LF +
  "// 重新生成: node tools/generate-translation.mjs" + LF +
  "export const EN_CN_NAMES: Record<string, string> = {" + LF +
  "  " + body + "," + LF +
  "};" + LF;

writeFileSync(OUT, content);
console.log("joined:", joined, "/", en.size, "| map entries:", sorted.length, "| written:", OUT);
