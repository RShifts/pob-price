import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregatePrices, toPriceSamples } from "../src/trade/price.js";
import type { Listing } from "../src/trade/types.js";

function listing(price: { amount: number; currency: string }, account = "player"): Listing {
  return {
    id: account + price.amount,
    listing: {
      method: "forum",
      indexed: "2026-01-01T00:00:00Z",
      price: { type: "~price", ...price },
      account: { name: account, lastCharacterName: account },
      whisper: "hi",
    },
    item: { id: "x", name: "", typeLine: "" },
  };
}

describe("toPriceSamples + aggregatePrices", () => {
  const conversion = new Map<string, number>([
    ["chaos", 1],
    ["divine", 200],
    ["exalted", 15],
  ]);

  it("按折算表换算并统计", () => {
    const samples = toPriceSamples(
      [
        listing({ amount: 5, currency: "chaos" }),
        listing({ amount: 1, currency: "divine" }),
        listing({ amount: 3, currency: "chaos" }),
        listing({ amount: 10, currency: "exalted" }),
      ],
      conversion,
    );
    assert.equal(samples.length, 4);
    assert.equal(samples[1].chaosValue, 200);
    assert.equal(samples[3].chaosValue, 150);
    const s = aggregatePrices(samples);
    assert.equal(s.count, 4);
    assert.equal(s.minChaos, 3);
    assert.equal(s.medianChaos, (5 + 150) / 2);
    assert.equal(s.avgChaos, (5 + 200 + 3 + 150) / 4);
  });

  it("无价挂牌跳过、未知通货折算为 null", () => {
    const noPrice = listing({ amount: 0, currency: "chaos" });
    noPrice.listing.price = undefined;
    const samples = toPriceSamples([noPrice, listing({ amount: 7, currency: "mirror" })], conversion);
    assert.equal(samples.length, 1);
    assert.equal(samples[0].chaosValue, null);
    const s = aggregatePrices(samples);
    assert.equal(s.count, 0, "无法折算的样本不计入统计");
    assert.equal(s.sampleCount, 1);
  });
});
