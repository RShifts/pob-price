const test = async (label, url, opts) => {
  const r = await fetch(url, opts);
  const t = await r.text();
  console.log(label, "->", r.status, "len:", t.length, t.slice(0, 80).replace(/\s+/g, " "));
};
(async () => {
  await test("GET /            ", "http://127.0.0.1:8899/");
  await test("POST /api/parse  ", "http://127.0.0.1:8899/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: "tests/fixtures/real-pobb.in.xml" }) });
})();