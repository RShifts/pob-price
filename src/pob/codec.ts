import { deflateSync, inflateRawSync, inflateSync } from "node:zlib";

const BASE64_CHARS = /^[A-Za-z0-9_\-+/=]+$/;

/** 粗略判断一段字符串是否像 POB Code（长 base64 字符串）。 */
export function looksLikePobCode(input: string): boolean {
  const s = input.trim();
  return s.length >= 40 && BASE64_CHARS.test(s) && /[A-Za-z0-9]/.test(s);
}

/** 把任意 base64 变体（标准/URL-safe、带/不带 padding）规范化为 Buffer。 */
export function base64ToBuffer(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/**
 * 解码 POB Code → 构建文本（XML）。
 *
 * POB Code = zlib deflate（带 zlib 头）压缩构建文本后，再做 URL-safe 无 padding 的 base64。
 * 已用真实样例（pobb.in、PathOfBuildingAPI fixtures）验证：inflate 成功而 inflateRaw 失败。
 * 为兼容个别旧工具产出的 raw deflate 变体，失败时回退 inflateRaw。
 */
export function decodePobCode(code: string): string {
  const buf = base64ToBuffer(code.trim());
  try {
    return inflateSync(buf).toString("utf8");
  } catch {
    return inflateRawSync(buf).toString("utf8");
  }
}

/** 把构建文本编码回 POB Code（URL-safe、无 padding），用于测试与再导出。 */
export function encodePobXml(xml: string): string {
  const deflated = deflateSync(Buffer.from(xml, "utf8"));
  return deflated
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
