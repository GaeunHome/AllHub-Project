import { describe, expect, it, vi } from "vitest";
import { fakeFetch, type FakeFetchCall } from "@/dev/fake-fetch";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { fetchDividends } from "../dividends";

// 回應的形狀照證交所與櫃買中心 OpenAPI 的真實回應 只留用得到的欄位
// 預告表只有幾十筆 也可能更少 不設最少筆數
const TWSE = [
  { Date: "1151022", Code: "0056", Name: "元大高股息", Exdividend: "息", CashDividend: "1.720000" },
  { Date: "1151106", Code: "00400A", Name: "主動國泰動能高息", Exdividend: "息", CashDividend: "" },
];
const TPEX = [{ ExRrightsExDividendDate: "1151103", SecuritiesCompanyCode: "00950B", CompanyName: "凱基A級公司債", ExRrightsExDividend: "除息", CashDividend: "尚未公告" }];

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

describe("fetchDividends（證交所與櫃買中心的除權除息預告表）", () => {
  it("兩份都讀到_合在一起照日期排、complete 是 true；只打 OpenAPI 的兩個端點（不碰證交所網站）", async () => {
    const fetch = exchanges(TWSE, TPEX);

    expect(await fetchDividends({ fetchImpl: fetch.impl })).toEqual({
      ok: true,
      complete: true,
      events: [
        { symbol: "0056", exDate: "2026-10-22", kind: "cash", cashPerShare: "1.72" },
        { symbol: "00950B", exDate: "2026-11-03", kind: "cash", cashPerShare: null },
        { symbol: "00400A", exDate: "2026-11-06", kind: "cash", cashPerShare: null },
      ],
    });
    expect([...fetch.urls].sort()).toEqual(["https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL", "https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost"]);
  });

  it("兩份同時讀、各自逾時：頁面在等時各等 8 秒，排程可以給更久", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await fetchDividends({ fetchImpl: exchanges(TWSE, TPEX).impl });
    expect(timeout.mock.calls).toEqual([[8_000], [8_000]]);

    timeout.mockClear();
    await fetchDividends({ timeoutMs: 15_000, fetchImpl: exchanges(TWSE, TPEX).impl });
    expect(timeout.mock.calls).toEqual([[15_000], [15_000]]);
  });

  it("上櫃的請求不用等上市的回應才送出", async () => {
    captureErrorLog();
    let markTpexAsked = () => {};
    const tpexAsked = new Promise<void>((resolve) => (markTpexAsked = resolve));
    const fetch = fakeFetch(({ url }) => {
      if (url.includes("tpex")) {
        markTpexAsked();
        return Response.json(TPEX);
      }
      return Promise.race([tpexAsked.then(() => Response.json(TWSE)), new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("沒有同時讀")), 500))]);
    });

    expect(await fetchDividends({ fetchImpl: fetch.impl })).toMatchObject({ ok: true, complete: true });
  });

  it("證交所回 500_只回櫃買的、complete 是 false；log 記來源與狀態碼，不記回應內容", async () => {
    const log = captureErrorLog();

    const result = await fetchDividends({ fetchImpl: exchanges(new Response("secret-detail", { status: 500 }), TPEX).impl });

    expect(result).toEqual({ ok: true, complete: false, events: [{ symbol: "00950B", exDate: "2026-11-03", kind: "cash", cashPerShare: null }] });
    expect(loggedText(log)).toContain("證交所");
    expect(loggedText(log)).toContain("500");
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("回應不是陣列（對方改版或錯誤頁）_當成那個來源讀不到；空的清單照常（只是最近沒有除權息）", async () => {
    captureErrorLog();

    expect(await fetchDividends({ fetchImpl: exchanges([], { message: "rate limited" }).impl })).toEqual({ ok: true, complete: false, events: [] });
    expect(await fetchDividends({ fetchImpl: exchanges([], []).impl })).toEqual({ ok: true, complete: true, events: [] });
  });

  it("證交所有資料但一列都讀不出來（欄位改了名字）_當成讀不到、記 log，不當成最近沒有除權息", async () => {
    const log = captureErrorLog();
    const renamed = TWSE.map(({ Code, ...row }) => ({ ...row, StockNo: Code }));

    expect(await fetchDividends({ fetchImpl: exchanges(renamed, TPEX).impl })).toEqual({ ok: true, complete: false, events: [{ symbol: "00950B", exDate: "2026-11-03", kind: "cash", cashPerShare: null }] });
    expect(loggedText(log)).toContain("證交所");
    expect(loggedText(log)).toContain("DividendFormatError");
  });

  it("兩份都讀不到（連不上、逾時）_ok 是 false，log 只記錯誤種類", async () => {
    const log = captureErrorLog();

    expect(await fetchDividends({ fetchImpl: exchanges(new TypeError("fetch failed"), new DOMException("timeout", "TimeoutError")).impl })).toEqual({ ok: false });
    expect(loggedText(log)).toContain("TypeError");
    expect(loggedText(log)).toContain("TimeoutError");
  });
});
