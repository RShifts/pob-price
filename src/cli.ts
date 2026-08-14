#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseItemText } from "./item/parser.js";
import { resolveInputToXml as resolveXml, selectItem } from "./input.js";
import { displayName } from "./item/types.js";
import { fetchChaosConversion } from "./pricer/ninja.js";
import { decodePobCode, looksLikePobCode } from "./pob/codec.js";
import { fetchAndDecode, isPobbUrl } from "./pob/link.js";
import { parseBuildXml } from "./pob/xml.js";
import { renderBuildReport } from "./report/output.js";
import { itemsToCsv } from "./batch/csv.js";
import { BatchPriceEngine } from "./batch/engine.js";
import type { BatchItemResult } from "./batch/engine.js";
import { DiskCache } from "./trade/cache.js";
import { jwtExpiry, refreshCnAccessToken } from "./trade/cn-auth.js";
import { TradeClient } from "./trade/client.js";
import { TradeData } from "./trade/data.js";
import { aggregatePrices, toPriceSamples } from "./trade/price.js";
import { buildSearchQuery, tradeSearchUrl } from "./trade/query.js";
import { localizeItem, realmOf } from "./trade/realms.js";
import { StatMap } from "./trade/stats.js";
import type { ParsedItem } from "./item/types.js";
import type { RawBuild, RawItemSlot } from "./pob/types.js";

const USAGE = `
pob-price — POB 构建解析与市集查价工具

用法:
  pob-price parse <input> [--json] [--raw] [--items]
  pob-price price <input> [--item <id|序号|名称>] [--item-text <物品文本>]
                      [--league <联赛名>] [--mode loose|strict] [--limit <n>]
                      [--json] [--no-cache]

<input> 可以是:
  - POB Code 字符串（长 base64）
  - pobb.in 链接（如 https://pobb.in/eQVFNoqVZrza）
  - 本地文件路径（.build / .xml / .code 文件）

parse 选项:
  --json / --raw / --items   输出格式

price 选项:
  --item <id|序号|名称片段>   指定查价物品（构建有多件时必填）
  --item-text <文本>          直接给物品文本查价（跳过构建解析）
  --league <名称>             联赛，默认自动选当前挑战联赛
  --deviation <0-50>          匹配偏差百分比（默认 10）：词缀 min 值按此放宽，越大越宽松
  --limit <n>                 取前 n 个挂牌（默认 5）
  --delay <ms>                调用间最小间隔（默认 2000）
  --rate-wait <ms>            429 限流累计等待上限（默认 30000，超限快速失败）
  --server intl|cn            服务器：intl 国际服（默认）/ cn 国服
  --cookie "<Cookie>"         国服：登录 Cookie 即可（浏览器登录 poe.game.qq.com/trade 后 F12 复制）
  --refresh-token <token>     （可选）国服 OAuth 刷新令牌（localStorage __POEREFRESH），自动换 access token
  --dpop-token <token>        （可选）国服 access token（localStorage __POESESSION）
  （国际服固定只查"立即购买"（securable）挂牌；国服查全部）
  --no-cache                  禁用磁盘缓存
`;



function formatChaos(v: number | null): string {
  return v == null ? "-" : v.toFixed(1) + "c";
}

function renderPriceReport(args: {
  item: ParsedItem;
  league: string;
  mode: string;
  saleType: string;
  searchId: string;
  url: string;
  total: number;
  limit: number;
  summary: ReturnType<typeof aggregatePrices>;
}): string {
  const { item, league, mode, saleType, searchId, url, total, limit, summary } = args;
  const out: string[] = [];
  out.push("===== 单件查价 =====");
  out.push(`物品: ${displayName(item)} [${item.baseType ?? ""}]（${item.rarity}）`);
  out.push(`联赛: ${league} | 模式: ${mode} | 交易: ${saleType === "securable" ? "立即购买" : "全部"} | 搜索id: ${searchId}`);
  out.push(`集市链接: ${url}`);
  out.push(`匹配 ${total} 件，取前 ${Math.min(limit, summary.sampleCount, total || summary.sampleCount)}：`);
  summary.samples.forEach((s, i) => {
    const raw = `${s.amount} ${s.currency}`;
    const conv = s.chaosValue != null ? ` ≈${s.chaosValue.toFixed(1)}c` : "";
    const status = s.onlineStatus ? ` [${s.onlineStatus}]` : "";
    out.push(`  #${i + 1}  ${raw}${conv.padEnd(10)}  ${s.account}${status}`);
  });
  out.push(
    `\n统计（折合混沌）: 最低 ${formatChaos(summary.minChaos)} | 中位 ${formatChaos(summary.medianChaos)} | 均价 ${formatChaos(summary.avgChaos)}（${summary.count} 样本）`,
  );
  return out.join("\n");
}

