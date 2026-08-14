import type { ParsedItem, Rarity } from "./types.js";

const RARITY_MAP: Record<string, Rarity> = {
  NORMAL: "Normal",
  MAGIC: "Magic",
  RARE: "Rare",
  UNIQUE: "Unique",
  GEM: "Gem",
  CURRENCY: "Currency",
  "DIVINATION CARD": "Divination Card",
  RELIC: "Relic",
};

const INFLUENCE_RE = /^(Elder|Shaper|Crusader|Hunter|Redeemer|Warlord|Searing Exarch|Eater of Worlds) Item$/i;
const SEPARATOR_RE = /^-{4,}$/;

function normalizeRarity(s: string): Rarity {
  return RARITY_MAP[s.trim().toUpperCase()] ?? "Unknown";
}

/**
 * 解析物品文本 → 结构化对象。
 *
 * 兼容两种来源：
 * 1. POB 导出格式（主要）：Rarity: RARE / Unique ID / Item Level / LevelReq / Implicits: N /
 *    {crafted} 标记 / 词缀行（无 "--------" 分隔线）。
 * 2. 游戏内 Ctrl+C 格式（辅助）：Item Class: / Rarity: Rare / "--------" 分隔线 / Sockets / Requirements。
 */
export function parseItemText(rawText: string): ParsedItem {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const item: ParsedItem = {
    rawText,
    rarity: "Unknown",
    corrupted: false,
    mirrored: false,
    unidentified: false,
    fractured: false,
    synthesised: false,
    implicitMods: [],
    explicitMods: [],
    craftMods: [],
    fracturedMods: [],
    synthesizedMods: [],
    enchantMods: [],
    otherMods: [],
  };

  // ---- 第一遍：定位 Item Class 与 Rarity ----
  let rarityIdx = -1;
  let classIdx = -1;
  let nameLineIdx = -1;
  let baseLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^Item Class:\s*(.+)$/i);
    if (m) {
      item.itemClass = m[1].trim();
      classIdx = i;
    }
    if (rarityIdx < 0 && /^Rarity:\s*(.+)$/i.test(lines[i])) rarityIdx = i;
  }

  // ---- 第二遍：按行解析字段 ----
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === rarityIdx) {
      item.rarity = normalizeRarity(line.replace(/^Rarity:\s*/i, ""));
      // 名字/基底：紧跟在 Rarity 之后的 1~2 行
      // POB 导出格式（含 Unique ID/LevelReq 行）：Rare 也有"生成名 + 基底"两行；
      // 游戏内格式（含 Item Class/分隔线）：Rare/Normal 只有基底一行。
      const next = nextMeaningful(lines, i + 1);
      if (next !== null && !isMetaLine(lines[next])) {
        if (item.rarity === "Unique" || item.rarity === "Magic" || (item.rarity === "Rare" && isPobFormat(rawText))) {
          item.name = lines[next];
          nameLineIdx = next;
          const base = nextMeaningful(lines, next + 1);
          if (base !== null && !isMetaLine(lines[base])) {
            item.baseType = lines[base];
            baseLineIdx = base;
          }
        } else {
          item.baseType = lines[next];
          baseLineIdx = next;
        }
      }
      continue;
    }
    if (i === classIdx || i === nameLineIdx || i === baseLineIdx) continue;

    if (/^Item Level:\s*(\d+)/i.test(line)) item.itemLevel = parseInt(line.match(/\d+/)?.[0] ?? "0", 10);
    else if (/^LevelReq:\s*(\d+)/i.test(line)) item.levelReq = parseInt(line.match(/\d+/)?.[0] ?? "0", 10);
    else if (/^Quality:\s*\+?(\d+)%/i.test(line)) item.quality = parseInt(line.match(/\d+/)?.[0] ?? "0", 10);
    else if (/^Sockets:\s*(.+)$/i.test(line)) {
      item.sockets = line.replace(/^Sockets:\s*/i, "").trim();
      item.socketCount = (item.sockets.match(/[RGBW]/gi) ?? []).length;
    } else if (/^Implicits:\s*(\d+)/i.test(line)) {
      item.implicitsCount = parseInt(line.match(/\d+/)?.[0] ?? "0", 10);
    } else if (/^Unique ID:\s*(\S+)/i.test(line)) {
      item.uniqueId = line.replace(/^Unique ID:\s*/i, "").trim();
    } else if (line === "Corrupted") item.corrupted = true;
    else if (line === "Mirrored") item.mirrored = true;
    else if (line === "Unidentified") item.unidentified = true;
    else if (line === "Fractured Item") item.fractured = true;
    else if (line === "Synthesised Item") item.synthesised = true;
    else if (INFLUENCE_RE.test(line)) item.influence = line.replace(/ Item$/, "");
    else if (line.startsWith("{crafted}")) item.craftMods.push(line.slice("{crafted}".length).trim());
    else if (line.startsWith("{fractured}")) item.fracturedMods.push(line.slice("{fractured}".length).trim());
    else if (line.startsWith("{synthesised}")) item.synthesizedMods.push(line.slice("{synthesised}".length).trim());
    else if (line.startsWith("{enchant}")) item.enchantMods.push(line.slice("{enchant}".length).trim());
    else if (line.startsWith("{implicit}")) item.implicitMods.push(line.slice("{implicit}".length).trim());
    else if (SEPARATOR_RE.test(line)) {
      /* 分隔线：跳过，下面按段归位 */
    } else item.otherMods.push(line);
  }

  // ---- 第三遍：段分割（游戏内格式）或 Implicits 计数（POB 格式）归位 ----
  const separators: number[] = [];
  lines.forEach((l, i) => {
    if (SEPARATOR_RE.test(l)) separators.push(i);
  });

  if (separators.length >= 2) {
    // 游戏内格式：段1=属性/需求（丢弃），段2=implicit，段3=explicit，段4+=crafted/其他
    const seg = (from: number, to: number) =>
      lines
        .slice(from, to)
        .filter((l) => !isMetaLine(l) && !SEPARATOR_RE.test(l));
    const s1 = separators[1];
    const s2 = separators[2];
    const s3 = separators[3];
    item.implicitMods.push(...seg(s1 + 1, s2 ?? lines.length));
    item.explicitMods.push(...seg((s2 ?? s1) + 1, s3 ?? lines.length));
    item.otherMods = []; // 属性/需求段已丢弃（Quality/Sockets/ILv 已解析为字段）
  } else if (item.implicitsCount !== undefined && item.otherMods.length >= item.implicitsCount) {
    const n = item.implicitsCount;
    item.implicitMods.push(...item.otherMods.slice(0, n));
    item.explicitMods.push(...item.otherMods.slice(n));
    item.otherMods = [];
  } else {
    item.explicitMods.push(...item.otherMods);
    item.otherMods = [];
  }

  return item;
}

