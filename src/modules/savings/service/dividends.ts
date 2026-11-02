import "server-only";
import { readExternalJson } from "@/core/external-url";
import { mergeDividendEvents, parseTpexDividends, parseTwseDividends, type DividendEvent } from "../lib/dividends";

// 證交所與櫃買中心 OpenAPI 的除權除息預告表 只有最近過去與之後兩三週的除息日
// 跟收盤價一樣不呼叫證交所網站的端點

type Source = { label: string; url: string; parse: (json: unknown) => DividendEvent[] };

const SOURCES: Source[] = [
  { label: "證交所", url: "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL", parse: parseTwseDividends },
  { label: "櫃買中心", url: "https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost", parse: parseTpexDividends },
];

// 頁面在等 跟收盤價一樣各等 8 秒 排程沒有人在等 自己傳更久的
const PAGE_TIMEOUT_MS = 8_000;

export type DividendsResult = { ok: true; events: DividendEvent[]; complete: boolean } | { ok: false };

/** 兩個同時讀 都讀不到才是 ok false 只讀到一個時 complete 是 false 預告表本來就可能是空的 */
export async function fetchDividends({ timeoutMs = PAGE_TIMEOUT_MS, fetchImpl }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<DividendsResult> {
  const results = await Promise.all(
    SOURCES.map((source) => readExternalJson(source.url, { module: "savings", what: `讀不到${source.label}的除權息預告`, parse: source.parse, timeoutMs, fetchImpl })),
  );
  if (results.every((events) => events === null)) return { ok: false };
  return { ok: true, events: mergeDividendEvents(results.flatMap((events) => events ?? [])), complete: results.every((events) => events !== null) };
}