/** 解析 Cookie：--cookie 直给，或 --cookie-file 从文件读取（避免 shell 对长 Cookie 的分号/引号问题）。 */
function resolveCookie(values: Record<string, unknown>): string | undefined {
  if (values.cookie) return values.cookie as string;
  const file = values["cookie-file"] as string | undefined;
  if (file) {
    if (!existsSync(file)) throw new Error(`Cookie 文件不存在: ${file}`);
    return readFileSync(file, "utf8").trim();
  }
  return undefined;
}

/** 解析国服 DPoP access token：--dpop-token 直给，否则用 --refresh-token 走 OAuth 刷新（结果按有效期缓存）。 */
async function resolveCnAccessToken(values: Record<string, unknown>, cache: DiskCache | null): Promise<string | undefined> {
  if (values["dpop-token"]) return values["dpop-token"] as string;
  const refreshToken = values["refresh-token"] as string | undefined;
  if (!refreshToken) return undefined;
  const cookie = resolveCookie(values);
  if (!cookie) return undefined;
  const cached = cache?.get<string>("cn:access-token");
  if (cached) return cached;
  const pair = await refreshCnAccessToken(cookie, refreshToken);
  const exp = jwtExpiry(pair.accessToken);
  const ttl = exp ? exp * 1000 - Date.now() - 60_000 : 30 * 60 * 1000;
  cache?.set("cn:access-token", pair.accessToken, Math.max(60_000, Math.min(ttl, 6 * 60 * 60 * 1000)));
  return pair.accessToken;
}

async function cmdPrice(input: string, values: Record<string, unknown>): Promise<void> {
  const mode = (values.mode as string) ?? "loose";
  const limit = Number(values.limit ?? 5);
  const useCache = values["no-cache"] !== true;
  const cache = useCache ? new DiskCache() : null;

  const realm = realmOf((values.server as string) ?? "intl");
  const cookie = resolveCookie(values);
  if (realm.needsCookie && !cookie) {
    console.error(
      "国服市集需要登录会话 Cookie：\n" +
        "  1. 浏览器登录 https://poe.game.qq.com/trade\n" +
        "  2. F12 → Network → 任意请求 → 复制请求头 Cookie（含 POESESSID=...）\n" +
        "  3. 用 --cookie \"POESESSID=...\" 传入，或用 --cookie-file <文件>（推荐，避免 shell 转义问题）",
    );
    process.exit(1);
  }

  const data = new TradeData(realm.host, cache ?? undefined);
  const league = (values.league as string | undefined) ?? (await data.pickLeague());

  // stat id 跨服通用：词缀匹配始终用国际服英文词缀表
  const statData = new TradeData();
  const statMap = new StatMap(await statData.stats());

  let parsedItem: ParsedItem;
  let sourceLabel: string;
  if (values["item-text"]) {
    parsedItem = parseItemText(values["item-text"] as string);
    sourceLabel = "item-text";
  } else {
    const { xml, source } = await resolveXml(input);
    const build = parseBuildXml(xml);
    const slot = selectItem(build, values.item as string | undefined);
    parsedItem = parseItemText(slot.rawText);
    sourceLabel = `${source} item=${slot.id}`;
  }
  parsedItem = localizeItem(parsedItem, realm.id);

  const query = buildSearchQuery(parsedItem, statMap, {
    deviationPct: Number(values.deviation ?? 10),
    // 国际服固定 sale_type=securable（立即购买）；国服不传（sale_type 会致 0）
    saleType: realm.id === "cn" ? undefined : "securable",
    maxMods: 8,
  });
  const delayMs = Number(values.delay ?? 2000);
  const rateWaitMs = Number(values["rate-wait"] ?? 30000);
  const dpopToken = await resolveCnAccessToken(values, cache);
  const client = new TradeClient(realm.host, { rateLimitMs: delayMs, maxRateWaitMs: rateWaitMs, cookie, dpopToken, cache: useCache ? new DiskCache() : null });
  const search = await client.search(league, query);
  if (search.total === 0 || search.result.length === 0) {
    const url = tradeSearchUrl(realm.host, league, search.id);
    console.log(`无匹配结果（${search.total}）。`);
    if (realm.id === "cn") {
      console.log("提示: 国服要求 Cookie 有效且来自常用网络（住宅 IP）。若全部返回 0：");
      console.log("      1) 重新登录 poe.game.qq.com/trade 并复制最新 Cookie（POESESSID/POETOKEN 会轮换）；");
      console.log("      2) 检查是否使用了代理/VPN（腾讯风控可能对数据中心 IP 静默返回空）；");
      console.log("      3) 仍不行请用浏览器实际搜索一次确认账号可正常搜索。");
    }
    console.log(`集市链接: ${url}`);
    return;
  }

  const ids = search.result.slice(0, limit);
  const listings = await client.fetchListings(search.id, ids);

  let conversion = new Map<string, number>();
  if (realm.id === "intl") {
    try {
      conversion = await fetchChaosConversion(league, useCache ? new DiskCache() : undefined);
    } catch (e) {
      console.error("警告: 通货折算表获取失败，按原价展示:", e instanceof Error ? e.message : e);
    }
  }

  const samples = toPriceSamples(listings, conversion);
  const summary = aggregatePrices(samples);
  const url = tradeSearchUrl(realm.host, league, search.id);

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          source: sourceLabel,
          league,
          mode,
          searchId: search.id,
          url,
          total: search.total,
          item: parsedItem,
          priceStats: { minChaos: summary.minChaos, medianChaos: summary.medianChaos, avgChaos: summary.avgChaos, count: summary.count, sampleCount: summary.sampleCount },
          samples: summary.samples.map((s) => ({ amount: s.amount, currency: s.currency, chaosValue: s.chaosValue, account: s.account, indexed: s.indexed })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    renderPriceReport({
      item: parsedItem,
      league,
      mode,
      saleType: realm.id === "cn" ? "any" : "securable",
      searchId: search.id,
      url,
      total: search.total,
      limit,
      summary,
    }),
  );
}

