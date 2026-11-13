import { describe, expect, it } from "vitest";
import { parseTwdRates, rateDay, ratesUrls } from "../rates";

// 格式照 fawazahmed0/exchange-api 2026-11-12 的真實回應 數字取其中幾個
// 答案用 Python 的 Decimal 算 1 除以回應的數字 四捨五入到六位小數
const RESPONSE = { date: "2026-11-12", twd: { jpy: 4.84626282, vnd: 778.93281838, usd: 0.030315355, krw: 40.35807312, twd: 1, btc: 0.0000003 } };

describe("parseTwdRates（使用者要的：記外幣時自動帶入國際中間價）", () => {
  it("回應是 1 台幣換多少外幣_換成 1 外幣等於幾台幣，四捨五入到六位小數", () => {
    expect(parseTwdRates(RESPONSE)).toEqual({ date: "2026-11-12", rates: { JPY: "0.206345", VND: "0.001284", USD: "32.986584", KRW: "0.024778" } });
  });

  it("分帳沒有的貨幣不收；0、負數與不是數字的跳過", () => {
    const parsed = parseTwdRates({ date: "2026-11-12", twd: { jpy: 0, eur: -1, gbp: "abc", hkd: null, usd: 0.030315355 } });

    expect(parsed?.rates).toEqual({ USD: "32.986584" });
  });

  it("不是這個格式_回 null", () => {
    expect(parseTwdRates({ date: "2026-11-12" })).toBeNull();
    expect(parseTwdRates({ twd: { usd: 0.03 } })).toBeNull();
    expect(parseTwdRates("oops")).toBeNull();
  });
});

describe("ratesUrls", () => {
  it("先問 jsDelivr、再問 Cloudflare 的備援（官方說明要有備援）", () => {
    expect(ratesUrls("latest")).toEqual(["https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/twd.json", "https://latest.currency-api.pages.dev/v1/currencies/twd.json"]);
    expect(ratesUrls("2026-10-01")).toEqual([
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-01/v1/currencies/twd.json",
      "https://2026-10-01.currency-api.pages.dev/v1/currencies/twd.json",
    ]);
  });
});

describe("rateDay（使用者選的：每一筆都帶那筆日期的匯率）", () => {
  it("以前的日期用那一天的；今天與之後還沒有那天的匯率，用最新的", () => {
    expect(rateDay("2026-11-12", "2026-11-13")).toBe("2026-11-12");
    expect(rateDay("2026-11-13", "2026-11-13")).toBe("latest");
    expect(rateDay("2026-12-01", "2026-11-13")).toBe("latest");
  });
});
