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
  // 假的 CDN 圖片：瀏覽器載入的頭像、縮圖都改寫到這裡（core/external-url 的 externalAssetUrl），顏色依 label 固定，畫面上看得出是哪一張
  const image = (label, { width = 320, height = 180, round = false } = {}) => {
    const hue = [...label].reduce((sum, ch) => (sum * 31 + ch.codePointAt(0)) % 360, 7);
    const caption = label.slice(0, 16).replace(/[<>&"]/g, "");
    const fontSize = Math.round(Math.min(width, height) / (caption.length > 4 ? 7 : 3));
    const shape = round ? `<circle cx="50%" cy="50%" r="50%" fill="url(#g)"/>` : `<rect width="100%" height="100%" fill="url(#g)"/>`;
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=600" });
    res.end(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 72% 64%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 62% 40%)"/></linearGradient></defs>${shape}<text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-weight="700" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${caption}</text></svg>`,
    );
    return true;
  };

  const ctx = { req, url, body, json, text, image };
  for (const mock of mocks) if (await mock.handle(ctx)) return;
  json(404, { message: `mock 沒有這個路徑：${url.pathname}` });
}).listen(port, "127.0.0.1", () => console.log(`[mock] listening on http://127.0.0.1:${port}（${mocks.map((m) => m.id).join("、")}）`));