async function cmdBatch(input: string, values: Record<string, unknown>): Promise<void> {
  const { xml, source } = await resolveXml(input);
  const build = parseBuildXml(xml);
  const useCache = values["no-cache"] !== true;
  const cache = useCache ? new DiskCache() : null;

  const realm = realmOf((values.server as string) ?? "intl");
  const cookie = resolveCookie(values);
  if (realm.needsCookie && !cookie) {
    console.error(
      "国服市集需要登录会话 Cookie：\n" +
        "  1. 浏览器登录 https://poe.game.qq.com/trade\n" +
        "  2. F12 → Network → 任意请求 → 复制请求头 Cookie（含 POESESSID=...）\n" +
        "  3. 用 --cookie \"POESESSID=...\" 传入，或用 --cookie-file <文件>（推荐，避免 shell 转义问题）",
    );
    process.exit(1);
  }

  const realmData = new TradeData(realm.host, cache ?? undefined);
  const league = (values.league as string | undefined) ?? (await realmData.pickLeague());
  const delayMs = Number(values.delay ?? 2000);
  const rateWaitMs = Number(values["rate-wait"] ?? 30000);
  const dpopToken = await resolveCnAccessToken(values, cache);
  const client = new TradeClient(realm.host, { rateLimitMs: delayMs, maxRateWaitMs: rateWaitMs, cookie, dpopToken, cache: useCache ? new DiskCache() : null });
  // stat id 跨服通用：引擎的词缀匹配始终用国际服英文词缀表（国服 data/stats 是中文文本）
  const engine = new BatchPriceEngine(new TradeData(), client);

  const deviation = Number(values.deviation ?? 10);
  const limit = Number(values.limit ?? 3);
  const maxMods = Number(values["max-mods"] ?? 8);
  const includeGems = values["no-gems"] !== true;
  const showProgress = values.progress === true && values.json !== true;
  const gemCount = build.skills.reduce((n, s) => n + s.gems.length, 0);

  console.log(`批量查价(${realm.id === "cn" ? "国服" : "国际服"}): ${build.items.length} 件装备/药剂/珠宝 + ${includeGems ? gemCount : 0} 颗宝石 | 联赛 ${league} | 偏差 ${deviation}% | 来源 ${source}`);

  const summary = await engine.run(build, {
    league,
    deviationPct: deviation,
    limit,
    maxMods,
    includeGems,
    realm: realm.id,
    host: realm.host,
    onProgress: showProgress
      ? (done, total, label) => process.stderr.write(`\r[${done}/${total}] ${label.padEnd(46)}`)
      : undefined,
  });
  if (showProgress) process.stderr.write("\r" + " ".repeat(80) + "\r");

  console.log(`完成: ${summary.pricedCount} 项成功 / ${summary.failedCount} 项失败，耗时 ${(summary.durationMs / 1000).toFixed(1)}s`);
  console.log(`总净值: 按最低价 ${formatChaos(summary.totalChaosMin)} | 按中位价 ${formatChaos(summary.totalChaosMedian)}`);

  const byCat = new Map<string, BatchItemResult[]>();
  for (const r of summary.results) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }
  for (const [cat, rows] of byCat) {
    const sub = rows.filter((r) => !r.error);
    const catMin = sub.reduce((s, r) => s + (r.minChaos ?? 0) * r.count, 0);
    console.log(`\n【${cat}】${sub.length} 项，小计 ${formatChaos(catMin)}`);
    for (const r of rows) {
      const detail = r.gemLevel != null ? `lv${r.gemLevel}${r.gemQuality ? "/q" + r.gemQuality : ""}` : (r.baseType ?? "");
      const price = r.error ? "失败" : `${formatChaos(r.minChaos)}（中位 ${formatChaos(r.medianChaos)}，${r.sampleCount} 样本，匹配 ${r.total}）`;
      console.log(`  ${r.name}${r.count > 1 ? " ×" + r.count : ""} [${detail}] → ${price}${r.error ? ": " + r.error : ""}`);
    }
  }

  if (values.csv) {
    const csvPath = values.csv as string;
    await writeFile(csvPath, itemsToCsv(summary.results), "utf8");
    console.log(`\nCSV 已导出: ${csvPath}`);
  }
  if (values.json) {
    console.log(
      JSON.stringify(
        {
          source,
          league: summary.league,
          durationMs: summary.durationMs,
          totalChaosMin: summary.totalChaosMin,
          totalChaosMedian: summary.totalChaosMedian,
          pricedCount: summary.pricedCount,
          failedCount: summary.failedCount,
          results: summary.results,
        },
        null,
        2,
      ),
    );
  }
}

