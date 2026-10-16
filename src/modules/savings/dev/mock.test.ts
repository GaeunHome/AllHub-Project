import { describe, expect, it } from "vitest";
import { handle, tpexQuotes, twseQuotes } from "./mock.mjs";

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
    expect(handle({ url: new URL("http://127.0.0.1:4010/helix/users"), json })).toBe(false);
    expect(sent.map(Array.isArray)).toEqual([true, true]);
  });
});
