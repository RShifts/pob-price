// 生成 英文词缀文本→中文 映射表（词缀翻译）
// 数据源: PoeCharm（国服客户端官方汉化）Data/Translate/zh-rCN/
//   - Query_Mod.csv: 常用交易词缀（优先级高，格式 # 占位）
//   - statDescriptions.csv: 全量词缀描述（{0}/{1} 占位）
// 用法: node tools/generate-mod-cn.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW = join(ROOT, "research", "raw");
const OUT = join(ROOT, "src", "trade", "data", "en-cn-mods.ts");

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "pob-price/0.5" }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i+1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some(f => f !== "")) rows.push(row); }
  return rows;
}

// 归一化：{0}/{1} 或 # 统一替换为 #（用于匹配物品词缀文本，数字已归一）
function normalize(en) { return en.replace(/\{\d+\}/g, "#").trim(); }

async function main() {
  mkdirSync(RAW, { recursive: true });
  const files = ["Query_Mod.csv", "statDescriptions.csv"];
  for (const f of files) {
    const file = join(RAW, f);
    if (!existsSync(file) || (await readFileSync(file, "utf8")).trim().length === 0) {
      writeFileSync(file, await fetchText("https://cdn.jsdelivr.net/gh/Chuanhsing/PoeCharm@main/Data/Translate/zh-rCN/" + f));
      console.log("已下载:", f);
    }
  }

  const map = new Map(); // key(归一化英文) -> cn
  // 1) Query_Mod 优先（精炼的交易词缀翻译）
  for (const [en, cn] of parseCsv(readFileSync(join(RAW, "Query_Mod.csv"), "utf8"))) {
    const key = normalize(en);
    if (key && cn) map.set(key, cn);
  }
  console.log("Query_Mod 词条:", map.size);
  // 2) statDescriptions 全量补充
  let sdCount = 0;
  for (const [en, cn] of parseCsv(readFileSync(join(RAW, "statDescriptions.csv"), "utf8"))) {
    const key = normalize(en);
    if (key && cn && !map.has(key)) { map.set(key, cn); sdCount++; }
  }
  console.log("statDescriptions 补充:", sdCount, "总计:", map.size);

  const entries = [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  const lines = [
    "// 自动生成：英文词缀文本→中文 映射表",
    "// 来源: PoeCharm（国服客户端官方汉化）Query_Mod.csv + statDescriptions.csv",
    "// 键为归一化英文模式（数字替换为 #）；值为中文模板（{0}/{1} 占位符）",
    "// 重新生成: node tools/generate-mod-cn.mjs",
    "export const MOD_CN_MAP: ReadonlyMap<string, string> = new Map([",
  ];
  for (const [k, v] of entries) {
    lines.push("  [" + JSON.stringify(k) + ", " + JSON.stringify(v) + "],");
  }
  lines.push("]);");
  lines.push("");
  writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log("已生成:", OUT, Buffer.byteLength(lines.join("\n"), "utf8"), "bytes");
}

main().catch((e) => { console.error(e); process.exit(1); });