async function cmdParse(input: string, values: Record<string, unknown>): Promise<void> {
  const { xml, source } = await resolveXml(input);
  if (values.raw) {
    console.log(xml);
    return;
  }
  const build = parseBuildXml(xml);
  if (values.items) {
    for (const item of build.items) console.log("===== Item " + item.id + " =====\n" + item.rawText + "\n");
    return;
  }
  if (values.json) {
    const payload = {
      source,
      info: build.info,
      items: build.items.map((it) => ({ id: it.id, rawText: it.rawText, parsed: parseItemText(it.rawText) })),
      jewels: build.jewels.map((j) => ({ nodeId: j.nodeId, rawText: j.rawText, parsed: parseItemText(j.rawText) })),
      skills: build.skills,
      tree: build.tree
        ? { nodeCount: build.tree.nodes.length, socketCount: build.tree.sockets.length, url: build.tree.url }
        : undefined,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(renderBuildReport(build, parseItemText));
}

async function cmdServe(values: Record<string, unknown>): Promise<void> {
  const { startServer } = await import("./server.js");
  const port = Number(values.port ?? 8899);
  await startServer(port);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      raw: { type: "boolean", default: false },
      items: { type: "boolean", default: false },
      item: { type: "string" },
      "item-text": { type: "string" },
      league: { type: "string" },
      deviation: { type: "string" },
      limit: { type: "string" },
      delay: { type: "string" },
      "rate-wait": { type: "string" },
      server: { type: "string" },
      cookie: { type: "string" },
      "cookie-file": { type: "string" },
      "refresh-token": { type: "string" },
      "dpop-token": { type: "string" },
      "no-cache": { type: "boolean", default: false },
      "max-mods": { type: "string" },
      "no-gems": { type: "boolean", default: false },
      csv: { type: "string" },
      progress: { type: "boolean", default: false },
      port: { type: "string" },
    },
  });

  const command = positionals[0];
  const input = positionals[1];
  if (command === "serve") {
    await cmdServe(values);
    return;
  }
  if (!command || !input) {
    console.error(USAGE);
    process.exit(1);
  }
  if (command === "price") {
    await cmdPrice(input, values);
    return;
  }
  if (command === "batch") {
    await cmdBatch(input, values);
    return;
  }
  if (command === "parse") {
    await cmdParse(input, values);
    return;
  }
  console.error("未知命令: " + command + "\n" + USAGE);
  process.exit(1);
}

main().catch((err) => {
  console.error("错误:", err instanceof Error ? err.message : err);
  process.exit(1);
});