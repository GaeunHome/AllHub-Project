export type LinkTarget = { href: string; external: boolean };

/** 通知連結只接受 http(s) 網址或站內路徑；寫入與顯示都經過這裡，javascript: 之類的連結不會變成可點的 */
export function linkTarget(url: string | null | undefined): LinkTarget | null {
  if (!url) return null;
  // //host 與 /\host 會被瀏覽器當成別的網站
  if (url.startsWith("/")) return url.startsWith("//") || url.startsWith("/\\") ? null : { href: url, external: false };
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? { href: parsed.href, external: true } : null;
  } catch {
    return null;
  }
}
