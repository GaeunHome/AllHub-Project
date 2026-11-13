// 短網址跟真的一樣轉到完整的地點網址
// 改寫後只剩路徑 所以用路徑開頭分辨
export function handle({ url, redirect, text, json }) {
  const rates = RATES_PATH.exec(url.pathname);
  if (rates) return ratesResponse(rates[1] ?? "latest", json);
  const match = /^\/mapshort(\w*)$/.exec(url.pathname);
  if (!match) return false;
  if (match[1] === "broken") return text(500, "oops");
  return redirect(302, "https://www.google.com/maps/place/%E6%B8%85%E6%B0%B4%E5%AF%BA/@34.99,135.78,17z/data=!3d34.9946662!4d135.7849782");
}

// 匯率 jsDelivr 帶日期 Cloudflare 的日期在網域上 改寫後看不到 當成最新的
const RATES_PATH = /^\/(?:npm\/@fawazahmed0\/currency-api@([\w-]+)\/)?v1\/currencies\/twd\.json$/;

// 1 台幣換多少外幣 接近 2026-11 的真實數字
const PER_TWD = { jpy: 4.846, krw: 40.36, usd: 0.03032, eur: 0.02737, gbp: 0.02287, hkd: 0.2377, mop: 0.2449, cny: 0.2022, sgd: 0.03897, thb: 1.0235, vnd: 778.9, myr: 0.1238, idr: 553.3, aud: 0.04437, btc: 0.0000003 };

// 真的資料從 2024-03-02 開始 更早的回 404
// 每天小幅變動 畫面上看得出有沒有帶到那一天
function ratesResponse(day, json) {
  const date = day === "latest" ? new Date().toISOString().slice(0, 10) : day;
  if (date < "2024-03-02") return json(404, { message: "not found" });
  const factor = 1 + (Number(date.slice(8, 10)) % 5) * 0.002;
  const twd = Object.fromEntries(Object.entries(PER_TWD).map(([code, value]) => [code, value * factor]));
  return json(200, { date, twd: { twd: 1, ...twd } });
}
