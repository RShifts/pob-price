import { readFile } from "node:fs/promises";
import { decodePobCode, looksLikePobCode } from "./pob/codec.js";
import { fetchAndDecode, isPobbUrl } from "./pob/link.js";
import type { RawBuild, RawItemSlot } from "./pob/types.js";

/** 把输入（POB Code / pobb.in 链接 / 本地 .code/.xml/.build 文件）解析为构建 XML。 */
export async function resolveInputToXml(input: string): Promise<{ xml: string; source: string }> {
  const trimmed = input.trim();
  if (looksLikePobCode(trimmed)) {
    return { xml: decodePobCode(trimmed), source: "code" };
  }
  if (/^https?:\/\//i.test(trimmed) || isPobbUrl(trimmed)) {
    return { xml: await fetchAndDecode(trimmed), source: "url:" + trimmed };
  }
  const content = await readFile(trimmed, "utf8").catch(() => {
    throw new Error(`无法识别输入，也不是可读取的文件: ${trimmed}`);
  });
  const s = content.trim();
  if (s.startsWith("<?xml") || s.startsWith("<PathOfBuilding") || s.startsWith("<Build")) {
    return { xml: content, source: "file:" + trimmed };
  }
  if (looksLikePobCode(s)) return { xml: decodePobCode(s), source: "file:" + trimmed };
  throw new Error(`文件内容无法识别: ${trimmed}`);
}

/** 从构建里选一件物品：按 id / 序号 / 名称片段匹配。 */
export function selectItem(build: RawBuild, selector: string | undefined): RawItemSlot {
  if (!selector) {
    if (build.items.length === 1) return build.items[0];
    throw new Error(`构建有 ${build.items.length} 件装备，请用 --item 指定（id / 序号 / 名称片段），或 --item-text 直接给物品文本`);
  }
  const byId = build.items.find((i) => i.id === selector);
  if (byId) return byId;
  const byIndex = build.items[Number(selector) - 1];
  if (byIndex) return byIndex;
  const byName = build.items.find((i) => i.rawText.includes(selector));
  if (byName) return byName;
  throw new Error(`找不到匹配 "${selector}" 的物品`);
}
