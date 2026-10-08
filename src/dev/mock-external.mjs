// 新模組只要放 src/modules/<id>/dev/mock.mjs（匯出 handle(ctx)，處理了就回 true）就會自動載入，這裡不必改
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT ?? 4010);
const modulesDir = new URL("../modules/", import.meta.url);

const mocks = [];
for (const entry of readdirSync(modulesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const file = new URL(`${entry.name}/dev/mock.mjs`, modulesDir);
  if (existsSync(file)) mocks.push({ id: entry.name, handle: (await import(file.href)).handle });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let body = "";
  for await (const chunk of req) body += chunk;
  console.log(`[mock] ${req.method} ${url.pathname}${url.search}`);

  const json = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(data === undefined ? "" : JSON.stringify(data));
    return true;
  };
  const text = (status, data, type = "text/plain") => {
    res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
    res.end(data);
    return true;
  };

  const ctx = { req, url, body, json, text };
  for (const mock of mocks) if (await mock.handle(ctx)) return;
  json(404, { message: `mock 沒有這個路徑：${url.pathname}` });
}).listen(port, "127.0.0.1", () => console.log(`[mock] listening on http://127.0.0.1:${port}（${mocks.map((m) => m.id).join("、")}）`));
