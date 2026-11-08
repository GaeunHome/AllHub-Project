// 短網址跟真的一樣轉到完整的地點網址
// 改寫後只剩路徑 所以用路徑開頭分辨
export function handle({ url, redirect, text }) {
  const match = /^\/mapshort(\w*)$/.exec(url.pathname);
  if (!match) return false;
  if (match[1] === "broken") return text(500, "oops");
  return redirect(302, "https://www.google.com/maps/place/%E6%B8%85%E6%B0%B4%E5%AF%BA/@34.99,135.78,17z/data=!3d34.9946662!4d135.7849782");
}
