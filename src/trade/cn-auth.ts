import { DEFAULT_UA } from "./data.js";

export interface CnTokenPair {
  accessToken: string;
  refreshToken: string;
}

export const CN_OAUTH_TOKEN_URL = "https://poe.game.qq.com/oauth/token";

/**
 * 用国服 OAuth 刷新令牌换 access token。
 * 国服市集 API 需要 Authorization: DPoP <access_token> 头（访问令牌由 OAuth 签发，
 * 与 POETOKEN cookie 不同）。令牌通过 /oauth/token 的 internal:refresh 流程获取。
 */
export async function refreshCnAccessToken(cookie: string, refreshToken: string): Promise<CnTokenPair> {
  const body = new URLSearchParams({
    client_id: "internal",
    grant_type: "internal:refresh",
    refresh_token: refreshToken,
  });
  const res = await fetch(CN_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "User-Agent": DEFAULT_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Origin: "https://poe.game.qq.com",
      Referer: "https://poe.game.qq.com/trade",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`国服令牌刷新失败 HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!j.access_token) throw new Error("国服令牌刷新响应缺少 access_token");
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? refreshToken };
}

/** 从 JWT 里读 exp（秒），用于 access token 缓存 TTL。 */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8"));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}
