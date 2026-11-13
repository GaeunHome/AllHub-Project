import { describe, expect, it } from "vitest";
import { mockRequest } from "@/dev/mock-request";
import { CURRENCIES, HOME_CURRENCY } from "../../lib/expenses";
import { parseTwdRates, ratesUrls } from "../../lib/rates";
import { handle } from "../mock.mjs";

// 假伺服器要回真實格式的資料 網站照真的解析才看得到東西
describe("匯率的假回應", () => {
  it("jsDelivr 與 Cloudflare 的網址都回應；分帳的每一種外幣都有匯率", async () => {
    for (const url of [...ratesUrls("2026-10-01"), ...ratesUrls("latest")]) {
      const response = await mockRequest(handle, new URL(url).pathname);
      const table = parseTwdRates(response.data);

      expect(table, url).not.toBeNull();
      expect(Object.keys(table!.rates).sort()).toEqual(Object.keys(CURRENCIES).filter((code) => code !== HOME_CURRENCY).sort());
    }
  });

  it("帶日期時回那一天；真的資料開始以前的日期 404，網站才會改用最新的", async () => {
    expect((await mockRequest(handle, new URL(ratesUrls("2026-10-01")[0]).pathname)).data).toMatchObject({ date: "2026-10-01" });
    expect((await mockRequest(handle, new URL(ratesUrls("2024-01-01")[0]).pathname)).status).toBe(404);
  });
});
