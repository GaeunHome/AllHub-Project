import { describe, expect, it, vi } from "vitest";
import { fakeFetch, type FakeFetchCall } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { fetchQuotes, findQuote } from "./quotes";

// 回應的形狀照證交所與櫃買中心 OpenAPI 的真實回應 只留用得到的欄位
// 真的清單上市約 1,381 筆 上櫃約 1,012 筆 不到 100 筆會當成那個來源出錯 所以補上別的股票
const TWSE_NAMED = [
  { Date: "1151014", Code: "0050", Name: "元大台灣50", ClosingPrice: "113.00" },
  { Date: "1151014", Code: "006208", Name: "富邦台50", ClosingPrice: "258.70" },
];
const TPEX_NAMED = [{ Date: "1151014", SecuritiesCompanyCode: "00679B", CompanyName: "元大美債20年", Close: "25.05" }];
const TWSE = [...TWSE_NAMED, ...Array.from({ length: 100 }, (_, i) => ({ Date: "1151014", Code: String(1101 + i), Name: `上市股票${i}`, ClosingPrice: "10.00" }))];
const TPEX = [...TPEX_NAMED, ...Array.from({ length: 100 }, (_, i) => ({ Date: "1151014", SecuritiesCompanyCode: String(3201 + i), CompanyName: `上櫃股票${i}`, Close: "20.00" }))];

type Answer = unknown | Error | Response;

function exchanges(twse: Answer, tpex: Answer) {
  const reply = (answer: Answer) => (answer instanceof Error ? Promise.reject(answer) : answer instanceof Response ? answer : Response.json(answer));
  return fakeFetch(({ url }: FakeFetchCall) => {
    const host = new URL(url).host;
    if (host === "openapi.twse.com.tw") return reply(twse);
    if (host === "www.tpex.org.tw") return reply(tpex);
    throw new Error(`沒有預期的網址 ${url}`);
  });
}

const named = (quotes: { symbol: string }[]) => quotes.filter((quote) => ["0050", "006208", "00679B"].includes(quote.symbol));

describe("fetchQuotes（證交所與櫃買中心的收盤價）", () => {
  it("兩個清單都讀到_合在一起、complete 是 true；只打 OpenAPI 的兩個端點（不碰 www.twse.com.tw）", async () => {
    const fetch = exchanges(TWSE, TPEX);

    const result = await fetchQuotes(fetch.impl);

    expect(result).toMatchObject({ ok: true, complete: true });
    expect(result.ok && named(result.quotes)).toEqual([
      { symbol: "0050", name: "元大台灣50", closeCents: 11_300, date: "2026-10-14", market: "twse" },
      { symbol: "006208", name: "富邦台50", closeCents: 25_870, date: "2026-10-14", market: "twse" },
      { symbol: "00679B", name: "元大美債20年", closeCents: 2505, date: "2026-10-14", market: "tpex" },
    ]);
    expect(result.ok && result.quotes).toHaveLength(203);
    expect([...fetch.urls].sort()).toEqual(["https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"]);
  });

  it("每個來源最多等 8 秒（頁面在等股價，兩個來源同時讀）", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await fetchQuotes(exchanges(TWSE, TPEX).impl);

    expect(timeout.mock.calls).toEqual([[8_000], [8_000]]);
  });

  it("證交所回 500_只回櫃買的、complete 是 false；log 記來源與狀態碼，不記回應內容", async () => {
    const log = captureErrorLog();

    const result = await fetchQuotes(exchanges(new Response("secret-detail", { status: 500 }), TPEX).impl);

    expect(result).toMatchObject({ ok: true, complete: false });
    expect(result.ok && named(result.quotes).map((quote) => quote.symbol)).toEqual(["00679B"]);
    expect(loggedText(log)).toContain("證交所");
    expect(loggedText(log)).toContain("500");
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("回應不是陣列（對方改版或錯誤頁）_當成那個來源讀不到", async () => {
    captureErrorLog();

    const result = await fetchQuotes(exchanges(TWSE, { message: "rate limited" }).impl);

    expect(result).toMatchObject({ ok: true, complete: false });
    expect(result.ok && named(result.quotes).map((quote) => quote.symbol)).toEqual(["0050", "006208"]);
  });

  it("清單不到 100 筆（只回了一部分）_當成那個來源讀不到；log 記來源", async () => {
    const log = captureErrorLog();

    const result = await fetchQuotes(exchanges(TWSE_NAMED, TPEX).impl);

    expect(result).toMatchObject({ ok: true, complete: false });
    expect(result.ok && named(result.quotes).map((quote) => quote.symbol)).toEqual(["00679B"]);
    expect(loggedText(log)).toContain("證交所");
  });

  it("兩個都讀不到（連不上、逾時）_ok 是 false", async () => {
    const log = captureErrorLog();

    expect(await fetchQuotes(exchanges(new TypeError("fetch failed"), new DOMException("timeout", "TimeoutError")).impl)).toEqual({ ok: false });
    expect(loggedText(log)).toContain("TypeError");
    expect(loggedText(log)).toContain("TimeoutError");
  });
});

describe("findQuote（新增持股時確認代號）", () => {
  it("上市與上櫃的代號都找得到", async () => {
    expect(await findQuote("006208", exchanges(TWSE, TPEX).impl)).toEqual({ quote: { symbol: "006208", name: "富邦台50", closeCents: 25_870, date: "2026-10-14", market: "twse" } });
    expect(await findQuote("00679B", exchanges(TWSE, TPEX).impl)).toMatchObject({ quote: { symbol: "00679B", market: "tpex" } });
  });

  it("兩個清單同時讀：上市的回應還沒到之前，上櫃的請求就已經送出", async () => {
    captureErrorLog();
    let markTpexAsked = () => {};
    const tpexAsked = new Promise<void>((resolve) => (markTpexAsked = resolve));
    const fetch = fakeFetch(({ url }) => {
      if (url.includes("tpex")) {
        markTpexAsked();
        return Response.json(TPEX);
      }
      // 上市讀完才讀上櫃的話 這裡等不到上櫃的請求
      return Promise.race([tpexAsked.then(() => Response.json(TWSE)), new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("沒有同時讀")), 500))]);
    });

    expect(await findQuote("006208", fetch.impl)).toMatchObject({ quote: { symbol: "006208" } });
  });

  it("兩邊都讀到了還是沒有_complete 是 true（查無此代號）", async () => {
    expect(await findQuote("9999", exchanges(TWSE, TPEX).impl)).toEqual({ quote: null, complete: true });
  });

  it("有一個清單讀不到或不到 100 筆又沒找到_complete 是 false（不能說查無此代號）", async () => {
    captureErrorLog();

    expect(await findQuote("2330", exchanges(new TypeError("fetch failed"), TPEX).impl)).toEqual({ quote: null, complete: false });
    expect(await findQuote("2330", exchanges(TWSE_NAMED, TPEX).impl)).toEqual({ quote: null, complete: false });
  });
});
