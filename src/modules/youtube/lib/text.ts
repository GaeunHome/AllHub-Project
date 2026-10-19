// 字幕 RSS 與頻道頁共用的字串整理

/**
 * 不能用的回 null 讓呼叫端保留原文 超出範圍時 fromCodePoint 會丟錯
 * NUL 與單獨的代理字元存不進 Postgres 的 text 與 jsonb
 */
function codePointToString(code: number): string | null {
  const usable = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
  return usable ? String.fromCodePoint(code) : null;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML 與 XML 的實體換回原字 一次換完 &amp;lt; 只會變成 &lt; 認不得或不能用的保留原文 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return codePointToString(code) ?? whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

/** 每行去掉前後空白 拿掉空行 */
export function tidyLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
