import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BatchPriceEngine } from "../src/batch/engine.js";
import type { DataProvider, ClientProvider } from "../src/batch/engine.js";
import type { RawBuild } from "../src/pob/types.js";
import type { Listing, SearchResponse, StatEntry } from "../src/trade/types.js";

class FakeData implements DataProvider {
  async stats(): Promise<StatEntry[]> {
    return [];
  }
}

function listing(amount: number, currency: string): Listing {
  return {
    id: "l" + amount,
    listing: {
      method: "forum",
      indexed: "2026-01-01T00:00:00Z",
      price: { type: "~price", amount, currency },
      account: { name: "p" + amount, lastCharacterName: "p" + amount },
      whisper: "w",
    },
    item: { id: "i", name: "", typeLine: "" },
  };
}

class FakeClient implements ClientProvider {
  searches = 0;
  fetches = 0;
  async search(league: string, query: unknown): Promise<SearchResponse> {
    this.searches++;
    return { id: "search-" + this.searches, total: 2, result: ["r1", "r2"] };
  }
  async fetchListings(searchId: string, ids: string[]): Promise<Listing[]> {
    this.fetches++;
    return [listing(5, "chaos"), listing(10, "chaos")];
  }
}

const uniqueText = `Rarity: UNIQUE
Inpulsa's Broken Heart
Sadist Garb
Item Level: 71`;

function build(): RawBuild {
  return {
    xml: "",
    info: { level: 95, className: "Ranger" },
    items: [
      { id: "1", rawText: uniqueText, attrs: {} },
      { id: "2", rawText: uniqueText, attrs: {} }, // 同款第二件
    ],
    jewels: [],
    skills: [
      {
        slot: "Body Armour",
        mainActiveSkill: true,
        gems: [{ gemId: "Metadata/Items/Gems/SkillGemArc", name: "Arc", level: 20, quality: 0, enabled: true }],
      },
    ],
    tree: undefined,
  };
}

describe("BatchPriceEngine", () => {
  it("同款装备去重计数量、宝石单独查价", async () => {
    const data = new FakeData();
    const client = new FakeClient();
    const engine = new BatchPriceEngine(data, client, async () => new Map([["chaos", 1]]));
    const summary = await engine.run(build(), { league: "Allflame", deviationPct: 10, limit: 3, maxMods: 8, includeGems: true });
    // 2 个唯一入口：1 件装备（去重后）+ 1 颗宝石 → 2 次 search
    assert.equal(client.searches, 2);
    assert.equal(client.fetches, 2);
    assert.equal(summary.results.length, 2);
    const item = summary.results.find((r) => r.kind === "item")!;
    const gem = summary.results.find((r) => r.kind === "gem")!;
    assert.equal(item.count, 2, "同款两件应计数量 2");
    assert.equal(item.minChaos, 5);
    assert.equal(item.medianChaos, 7.5);
    assert.equal(gem.name, "Arc");
    assert.equal(gem.gemLevel, 20);
    // 总净值按最低价 = 5 × 2 + 5 = 15
    assert.equal(summary.totalChaosMin, 15);
    assert.equal(summary.pricedCount, 2);
    assert.equal(summary.failedCount, 0);
  });

  it("单件失败不影响其余，错误被标记", async () => {
    const data = new FakeData();
    const client = new FakeClient();
    const engine = new BatchPriceEngine(data, client, async () => new Map([["chaos", 1]]));
    let n = 0;
    const original = client.search.bind(client);
    client.search = async () => {
      n++;
      if (n === 1) throw new Error("模拟失败");
      return original();
    };
    const summary = await engine.run(build(), { league: "Allflame", deviationPct: 10, limit: 3, maxMods: 8, includeGems: true });
    assert.equal(summary.failedCount, 1);
    const failed = summary.results.find((r) => r.error);
    assert.ok(failed, "应有失败项");
    assert.match(failed!.error ?? "", /模拟失败/);
    assert.equal(summary.results.filter((r) => !r.error).length, 1);
  });

  it("onlyIds 只查指定装备；onItem 逐项回调", async () => {
    const data = new FakeData();
    const client = new FakeClient();
    const engine = new BatchPriceEngine(data, client, async () => new Map([["chaos", 1]]));
    const seen: string[] = [];
    const summary = await engine.run(build(), {
      league: "Allflame",
      deviationPct: 10,
      limit: 2,
      maxMods: 8,
      includeGems: false,
      onlyIds: ["1"], // 只查第一件装备（唯一装，去重后 1 项）
      onItem: (r) => seen.push(r.name),
    });
    // 只查 id=1 的装备：1 次 search + 1 次 fetch
    assert.equal(client.searches, 1);
    assert.equal(client.fetches, 1);
    assert.equal(summary.results.length, 1);
    assert.equal(summary.results[0].kind, "item");
    assert.ok(seen.length >= 1, "onItem 应被调用");
  });

});