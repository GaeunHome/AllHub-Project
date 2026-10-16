import type { DateKey } from "./dates";
import { SYMBOL_PATTERN } from "./kinds";
import { formatNumber } from "./money";

// 證交所 STOCK_DAY_ALL 與櫃買中心 tpex_mainboard_quotes 的收盤價
// 欄位全是字串 日期是民國年 沒成交時證交所是空字串 櫃買是 ----

/** closeCents 是收盤價的分 例如 123.45 存 12345 沒成交是 null */
export type Quote = { symbol: string; name: string; closeCents: number | null; date: DateKey | null; market: "twse" | "tpex" };

/** 回應不是陣列 多半是對方改版或回了錯誤頁 當成這個來源讀不到 */
export class QuoteFormatError extends Error {
  name = "QuoteFormatError";
}

/** 去空白轉大寫 不是 4 到 6 碼的英數就回 null */
export function normalizeSymbol(input: string): string | null {
  const symbol = input.replace(/\s+/g, "").toUpperCase();
  return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

const PRICE_PATTERN = /^(\d{1,7})(?:\.(\d{1,4}))?$/;

/**
 * 用字串換成分 不經過浮點數 1.005 乘 100 會變成 100.49 多
 * 第三位以後四捨五入 台股的價格其實最多兩位
 */
export function priceToCents(text: string): number | null {
  const match = PRICE_PATTERN.exec(text.trim());
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(4, "0");
  const cents = Number(match[1]) * 100 + Number(fraction.slice(0, 2)) + (Number(fraction.slice(2)) >= 50 ? 1 : 0);
  return cents > 0 ? cents : null;
}

/** 民國年月日 例如 1151014 是 2026-10-14 */
export function rocDateToKey(text: string): DateKey | null {
  const match = /^(\d{2,3})(\d{2})(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = `${Number(year) + 1911}-${month}-${day}`;
  const check = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === date ? date : null;
}

const text = (row: Record<string, unknown>, key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");

function parseRows(json: unknown, market: Quote["market"], keys: { symbol: string; name: string; close: string }): Quote[] {
  if (!Array.isArray(json)) throw new QuoteFormatError(`${market} 回應不是陣列`);
  return json.flatMap((row): Quote[] => {
    if (typeof row !== "object" || row === null) return [];
    const record = row as Record<string, unknown>;
    const symbol = normalizeSymbol(text(record, keys.symbol));
    const name = text(record, keys.name).trim();
    if (symbol === null || name === "") return [];
    return [{ symbol, name, closeCents: priceToCents(text(record, keys.close)), date: rocDateToKey(text(record, "Date")), market }];
  });
}

export function parseTwseQuotes(json: unknown): Quote[] {
  return parseRows(json, "twse", { symbol: "Code", name: "Name", close: "ClosingPrice" });
}

export function parseTpexQuotes(json: unknown): Quote[] {
  return parseRows(json, "tpex", { symbol: "SecuritiesCompanyCode", name: "CompanyName", close: "Close" });
}

/** 快取 key 用的代號清單 正規化 去重 排序 不合格的丟掉 */
export function quoteSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map(normalizeSymbol).filter((symbol): symbol is string => symbol !== null))].sort();
}

/** 收盤價固定兩位小數 千元以上的股票整數部分也加千分位 */
export function formatPrice(closeCents: number): string {
  return `${formatNumber(Math.floor(closeCents / 100))}.${String(closeCents % 100).padStart(2, "0")}`;
}
