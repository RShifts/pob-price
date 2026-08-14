import type {
  BuildInfo,
  ParsedGem,
  RawBuild,
  RawItemSlot,
  RawJewel,
  RawSkill,
  TreeSocket,
  TreeSpec,
} from "./types.js";

/* ---------- XML 基础工具 ---------- */

/** 解码 XML 实体。 */
export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)));
}

/** 编码 XML 实体（测试/再导出用）。 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 从标签文本提取属性（支持 "key=value"）。 */
export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

/** 取 <name ...> 与 </name> 之间的内容；找不到返回 null。 */
function tagContent(xml: string, name: string): string | null {
  const openRe = new RegExp("<" + name + "[^>]*>");
  const m = xml.match(openRe);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  const end = xml.indexOf("</" + name + ">", start);
  if (end < 0) return null;
  return xml.slice(start, end);
}

/**
 * 取某分区内容：优先从 <Build> 内找；找不到再从整个文档找。
 * 兼容两种真实导出格式：新版把 <Items>/<Tree> 等嵌套在 <Build> 内，
 * 老版本（如 PathOfBuildingAPI 时代的导出）它们与 <Build> 平级。
 */
function sectionContent(root: string, build: string, name: string): string | null {
  const inner = tagContent(build, name);
  if (inner !== null) return inner;
  return tagContent(root, name);
}

/** 迭代某个容器内的同名子标签（含属性与内容，支持自闭合，如 <Gem .../>）。 */
function* iterTags(
  inner: string,
  name: string,
): Generator<{ attrs: Record<string, string>; content: string }> {
  const openRe = new RegExp("<" + name + "\\b([^>]*?)(/?)>", "g");
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(inner)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (m[2] === "/") {
      yield { attrs, content: "" }; // 自闭合标签
      continue;
    }
    const closeTag = "</" + name + ">";
    const closeIdx = inner.indexOf(closeTag, m.index + m[0].length);
    if (closeIdx < 0) break; // 未闭合，停止
    yield { attrs, content: unescapeXml(inner.slice(m.index + m[0].length, closeIdx)) };
    openRe.lastIndex = closeIdx + closeTag.length; // 跳过闭合标签
  }
}

/**
 * 清理 <Item> 内容里的原始物品文本：
 * 去掉 <ModRange .../> 等 XML 标签、解码实体、去掉空白行。
 */
function cleanItemText(content: string): string {
  return content
    .replace(/<[^>]*>/g, "\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

/* ---------- 构建解析 ---------- */

function parseBuildInfo(build: string): BuildInfo {
  const tag = build.match(/<Build\b[^>]*>/)?.[0] ?? "";
  const attrs = parseAttributes(tag);
  const info: BuildInfo = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "level") info.level = parseInt(v, 10);
    else if (/^(nil|true|false)$/.test(v)) info[k] = v === "true";
    else info[k] = v;
  }
  return info;
}

function parseItems(root: string, build: string): RawItemSlot[] {
  const items: RawItemSlot[] = [];
  const inner = sectionContent(root, build, "Items");
  if (!inner) return items;
  for (const { attrs, content } of iterTags(inner, "Item")) {
    const text = cleanItemText(content);
    if (!text) continue; // 空物品跳过
    items.push({ id: attrs.id ?? String(items.length + 1), rawText: text, attrs });
  }
  return items;
}

function parseJewels(root: string, build: string): RawJewel[] {
  const jewels: RawJewel[] = [];
  const inner = sectionContent(root, build, "Jewels");
  if (!inner) return jewels;
  for (const { attrs, content } of iterTags(inner, "Jewel")) {
    // 老版本 <Jewel nodeId="..."> 内可能再包一层 <Item>
    const itemInner = tagContent(content, "Item");
    const text = cleanItemText(itemInner ?? content);
    if (!text) continue;
    jewels.push({ nodeId: attrs.nodeId ?? "", rawText: text });
  }
  return jewels;
}

function parseSkills(root: string, build: string): RawSkill[] {
  const skills: RawSkill[] = [];
  const inner = sectionContent(root, build, "Skills");
  if (!inner) return skills;
  for (const { attrs, content } of iterTags(inner, "Skill")) {
    const gems: ParsedGem[] = [];
    for (const { attrs: g } of iterTags(content, "Gem")) {
      gems.push({
        gemId: g.gemId ?? "",
        name: g.nameSpec ? unescapeXml(g.nameSpec) : undefined,
        skillId: g.skillId,
        level: parseInt(g.level ?? "0", 10) || 0,
        quality: parseInt(g.quality ?? "0", 10) || 0,
        qualityId: g.qualityId,
        enabled: g.enabled !== "false",
      });
    }
    skills.push({
      slot: attrs.slot,
      label: attrs.label ? unescapeXml(attrs.label) : undefined,
      mainActiveSkill: attrs.mainActiveSkill === "1",
      gems,
    });
  }
  return skills;
}

function parseTree(root: string, build: string): TreeSpec | undefined {
  const treeInner = sectionContent(root, build, "Tree");
  if (!treeInner) return undefined;
  const specInner = tagContent(treeInner, "Spec");
  if (!specInner) return undefined;
  const specTag = treeInner.match(/<Spec\b[^>]*>/)?.[0] ?? "";
  const attrs = parseAttributes(specTag);
  const nodes = attrs.nodes ? attrs.nodes.split(",").filter(Boolean) : [];
  const nodesComplete = attrs.nodes !== undefined;
  const urlInner = tagContent(specInner, "URL");
  const url = urlInner ? urlInner.trim() : undefined;

  const sockets: TreeSocket[] = [];
  const socketsInner = tagContent(specInner, "Sockets");
  if (socketsInner) {
    const socketRe = /<Socket\b([^>]*?)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = socketRe.exec(socketsInner)) !== null) {
      const a = parseAttributes(m[1]);
      if (a.nodeId || a.itemId) sockets.push({ nodeId: a.nodeId, itemId: a.itemId });
    }
  }
  // 老格式无 nodes 属性（节点编码在天赋 URL 里）：退化为插槽节点（部分）
  if (nodes.length === 0 && sockets.length > 0) {
    for (const s of sockets) nodes.push(s.nodeId);
  }
  return { nodes, url, sockets, attrs, nodesComplete };
}

/** 解析 POB 构建 XML → 结构化原始数据。 */
export function parseBuildXml(xml: string): RawBuild {
  const root = xml.trim();
  const build = tagContent(root, "Build") ?? root;
  // <Build> 开标签只存在于根文档（build 变量为标签内部内容）
  const info = parseBuildInfo(root);
  const items = parseItems(root, build);
  const jewels = parseJewels(root, build);
  const skills = parseSkills(root, build);
  const tree = parseTree(root, build);
  return { xml: root, info, items, jewels, skills, tree };
}