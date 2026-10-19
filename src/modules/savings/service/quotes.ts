import "server-only";
import { logError } from "@/core/errors";
import { readExternalJson } from "@/core/external-url";
import { parseTpexQuotes, parseTwseQuotes, type Quote } from "../lib/quotes";

// 證交所與櫃買中心的 OpenAPI 一天更新一次前一個交易日的收盤價
// 不呼叫證交所網站的端點 使用條款不准程式下載 所以也沒有歷史股價

type Source = { label: string; url: string; parse: (json: unknown) => Quote[] };

const SOURCES: Source[] = [
  { label: "證交所", url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", parse: parseTwseQuotes },
  { label: "櫃買中心", url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", parse: parseTpexQuotes },
];

// 頁面在等股價 兩個來源同時讀 各自等不到就放棄
const SOURCE_TIMEOUT_MS = 8_000;
// 真的清單上市約 1,381 筆 上櫃約 1,012 筆 太少多半是對方只回了一部分
const MIN_QUOTES = 100;

/** 只回了一部分的清單當成讀不到 不然會說查無此代號 也會快取一整個小時 */
class QuoteShortError extends Error {
  name = "QuoteShortError";
  constructor(readonly count: number) {
    super(`只有 ${count} 筆`);
  }
}

/** 讀不到回 null log 只記錯誤種類 狀態碼與筆數 不記回應內容 */
async function readSource(source: Source, fetchImpl?: typeof fetch): Promise<Quote[] | null> {
  const what = `讀不到${source.label}的收盤價`;
  const quotes = await readExternalJson(source.url, { module: "savings", what, parse: source.parse, timeoutMs: SOURCE_TIMEOUT_MS, fetchImpl });
  if (quotes === null) return null;
  if (quotes.length < MIN_QUOTES) {
    logError("savings", what, new QuoteShortError(quotes.length), quotes.length);
    return null;
  }
  return quotes;
}

/** 兩個都讀不到才是 ok false 只讀到一個時回那一個 complete 是 false */
export async function fetchQuotes(fetchImpl?: typeof fetch): Promise<{ ok: true; quotes: Quote[]; complete: boolean } | { ok: false }> {
  const results = await Promise.all(SOURCES.map((source) => readSource(source, fetchImpl)));
  if (results.every((quotes) => quotes === null)) return { ok: false };
  return { ok: true, quotes: results.flatMap((quotes) => quotes ?? []), complete: results.every((quotes) => quotes !== null) };
}

/** 新增持股時確認代號 有一個清單沒讀到就不能說查無此代號 */
export async function findQuote(symbol: string, fetchImpl?: typeof fetch): Promise<{ quote: Quote } | { quote: null; complete: boolean }> {
  const result = await fetchQuotes(fetchImpl);
  if (!result.ok) return { quote: null, complete: false };
  const quote = result.quotes.find((candidate) => candidate.symbol === symbol);
  return quote ? { quote } : { quote: null, complete: result.complete };
}
