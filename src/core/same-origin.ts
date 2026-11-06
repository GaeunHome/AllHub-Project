/** 跟 Server Action 一樣比對 Origin 與 Host 這個標頭由瀏覽器帶上 網頁的 JavaScript 改不了 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
