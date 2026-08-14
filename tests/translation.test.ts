import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { translateToCn, localizeItem, localizeGemName, realmOf } from "../src/trade/realms.js";
import { parseItemText } from "../src/item/parser.js";

describe("translateToCn", () => {
  it("基底/唯一装/宝石 常用词条", () => {
    assert.equal(translateToCn("Arc"), "电弧");
    assert.equal(translateToCn("Two-Stone Ring"), "双玉戒指");
    assert.equal(translateToCn("Inpulsa's Broken Heart"), "速度之力");
    assert.equal(translateToCn("Headhunter"), "猎首");
    assert.equal(translateToCn("Sadist Garb"), "狂虐者束衣");
    assert.equal(translateToCn("Watcher's Eye"), "守望之眼");
  });

  it("辅助宝石：表内为 X Support → X(辅)，裸名回退匹配", () => {
    assert.equal(translateToCn("Enlighten Support"), "启蒙(辅)");
    assert.equal(translateToCn("Enlighten"), "启蒙(辅)");
    assert.equal(translateToCn("Added Cold Damage Support"), "附加冰霜伤害(辅)");
  });

  it("查不到返回原值", () => {
    assert.equal(translateToCn("完全未知的物品名XYZ"), "完全未知的物品名XYZ");
    assert.equal(translateToCn(""), "");
  });
});

describe("localizeItem", () => {
  it("intl 不变", () => {
    const item = parseItemText("Rarity: UNIQUE\nInpulsa's Broken Heart\nSadist Garb");
    const out = localizeItem(item, "intl");
    assert.equal(out.name, "Inpulsa's Broken Heart");
    assert.equal(out.baseType, "Sadist Garb");
  });

  it("cn 翻译 name/baseType，稀有度等字段不变", () => {
    const item = parseItemText("Rarity: UNIQUE\nInpulsa's Broken Heart\nSadist Garb");
    const out = localizeItem(item, "cn");
    assert.equal(out.name, "速度之力");
    assert.equal(out.baseType, "狂虐者束衣");
    assert.equal(out.rarity, "Unique");
  });
});

describe("localizeGemName", () => {
  it("cn 翻译宝石名，intl 不变", () => {
    assert.equal(localizeGemName("Arc", "cn"), "电弧");
    assert.equal(localizeGemName("Arc", "intl"), "Arc");
  });
});

describe("realmOf", () => {
  it("默认 intl，未知回退 intl", () => {
    assert.equal(realmOf("cn").host, "https://poe.game.qq.com");
    assert.equal(realmOf("intl").host, "https://www.pathofexile.com");
    assert.equal(realmOf("hacker").id, "intl");
  });
});