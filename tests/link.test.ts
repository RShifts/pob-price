import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePobbUrl, isPobbUrl } from "../src/pob/link.js";

describe("parsePobbUrl", () => {
  it("标准链接", () => {
    assert.deepEqual(parsePobbUrl("https://pobb.in/eQVFNoqVZrza"), {
      id: "eQVFNoqVZrza",
      rawUrl: "https://pobb.in/eQVFNoqVZrza/raw",
      isUserUrl: false,
    });
  });

  it("无协议形式", () => {
    assert.equal(parsePobbUrl("pobb.in/eQVFNoqVZrza/raw")?.id, "eQVFNoqVZrza");
  });

  it("用户主页形式", () => {
    assert.deepEqual(parsePobbUrl("http://www.pobb.in/u/test_user/abc1234"), {
      id: "abc1234",
      rawUrl: "https://pobb.in/test_user/abc1234/raw",
      isUserUrl: true,
    });
  });

  it("非 pobb.in 返回 null", () => {
    assert.equal(parsePobbUrl("https://example.com/foo"), null);
  });

  it("isPobbUrl 识别", () => {
    assert.equal(isPobbUrl("https://pobb.in/abc"), true);
    assert.equal(isPobbUrl("POB code here"), false);
  });
});
