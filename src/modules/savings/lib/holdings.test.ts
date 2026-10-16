import { describe, expect, it } from "vitest";
import { accountsWithHoldings, estimateRegularBuy, investmentTotals, removedCost, tradeNote, valueHolding, type HoldingLike } from "./holdings";
import type { Quote } from "./quotes";

const holding = (values: Partial<HoldingLike> & Pick<HoldingLike, "symbol" | "shares" | "cost">): HoldingLike => ({ id: 1, accountId: 7, name: values.symbol, sortOrder: 0, ...values });
const quote = (symbol: string, closeCents: number | null, date = "2026-10-14"): Quote => ({ symbol, name: symbol, closeCents, date, market: "twse" });

describe("valueHolding（市值＝股數 × 收盤價，四捨五入到元）", () => {
  it("006208 12 股、成本 3,000、收盤 258.70_市值 3,104（3,104.4）、損益 +104、+3.5%", () => {
    expect(valueHolding(holding({ symbol: "006208", shares: 12, cost: 3000 }), quote("006208", 25_870))).toEqual({
      holdingId: 1,
      shares: 12,
      cost: 3000,
      value: 3104,
      profit: 104,
      profitPercent: 3.5,
      priced: true,
      closeCents: 25_870,
      date: "2026-10-14",
    });
  });

  it("0050 100 股、成本 12,000、收盤 113.00_市值 11,300、損益 -700、-5.8%", () => {
    expect(valueHolding(holding({ symbol: "0050", shares: 100, cost: 12_000 }), quote("0050", 11_300))).toMatchObject({ value: 11_300, profit: -700, profitPercent: -5.8 });
  });

  it("剛好一半時進位：10 股 × 0.05 是 0.5 元_市值 1；1 股 × 0.05_市值 0", () => {
    expect(valueHolding(holding({ symbol: "00999B", shares: 10, cost: 1 }), quote("00999B", 5)).value).toBe(1);
    expect(valueHolding(holding({ symbol: "00999B", shares: 1, cost: 1 }), quote("00999B", 5)).value).toBe(0);
  });

  it("百分比的四捨五入正負對稱：賺 535 是 +5.4%、賠 535 是 -5.4%（成本 10,000）", () => {
    expect(valueHolding(holding({ symbol: "2330", shares: 1, cost: 10_000 }), quote("2330", 1_053_500)).profitPercent).toBe(5.4);
    expect(valueHolding(holding({ symbol: "2330", shares: 1, cost: 10_000 }), quote("2330", 946_500)).profitPercent).toBe(-5.4);
  });

  it("沒有報價或沒成交_市值用成本、損益 0、priced 是 false（畫面寫股價暫時讀不到）", () => {
    const stock = holding({ symbol: "006208", shares: 12, cost: 3000 });

    expect(valueHolding(stock)).toMatchObject({ value: 3000, profit: 0, priced: false, closeCents: null, date: null });
    expect(valueHolding(stock, quote("006208", null))).toMatchObject({ value: 3000, priced: false });
  });

  it("成本 0（例如配股）_損益百分比是 null", () => {
    expect(valueHolding(holding({ symbol: "006208", shares: 2, cost: 0 }), quote("006208", 25_870))).toMatchObject({ value: 517, profit: 517, profitPercent: null });
  });

  it("股數乘上分超過浮點數能精確表示的整數（2^53）_照樣四捨五入對：999,999,999 股 × 182,731.50 元", () => {
    // 價金是 182,731,499,817,268.5 元 四捨五入是 182,731,499,817,269
    // 直接用浮點數乘會先失去精度 得到 182,731,499,817,268
    expect(valueHolding(holding({ symbol: "2330", shares: 999_999_999, cost: 0 }), quote("2330", 18_273_150)).value).toBe(182_731_499_817_269);
  });
});

