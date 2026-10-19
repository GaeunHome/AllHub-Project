// 交給各模組 handle 的 ctx 假伺服器與測試的 mockRequest 共用這一份
// res 只用到 writeHead 與 end

export function mockContext({ req, url, body, res }) {
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
  // 假的 CDN 圖片 externalAssetUrl 把頭像與縮圖都改寫到這裡
  // 顏色依 label 固定 畫面上看得出是哪一張
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

  // 轉址 例如一般影片的 /shorts/<id> 會 303 到 /watch 呼叫端靠 Location 判斷
  const redirect = (status, location) => {
    res.writeHead(status, { Location: location });
    res.end();
    return true;
  };

  return { req, url, body, json, text, image, redirect };
}
