import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { parseBuildXml } from "./pob/xml.js";
import { parseItemText } from "./item/parser.js";
import { categorizeItem } from "./item/category.js";
import { resolveInputToXml } from "./input.js";
import { BatchPriceEngine } from "./batch/engine.js";
import type { BatchItemResult, BatchSummary } from "./batch/engine.js";
import { TradeData } from "./trade/data.js";
import { TradeClient } from "./trade/client.js";
import { realmOf, translateToCn } from "./trade/realms.js";
import { translateModsToCn } from "./trade/mod-cn.js";
import { DiskCache } from "./trade/cache.js";

const INDEX_HTML = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

interface PriceJob {
  id: string;
  status: "running" | "done" | "error";
  error?: string;
  progress: { done: number; total: number; label: string };
  intl?: BatchSummary;
  cn?: BatchSummary;
  partial: { intl: BatchItemResult[]; cn: BatchItemResult[] };
  startedAt: number;
}

const jobs = new Map<string, PriceJob>();

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4 * 1024 * 1024) throw new Error("请求体过大");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleParse(body: { input?: string }): Promise<unknown> {
  if (!body.input) throw new Error("缺少 input（POB Code / 链接 / 文件路径）");
  const { xml, source } = await resolveInputToXml(body.input);
  const build = parseBuildXml(xml);
  const items = build.items.map((it) => {
    const p = parseItemText(it.rawText);
    const name = p.name ?? p.baseType ?? "(未命名)";
    const baseType = p.baseType ?? "";
    return {
      id: it.id,
      name,
      nameCn: translateToCn(name),
      baseType,
      baseTypeCn: baseType ? translateToCn(baseType) : "",
      rarity: p.rarity,
      itemClass: p.itemClass ?? "",
      ilvl: p.itemLevel ?? null,
      quality: p.quality ?? null,
      sockets: p.sockets ?? "",
      corrupted: p.corrupted,
      category: categorizeItem(p),
      uniqueId: p.uniqueId ?? null,
      // 详细词缀（UI 展开显示）
      mods: {
        implicit: p.implicitMods,
        explicit: p.explicitMods,
        crafted: p.craftMods,
        fractured: p.fracturedMods,
        synthesized: p.synthesizedMods,
        enchant: p.enchantMods,
      },
      // 词缀中文翻译（与 mods 同结构；cn 为 null 表示未翻译）
      modsCn: {
        implicit: translateModsToCn(p.implicitMods),
        explicit: translateModsToCn(p.explicitMods),
        crafted: translateModsToCn(p.craftMods),
        fractured: translateModsToCn(p.fracturedMods),
        synthesized: translateModsToCn(p.synthesizedMods),
        enchant: translateModsToCn(p.enchantMods),
      },
    };
  });
  const gems = build.skills.flatMap((s) => s.gems.map((g) => {
    const name = g.name ?? g.gemId.split("/").pop() ?? "?";
    return { name, nameCn: translateToCn(name), level: g.level, quality: g.quality, slot: s.slot ?? "" };
  }));
  return {
    source,
    info: build.info,
    items,
    jewels: build.jewels.map((j) => ({ nodeId: j.nodeId, parsed: parseItemText(j.rawText) })),
    gems,
    tree: build.tree ? { nodeCount: build.tree.nodes.length, socketCount: build.tree.sockets.length } : null,
  };
}

async function startPriceJob(body: Record<string, unknown>): Promise<{ jobId: string }> {
  const jobId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const job: PriceJob = { id: jobId, status: "running", progress: { done: 0, total: 1, label: "初始化" }, partial: { intl: [], cn: [] }, startedAt: Date.now() };
  jobs.set(jobId, job);
  void runPriceJob(job, body).catch((err) => {
    job.status = "error";
    job.error = err instanceof Error ? err.message : String(err);
  });
  return { jobId };
}

async function runPriceJob(job: PriceJob, body: Record<string, unknown>): Promise<void> {
  const servers = (body.servers as string[] | undefined) ?? ["intl", "cn"];
  const { xml } = await resolveInputToXml(String(body.input));
  const build = parseBuildXml(xml);
  const deviationPct = Number(body.deviationPct ?? 10);
  const limit = Number(body.limit ?? 3);
  const onlyIds = Array.isArray(body.onlyIds) ? (body.onlyIds as string[]) : undefined;
  const includeGems = body.includeGems !== false;
  const includeCrafted = body.includeCrafted === true;
  job.progress = { done: 0, total: servers.length, label: "解析完成，开始查价" };

  let doneCount = 0;
  const itemTotal = (onlyIds?.length ?? build.items.length) + (includeGems ? build.skills.reduce((n, s) => n + s.gems.length, 0) : 0);
  const totalItems = itemTotal * servers.length;
  const tasks = servers.map(async (sid) => {
    const realm = realmOf(sid);
    const cache = new DiskCache();
    const league = (body.league as Record<string, string> | undefined)?.[sid] ?? (await new TradeData(realm.host, cache).pickLeague());
    const delayMs = Number(body.delay ?? 3000);
    const client = new TradeClient(realm.host, { rateLimitMs: delayMs, cookie: sid === "cn" ? (body.cookie as string | undefined) : undefined, cache });
    const engine = new BatchPriceEngine(new TradeData(), client);
    const partial: BatchItemResult[] = [];
    const summary = await engine.run(build, {
      league,
      deviationPct,
      limit,
      maxMods: 8,
      includeCrafted,
      includeGems,
      onlyIds,
      realm: realm.id,
      host: realm.host,
      onProgress: (done, total) => {
        doneCount += 1;
        job.progress = { done: doneCount, total: totalItems, label: sid + ": " + done + "/" + total };
      },
      onItem: (r) => {
        partial.push({ ...r, nameCn: translateToCn(r.name) });
        job.partial[sid as "intl" | "cn"] = [...partial];
      },
    });
    job[sid as "intl" | "cn"] = summary;
  });
  await Promise.all(tasks);
  job.status = "done";
}

export function createAppServer(): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(INDEX_HTML);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/leagues") {
        const realm = realmOf(url.searchParams.get("server") ?? "intl");
        const leagues = await new TradeData(realm.host).leagues();
        json(res, 200, { result: leagues.filter((l) => l.realm === "pc") });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/price") {
        const job = jobs.get(url.searchParams.get("jobId") ?? "");
        if (!job) return json(res, 404, { error: "任务不存在" });
        json(res, 200, {
          status: job.status,
          error: job.error ?? null,
          progress: job.progress,
          intl: job.intl ? summarize(job.intl) : null,
          cn: job.cn ? summarize(job.cn) : null,
          partial: { intl: job.partial.intl, cn: job.partial.cn },
        });
        return;
      }
      if (req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        if (url.pathname === "/api/parse") {
          json(res, 200, await handleParse(body));
          return;
        }
        if (url.pathname === "/api/price") {
          json(res, 200, await startPriceJob(body));
          return;
        }
      }
      json(res, 404, { error: "未找到 " + url.pathname });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  return server;
}

export async function startServer(port = 8899): Promise<void> {
  const server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`可视化界面已启动: http://127.0.0.1:${port}`);
    console.log("按 Ctrl+C 停止");
  });
  await new Promise<void>((resolve) => server.once("close", resolve));
}

function summarize(s: BatchSummary) {
  return {
    league: s.league,
    totalChaosMin: s.totalChaosMin,
    totalChaosMedian: s.totalChaosMedian,
    pricedCount: s.pricedCount,
    failedCount: s.failedCount,
    durationMs: s.durationMs,
  };
}