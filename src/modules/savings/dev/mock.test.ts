import { describe, expect, it } from "vitest";
import { mergeDividendEvents, parseTpexDividends, parseTwseDividends } from "../lib/dividends";
import { handle, tpexDividends, tpexQuotes, twseDividends, twseQuotes } from "./mock.mjs";

// 假伺服器要回真實格式的資料 E2E 的持股與定期定額估算才看得到東西
// 格式照證交所 STOCK_DAY_ALL 與櫃買 tpex_mainboard_quotes 欄位全是字串
describe("證交所與櫃買中心的假回應", () => {
  const thursday = new Date("2026-10-15T04:00:00Z");
  const twse = twseQuotes(thursday);
  const tpex = tpexQuotes(thursday);
  const close = (code: string) => twse.find((row) => row.Code === code)?.ClosingPrice ?? tpex.find((row) => row.SecuritiesCompanyCode === code)?.Close;

  it("兩個清單都有 100 筆以上（網站把不到 100 筆的清單當成讀不到），代號不重複", () => {
    expect(twse.length).toBeGreaterThanOrEqual(100);
    expect(tpex.length).toBeGreaterThanOrEqual(100);
    const codes = [...twse.map((row) => row.Code), ...tpex.map((row) => row.SecuritiesCompanyCode)];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("SPEC 要的代號都有收盤價：上市 006208、0050，上櫃 00679B；也有沒成交的（證交所空字串、櫃買 ----）", () => {
    for (const code of ["006208", "0050", "00679B"]) expect(close(code), code).toMatch(/^\d+\.\d{2}$/);
    expect(twse.some((row) => row.ClosingPrice === "")).toBe(true);
    expect(tpex.some((row) => row.Close === "----")).toBe(true);
    for (const row of [...twse, ...tpex]) for (const value of Object.values(row)) expect(typeof value).toBe("string");
  });

  it("日期是民國年的前一個交易日：週四是週三，週一是上週五", () => {
    expect(twse[0].Date).toBe("1151014");
    expect(tpexQuotes(new Date("2026-10-19T04:00:00Z"))[0].Date).toBe("1151016");
  });

  it("只接證交所與櫃買的路徑，其他路徑交給別的模組", () => {
    const sent: unknown[] = [];
    const json = (_status: number, data: unknown) => {
      sent.push(data);
      return true;
    };

    expect(handle({ url: new URL("http://127.0.0.1:4010/v1/exchangeReport/STOCK_DAY_ALL"), json })).toBe(true);
    expect(handle({ url: new URL("http://127.0.0.1:4010/openapi/v1/tpex_mainboard_quotes"), json })).toBe(true);
    expect(handle({ url: new URL("http://127.0.0.1:4010/v1/exchangeReport/TWT48U_ALL"), json })).toBe(true);
    expect(handle({ url: new URL("http://127.0.0.1:4010/openapi/v1/tpex_exright_prepost"), json })).toBe(true);
    expect(handle({ url: new URL("http://127.0.0.1:4010/helix/users"), json })).toBe(false);
    expect(sent.map(Array.isArray)).toEqual([true, true, true, true]);
  });
});

// 除權除息預告表 E2E 用持股看投資頁的除權息卡片與 savings:dividends 的通知
describe("證交所與櫃買中心的除權息預告假回應", () => {
  const thursday = new Date("2026-10-29T04:00:00Z");
  const twse = twseDividends(thursday);
  const tpex = tpexDividends(thursday);
  const events = mergeDividendEvents([...parseTwseDividends(twse), ...parseTpexDividends(tpex)]);
  const eventOf = (symbol: string) => events.find((event) => event.symbol === symbol);

  it("欄位跟真的一樣全是字串；代號都在收盤價的清單裡，E2E 新增得了這些持股", () => {
    for (const row of [...twse, ...tpex]) for (const value of Object.values(row)) expect(typeof value).toBe("string");
    const quoted = new Set([...twseQuotes(thursday).map((row) => row.Code), ...tpexQuotes(thursday).map((row) => row.SecuritiesCompanyCode)]);
    const missing = events.map((event) => event.symbol).filter((symbol) => !quoted.has(symbol) && !["8467", "3680"].includes(symbol));
    expect(missing).toEqual([]);
  });

  it("10/29（週四）看：006208 20 天後除息、0056 金額還沒公布、00919 明天除息、2882 只有權；櫃買 00679B 尚未公告、6488 除權息、3105 只有除權；週末挪到週一", () => {
    expect(eventOf("006208")).toEqual({ symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare: "1.72" });
    expect(eventOf("0056")).toEqual({ symbol: "0056", exDate: "2026-11-04", kind: "cash", cashPerShare: null });
    expect(eventOf("00919")).toEqual({ symbol: "00919", exDate: "2026-10-30", kind: "cash", cashPerShare: "0.54" });
    expect(eventOf("2881")).toEqual({ symbol: "2881", exDate: "2026-11-02", kind: "both", cashPerShare: "3" });
    expect(eventOf("2882")).toEqual({ symbol: "2882", exDate: "2026-11-09", kind: "stock", cashPerShare: null });
    expect(eventOf("00679B")).toEqual({ symbol: "00679B", exDate: "2026-11-06", kind: "cash", cashPerShare: null });
    expect(eventOf("6488")).toEqual({ symbol: "6488", exDate: "2026-11-02", kind: "both", cashPerShare: "2.5" });
    expect(eventOf("3105")).toEqual({ symbol: "3105", exDate: "2026-11-09", kind: "stock", cashPerShare: null });
  });

  it("跟真的一樣也列最近已經過去的除息日（0050、00937B）", () => {
    expect(eventOf("0050")?.exDate).toBe("2026-10-22");
    expect(eventOf("00937B")?.exDate).toBe("2026-10-27");
  });
});