/** POB 导出格式标记：含 Unique ID / LevelReq 行（区别于游戏内 Ctrl+C 文本） */
function isPobFormat(rawText: string): boolean {
  return /^Unique ID:\s*\S+/m.test(rawText) || /^LevelReq:\s*\d+/m.test(rawText);
}

/** 从 idx 开始找下一个有意义（非元信息、非分隔线）的行 */
function nextMeaningful(lines: string[], idx: number): number | null {
  for (let i = idx; i < lines.length; i++) {
    if (!isMetaLine(lines[i]) && !SEPARATOR_RE.test(lines[i])) return i;
  }
  return null;
}

/** 元信息行（字段类），不能当作物品名 */
function isMetaLine(line: string): boolean {
  return /^(Item Class|Rarity|Item Level|LevelReq|Quality|Sockets|Implicits|Unique ID|Requirements):/i.test(line) ||
    /^(Corrupted|Mirrored|Unidentified|Fractured Item|Synthesised Item|Elder Item|Shaper Item|Crusader Item|Hunter Item|Redeemer Item|Warlord Item|Searing Exarch Item|Eater of Worlds Item)$/i.test(line) ||
    /^\{crafted\}/.test(line) ||
    /^\{fractured\}/.test(line) ||
    /^\{synthesised\}/.test(line) ||
    /^\{enchant\}/.test(line) ||
    /^\{implicit\}/.test(line);
}