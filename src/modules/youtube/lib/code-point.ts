/** 不能用的回 null 讓呼叫端保留原文：超出範圍時 fromCodePoint 會丟錯，NUL 與單獨的代理字元存不進 Postgres 的 text／jsonb */
export function codePointToString(code: number): string | null {
  const usable = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
  return usable ? String.fromCodePoint(code) : null;
}
