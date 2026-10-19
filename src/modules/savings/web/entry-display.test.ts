import { describe, expect, it } from "vitest";
import { entryDetails, entryTitle, recordDetails, recordTitle, signedAmount } from "./entry-display";

const names = { accountName: "國泰", counterAccountName: null, categoryName: null, note: null };

describe("entryTitle：紀錄與固定收支那一列的名稱", () => {
  it("收入與支出_用分類的名稱，沒有分類也沒有備註是「未分類」", () => {
    expect(entryTitle({ ...names, kind: "expense", categoryName: "餐飲", note: "午餐" })).toBe("餐飲");
    expect(entryTitle({ ...names, kind: "income", categoryName: null })).toBe("未分類");
  });

  it("沒有分類但有備註_備註當名稱（比一排「未分類」認得出是哪一筆）", () => {
    expect(entryTitle({ ...names, kind: "expense", note: "高鐵票" })).toBe("高鐵票");
  });

  it("轉帳_寫出從哪裡轉到哪裡（另一邊刪掉了也寫得出來）", () => {
    expect(entryTitle({ ...names, kind: "transfer", counterAccountName: "郵局", note: "發薪分配" })).toBe("國泰 → 郵局");
    expect(entryTitle({ ...names, kind: "transfer" })).toBe("國泰 → 已刪除的帳戶");
  });

  it("調整_叫「調整」；信用卡的調整是未繳的增減，叫「調整未繳」", () => {
    expect(entryTitle({ ...names, kind: "adjust" })).toBe("調整");
    expect(entryTitle({ ...names, kind: "adjust" }, "credit")).toBe("調整未繳");
  });
});

describe("entryDetails：名稱下面那一行（帳戶與備註）", () => {
  it("收支：帳戶、備註", () => {
    expect(entryDetails({ ...names, kind: "expense", categoryName: "餐飲", note: "午餐" })).toEqual(["國泰", "午餐"]);
    expect(entryDetails({ ...names, kind: "expense", categoryName: "餐飲" })).toEqual(["國泰"]);
  });

  it("沒有分類：備註已經當名稱，這一行改寫「未分類」與帳戶；沒有備註時只寫帳戶（名稱已經是未分類）", () => {
    expect(entryDetails({ ...names, kind: "expense", note: "高鐵票" })).toEqual(["未分類", "國泰"]);
    expect(entryDetails({ ...names, kind: "income" })).toEqual(["國泰"]);
  });

  it("轉帳：帳戶已經寫在名稱裡，只剩備註", () => {
    expect(entryDetails({ ...names, kind: "transfer", counterAccountName: "郵局", note: "發薪分配" })).toEqual(["發薪分配"]);
  });

  it("調整：帳戶", () => {
    expect(entryDetails({ ...names, kind: "adjust" })).toEqual(["國泰"]);
  });
});

describe("買賣持股的紀錄", () => {
  const trade = { ...names, kind: "transfer" as const, accountName: "台銀", counterAccountName: "臺銀證券", recurring: false, recurringName: null };

  it("名稱寫買進或賣出、代號與股數，例如「買進 006208 · 12 股」；股數上千加千分位", () => {
    expect(recordTitle({ ...trade, shares: 12, holdingSymbol: "006208" })).toBe("買進 006208 · 12 股");
    expect(recordTitle({ ...trade, shares: -5, holdingSymbol: "0050" })).toBe("賣出 0050 · 5 股");
    expect(recordTitle({ ...trade, shares: 1500, holdingSymbol: "006208" })).toBe("買進 006208 · 1,500 股");
  });

  it("持股已經刪掉（沒有代號）_照樣寫得出買進幾股", () => {
    expect(recordTitle({ ...trade, shares: 12, holdingSymbol: null })).toBe("買進 · 12 股");
  });

  it("下面那一行寫從哪個帳戶到哪個帳戶；沒改過的預設備註跟名稱重複，不再寫一次，自己寫的備註照寫", () => {
    expect(recordDetails({ ...trade, shares: 12, holdingSymbol: "006208", note: "買進 006208 12 股" })).toEqual(["台銀 → 臺銀證券"]);
    expect(recordDetails({ ...trade, shares: 12, holdingSymbol: "006208", note: "加碼" })).toEqual(["台銀 → 臺銀證券", "加碼"]);
  });

  it("一般的轉帳（沒有股數）_照轉帳的寫法", () => {
    const transfer = { ...trade, shares: null, holdingSymbol: null, note: "存錢" };

    expect(recordTitle(transfer)).toBe("台銀 → 臺銀證券");
    expect(recordDetails(transfer)).toEqual(["存錢"]);
  });
});

describe("固定收支記的紀錄：寫規則的名稱（一般文字）", () => {
  const record = { ...names, kind: "expense" as const, categoryName: "訂閱", shares: null, holdingSymbol: null, recurring: true };

  it("有名稱_寫在說明的最後", () => {
    expect(recordDetails({ ...record, recurringName: "電費" })).toEqual(["國泰", "電費"]);
  });

  it("規則沒有名稱（舊資料）_寫「固定收支」", () => {
    expect(recordDetails({ ...record, recurringName: null })).toEqual(["國泰", "固定收支"]);
  });

  it("名稱就是這筆的備註（沒有備註的規則用名稱當備註）_不重複，改寫「固定收支」", () => {
    expect(recordDetails({ ...record, note: "Netflix", recurringName: "Netflix" })).toEqual(["國泰", "Netflix", "固定收支"]);
  });

  it("名稱跟這一列的名稱一樣（例如分類與規則都叫薪水）_不重複，改寫「固定收支」", () => {
    expect(recordDetails({ ...record, kind: "income", categoryName: "薪水", recurringName: "薪水" })).toEqual(["國泰", "固定收支"]);
  });

  it("定期定額買進_帳戶之後接規則的名稱", () => {
    expect(recordDetails({ ...record, kind: "transfer", accountName: "台銀", counterAccountName: "臺銀證券", categoryName: null, shares: 3, holdingSymbol: "006208", note: null, recurringName: "006208 定期定額" })).toEqual([
      "台銀 → 臺銀證券",
      "006208 定期定額",
    ]);
  });
});

describe("signedAmount：紀錄頁的金額", () => {
  it("收入帶 +、支出帶 -", () => {
    expect(signedAmount("income", 43000)).toBe("+$43,000");
    expect(signedAmount("expense", 120)).toBe("-$120");
  });

  it("轉帳不帶符號、調整照差額的正負號", () => {
    expect(signedAmount("transfer", 2500)).toBe("$2,500");
    expect(signedAmount("adjust", -350)).toBe("-$350");
    expect(signedAmount("adjust", 1200)).toBe("+$1,200");
  });

  it("信用卡的調整寫未繳的增減：餘額 +480 是未繳少了 480（-$480），不會讀成欠更多", () => {
    expect(signedAmount("adjust", 480, "credit")).toBe("-$480");
    expect(signedAmount("adjust", -500, "credit")).toBe("+$500");
    expect(signedAmount("expense", 120, "credit")).toBe("-$120");
  });
});