describe("investmentTotals（依投資帳戶加總）", () => {
  it("同一個帳戶兩檔加總；有一檔沒報價時 priced 是 false、那一檔用成本；日期是最新的收盤日", () => {
    const totals = investmentTotals(
      [
        holding({ id: 1, symbol: "006208", shares: 120, cost: 27_600 }),
        holding({ id: 2, symbol: "0050", shares: 200, cost: 19_800 }),
        holding({ id: 3, accountId: 8, symbol: "00679B", shares: 100, cost: 2600 }),
      ],
      [quote("006208", 25_870), quote("0050", 11_300, "2026-10-13")],
    );

    // 31,044 加 22,600 是 53,644 成本 47,400 賺 6,244 約 13.17%
    expect(totals.get(7)).toEqual({ value: 53_644, cost: 47_400, profit: 6244, profitPercent: 13.2, priced: true, date: "2026-10-14", holdings: 2 });
    expect(totals.get(8)).toEqual({ value: 2600, cost: 2600, profit: 0, profitPercent: 0, priced: false, date: null, holdings: 1 });
  });

  it("股價清單讀不到（null）_每一檔都用成本", () => {
    expect(investmentTotals([holding({ symbol: "006208", shares: 120, cost: 27_600 })], null).get(7)).toMatchObject({ value: 27_600, priced: false });
  });
});

describe("accountsWithHoldings（有持股的投資帳戶：市值照股價算，一般轉帳轉進轉出會從總資產消失）", () => {
  it("有任何一檔就算，0 股的也算（市值一樣照持股算）；沒有持股的帳戶不在裡面", () => {
    const set = accountsWithHoldings([holding({ id: 1, accountId: 7, symbol: "006208", shares: 0, cost: 0 }), holding({ id: 2, accountId: 8, symbol: "0050", shares: 3, cost: 300 }), holding({ id: 3, accountId: 8, symbol: "00679B", shares: 1, cost: 26 })]);

    expect([...set].sort()).toEqual([7, 8]);
    expect(set.has(9)).toBe(false);
  });
});

describe("removedCost（賣出時照平均成本移除的成本）", () => {
  it.each([
    [3000, 12, 5, 1250],
    [3000, 12, 7, 1750],
    [3000, 12, 12, 3000],
    [1001, 3, 1, 334],
    [1001, 3, 2, 667],
  ])("成本 %i、%i 股、賣 %i 股_移除 %i", (cost, shares, sold, expected) => {
    expect(removedCost({ cost, shares }, sold)).toBe(expected);
  });

  it("分兩次賣完_移除的合計剛好是全部成本（1,001 元 3 股：先賣 1 股 334，剩 667 元 2 股全賣）", () => {
    const first = removedCost({ cost: 1001, shares: 3 }, 1);

    expect(first + removedCost({ cost: 1001 - first, shares: 2 }, 2)).toBe(1001);
  });

  it("成本 1 億、10 億股、賣 3.3 億股_照樣算準（33,333,333.3 元）", () => {
    expect(removedCost({ cost: 100_000_000, shares: 1_000_000_000 }, 333_333_333)).toBe(33_333_333);
  });
});

// 臺銀證券定期定額存股 手續費每筆 1 元含在金額裡 最小單位 1 股
// https://www.twfhcsec.com.tw/CAMPAIGN1/index
describe("estimateRegularBuy（定期定額確認前先估股數與成本）", () => {
  it("5,000 元買 006208（258.70）_扣 1 元手續費後 4,999 元買 19 股，成本 4,915（4,915.3）＋ 1 ＝ 4,916", () => {
    expect(estimateRegularBuy(5000, 25_870)).toEqual({ shares: 19, cost: 4916 });
  });

  it("1,000 元買 0050（113.00）_8 股，成本 904 ＋ 1 ＝ 905", () => {
    expect(estimateRegularBuy(1000, 11_300)).toEqual({ shares: 8, cost: 905 });
  });

  it("沒有收盤價_null（欄位留空讓使用者填）", () => {
    expect(estimateRegularBuy(5000, null)).toBeNull();
  });

  it("一股都買不到（1,000 元買 2,490 元的台積電）_null", () => {
    expect(estimateRegularBuy(1000, 249_000)).toBeNull();
  });
});

describe("tradeNote（買賣紀錄沒填備註時的寫法）", () => {
  it("SPEC 的寫法：買進 006208 12 股、賣出時寫賣出", () => {
    expect([tradeNote("buy", "006208", 12), tradeNote("sell", "0050", 5)]).toEqual(["買進 006208 12 股", "賣出 0050 5 股"]);
  });
});
