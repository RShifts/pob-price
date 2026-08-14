import { DiskCache } from "./cache.js";
import { DEFAULT_UA } from "./data.js";
import { RateLimiter } from "./rate-limit.js";
import type { Listing, SearchResponse } from "./types.js";

/**
 * 官方市集 API 客户端：search + fetch。
 * - 调用间隔限流（RateLimiter，默认 2s）
 * - 429 限流处理：打印等待信息，Retry-After 超过 maxRateWaitMs 时快速失败并给出建议
 * - 搜索结果磁盘缓存（默认 5 分钟，可关闭）
 */
export interface TradeClientOptions {
  rateLimitMs?: number;
  cache?: DiskCache | null;
  /** 429 限流累计等待上限（默认 30s，超过则快速失败；批量可调大自动等待） */
  maxRateWaitMs?: number;
  /** 国服需要登录会话 Cookie（如 "POESESSID=..."），国际服不需要 */
  cookie?: string;
  /** 国服 OAuth access token（Authorization: DPoP <token>），由 --refresh-token 换取 */
  dpopToken?: string;
}

export class TradeClient {
  private limiter: RateLimiter;
  private cache: DiskCache | null;
  private host: string;
  private maxRateWaitMs: number;
  private cookie: string | undefined;
  private dpopToken: string | undefined;

  constructor(host = "https://www.pathofexile.com", opts: TradeClientOptions = {}) {
    this.host = host;
    this.limiter = new RateLimiter(opts.rateLimitMs ?? 2000);
    this.cache = opts.cache === undefined ? new DiskCache() : opts.cache;
    this.maxRateWaitMs = opts.maxRateWaitMs ?? 30_000;
    this.cookie = opts.cookie;
    this.dpopToken = opts.dpopToken;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let totalWait = 0;
    const isCn = this.host.includes("poe.game.qq.com");
    for (;;) {
      await this.limiter.wait();
      const res = await fetch(this.host + path, {
        ...init,
        headers: {
          "User-Agent": DEFAULT_UA,
          Accept: "application/json",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          // 国服腾讯风控要求（对齐 Awakened-PoE-Trade-Simplified-Chinese 的 doTencentRequest）
          ...(isCn ? { Origin: "https://poe.game.qq.com", Host: "poe.game.qq.com", "X-Requested-With": "XMLHttpRequest", Referer: "https://poe.game.qq.com/trade" } : {}),
          // DPoP access token 为可选（分叉不依赖；仅在显式提供时发送，避免无效令牌导致 401）
          ...(this.dpopToken ? { Authorization: "DPoP " + this.dpopToken } : {}),
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "3");
        const waitMs = Math.max(1000, retryAfter * 1000);
        totalWait += waitMs;
        const rateWaitSec = Math.round(this.maxRateWaitMs / 1000);
        if (totalWait > this.maxRateWaitMs) {
          throw new Error(
            `市集限流中（Retry-After ${retryAfter}s）。已累计等待 ${Math.round(totalWait / 1000)}s 超过上限 ${rateWaitSec}s，停止重试。` +
              `请稍等约 ${retryAfter} 秒后再试，或用 --rate-wait <毫秒> 调大自动等待上限。`,
          );
        }
        console.error(`市集限流中: 等待 ${retryAfter}s 后重试（累计 ${Math.round(totalWait / 1000)}s / 上限 ${rateWaitSec}s）...`);
        this.limiter.backoff(waitMs);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw new Error(`市集请求失败 HTTP ${res.status} (${path}): ${body}`);
      }
      return res;
    }
  }

  /** 提交搜索，返回 {id, total, result}。 */
  async search(league: string, query: unknown): Promise<SearchResponse> {
    const cacheKey = `trade:search:${league}:${JSON.stringify(query)}`;
    const cached = this.cache?.get<SearchResponse>(cacheKey);
    if (cached) return cached;
    const res = await this.request("/api/trade/search/" + encodeURIComponent(league), {
      method: "POST",
      body: JSON.stringify(query),
    });
    const data = (await res.json()) as SearchResponse;
    // 无结果也缓存，避免重复打空查询
    this.cache?.set(cacheKey, data, 5 * 60 * 1000);
    return data;
  }

  /** 按 id 列表拉取挂牌详情（一次最多 10 个）。 */
  async fetchListings(searchId: string, ids: string[]): Promise<Listing[]> {
    const out: Listing[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const res = await this.request(
        "/api/trade/fetch/" + batch.join(",") + "?query=" + encodeURIComponent(searchId),
        { method: "GET" },
      );
      const data = (await res.json()) as { result: Listing[] };
      out.push(...(data.result ?? []));
    }
    return out;
  }
}