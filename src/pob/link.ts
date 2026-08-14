import { decodePobCode, looksLikePobCode } from "./codec.js";

export interface PobbUrl {
  id: string;
  rawUrl: string;
  isUserUrl: boolean;
}

const POBB_RE =
  /(?:https?:\/\/)?(?:www\.)?pobb\.in\/(?:u\/([A-Za-z0-9_-]+)\/)?([A-Za-z0-9_-]{3,})(?:\/raw)?/i;

/** 解析 pobb.in 链接（支持标准 / 用户主页 / raw 后缀形式），非 pobb.in 输入返回 null。 */
export function parsePobbUrl(input: string): PobbUrl | null {
  const m = input.trim().match(POBB_RE);
  if (!m) return null;
  const user = m[1] ?? "";
  const id = m[2];
  return {
    id,
    rawUrl: `https://pobb.in/${user ? user + "/" : ""}${id}/raw`,
    isUserUrl: !!user,
  };
}

export function isPobbUrl(input: string): boolean {
  return POBB_RE.test(input.trim());
}

const UA = "pob-price/0.1 (local POB price checker)";

/** 从 pobb.in 拉取原始 POB Code（优先 /raw 端点，回退页面内嵌 code）。 */
export async function fetchRawCode(urlOrId: string): Promise<string> {
  const parsed = parsePobbUrl(urlOrId);
  const target = parsed ? parsed.rawUrl : urlOrId.trim();
  const res = await fetch(target, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error("pobb.in 拉取失败: HTTP " + res.status + " (" + target + ")");
  }
  const text = (await res.text()).trim();
  if (looksLikePobCode(text)) return text;
  // 兜底：从 HTML 页面里找长 base64 片段（textarea / input 内嵌 code）
  const m = text.match(/[A-Za-z0-9_\-+/]{100,}/);
  if (m) return m[0];
  throw new Error(`在 ${target} 未找到 POB Code`);
}

/** 拉取并解码 pobb.in 链接 → 构建 XML。 */
export async function fetchAndDecode(urlOrId: string): Promise<string> {
  return decodePobCode(await fetchRawCode(urlOrId));
}
