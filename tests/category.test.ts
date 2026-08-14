import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { categorizeItem } from "../src/item/category.js";
import { parseItemText } from "../src/item/parser.js";

describe("categorizeItem", () => {
  const cases: [string, string][] = [
    ["Rarity: UNIQUE\nInpulsa's Broken Heart\nSadist Garb", "防具"],
    ["Rarity: RARE\nStorm Circle\nTwo-Stone Ring\nUnique ID: abc\nItem Level: 83", "饰品"],
    ["Rarity: UNIQUE\nTaste of Hate\nSapphire Flask", "药剂"],
    ["Rarity: UNIQUE\nInspired Learning\nCrimson Jewel", "珠宝"],
    ["Rarity: UNIQUE\nHeadhunter\nLeather Belt", "饰品"],
    ["Rarity: GEM\nArc", "宝石"],
    ["Rarity: DIVINATION CARD\nThe Doctor", "命运卡"],
  ];
  for (const [text, expected] of cases) {
    it(`${expected}: ${text.split("\n")[1] ?? text.split("\n")[0]}`, () => {
      assert.equal(categorizeItem(parseItemText(text)), expected);
    });
  }
});
