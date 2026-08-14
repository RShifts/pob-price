const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const r = await fetch("http://127.0.0.1:8899/api/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: "tests/fixtures/test_code.code", servers: ["intl"], onlyIds: ["1"], limit: 1 }),
  });
  const j = await r.json();
  console.log("POST /api/price ->", r.status, JSON.stringify(j));
  if (j.jobId) {
    for (let i = 0; i < 12; i++) {
      await sleep(2000);
      const g = await fetch("http://127.0.0.1:8899/api/price?jobId=" + j.jobId);
      const gj = await g.json();
      console.log("job:", gj.status, "| progress:", JSON.stringify(gj.progress), "| intl:", JSON.stringify(gj.intl && { totalChaosMin: gj.intl.totalChaosMin, priced: gj.intl.pricedCount, failed: gj.intl.failedCount }), "| partial:", (gj.partial.intl || []).length);
      if (gj.status === "done" || gj.status === "error") break;
    }
  }
})();