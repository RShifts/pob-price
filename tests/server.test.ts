import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../src/server.js";
import type { AddressInfo } from "node:net";

let server: ReturnType<typeof createAppServer> | null = null;
let base = "";

async function start(): Promise<void> {
  if (server) return;
  server = createAppServer();
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  base = "http://127.0.0.1:" + addr.port;
}

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("server API", () => {
  it("GET / 返回页面", async () => {
    await start();
    const r = await fetch(base + "/");
    assert.equal(r.status, 200);
    const t = await r.text();
    assert.ok(t.includes("POB 查价工具"));
  });

  it("POST /api/parse 解析真实构建", async () => {
    await start();
    const r = await fetch(base + "/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "tests/fixtures/import_code.xml" }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.items.length, 21);
    assert.equal(j.info.className, "Witch");
    assert.ok(j.gems.length > 0);
  });

  it("POST /api/parse 错误输入返回 500", async () => {
    await start();
    const r = await fetch(base + "/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "完全不存在的输入xyz" }),
    });
    assert.equal(r.status, 500);
    const j = await r.json();
    assert.ok(j.error);
  });

  it("POST /api/price 返回任务 id，查询任务状态", async () => {
    await start();
    const r = await fetch(base + "/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "tests/fixtures/test_code.code", servers: ["intl"], onlyIds: ["1"], limit: 1 }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.jobId);
    const g = await fetch(base + "/api/price?jobId=" + j.jobId);
    assert.equal(g.status, 200);
    const gj = await g.json();
    assert.ok(["running", "done", "error"].includes(gj.status));
  });
});
