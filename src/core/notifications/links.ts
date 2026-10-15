export type LinkTarget = { href: string; external: boolean };

/**
 * 只接受 http 或 https 網址與站內路徑 寫入與顯示都經過這裡
 * javascript 這類連結才不會變成可點的
 */
export function linkTarget(url: string | null | undefined): LinkTarget | null {
  if (!url) return null;
  // 雙斜線與斜線加反斜線開頭會被瀏覽器當成別的網站
  if (url.startsWith("/")) return url.startsWith("//") || url.startsWith("/\\") ? null : { href: url, external: false };
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? { href: parsed.href, external: true } : null;
  } catch {
    return null;
  }
}
