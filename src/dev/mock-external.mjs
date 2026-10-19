// 新模組只要放 src/modules/<id>/dev/mock.mjs 就會自動載入 這裡不必改
// 它匯出 handle 處理了就回 true
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { mockContext } from "./mock-context.mjs";

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

  const ctx = mockContext({ req, url, body, res });
  for (const mock of mocks) if (await mock.handle(ctx)) return;
  ctx.json(404, { message: `mock 沒有這個路徑：${url.pathname}` });
}).listen(port, "127.0.0.1", () => console.log(`[mock] listening on http://127.0.0.1:${port}（${mocks.map((m) => m.id).join("、")}）`));
