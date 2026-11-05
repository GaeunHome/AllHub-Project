import { describe, expect, it } from "vitest";
import { dividendsView } from "../dividends-view";

const TODAY = "2026-10-29";

describe("dividendsView：投資頁的除權息卡片", () => {
  const HELD = [
    { symbol: "006208", name: "富邦台50", shares: 600 },
    { symbol: "006208", name: "富邦台50", shares: 400 },
    { symbol: "00679B", name: "元大美債20年", shares: 333 },
    { symbol: "2882", name: "國泰金", shares: 1000 },
  ];

  it("自己持有、今天以後除權息的照日期排；股數跨帳戶合計估金額（1000 股 × 1.72 = $1,720、333 股 × 0.141 = 46.953 捨去成 $46）", () => {
    const view = dividendsView(
      HELD,
      [
        { symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare: "1.72" },
        { symbol: "00679B", exDate: "2026-10-29", kind: "cash", cashPerShare: "0.141" },
        { symbol: "0056", exDate: "2026-11-02", kind: "cash", cashPerShare: "1" },
        { symbol: "006208", exDate: "2026-10-22", kind: "cash", cashPerShare: "1.5" },
      ],
      TODAY,
    );

    expect(view).toEqual({
      status: "ready",
      rows: [
        { symbol: "00679B", name: "元大美債20年", exDate: "2026-10-29", kind: "cash", daysLeft: 0, lastBuyToday: false, cashPerShare: "0.141", estimate: 46 },
        { symbol: "006208", name: "富邦台50", exDate: "2026-11-18", kind: "cash", daysLeft: 20, lastBuyToday: false, cashPerShare: "1.72", estimate: 1720 },
      ],
    });
  });

  it("最後買進日是除息日前一個工作日：10/30（五）時，11/2（一）除息的今天最後買進，11/3（二）除息的還不是", () => {
    const view = dividendsView(
      HELD,
      [
        { symbol: "006208", exDate: "2026-11-02", kind: "cash", cashPerShare: "1.72" },
        { symbol: "00679B", exDate: "2026-11-03", kind: "cash", cashPerShare: "0.141" },
      ],
      "2026-10-30",
    );

    expect(view?.status === "ready" && view.rows.map((row) => [row.symbol, row.daysLeft, row.lastBuyToday])).toEqual([
      ["006208", 3, true],
      ["00679B", 4, false],
    ]);
  });

  it("金額還沒公布、只有除權_不估金額", () => {
    const view = dividendsView(
      HELD,
      [
        { symbol: "006208", exDate: "2026-11-18", kind: "cash", cashPerShare: null },
        { symbol: "2882", exDate: "2026-11-06", kind: "stock", cashPerShare: null },
      ],
      TODAY,
    );

    expect(view?.status === "ready" && view.rows.map((row) => [row.symbol, row.cashPerShare, row.estimate])).toEqual([
      ["2882", null, null],
      ["006208", null, null],
    ]);
  });

  it("預告表讀不到_有持股時說暫時讀不到；沒有持股時整張卡片不顯示", () => {
    expect(dividendsView(HELD, null, TODAY)).toEqual({ status: "unavailable" });
    expect(dividendsView([], null, TODAY)).toBeNull();
  });

  it("持股都還沒有要除權息（或都過了）_整張卡片不顯示", () => {
    expect(dividendsView(HELD, [], TODAY)).toBeNull();
    expect(dividendsView(HELD, [{ symbol: "006208", exDate: "2026-10-28", kind: "cash", cashPerShare: "1.72" }], TODAY)).toBeNull();
  });
});
