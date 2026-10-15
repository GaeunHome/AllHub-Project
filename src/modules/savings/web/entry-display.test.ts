import { describe, expect, it } from "vitest";
import { entryDetails, entryTitle, scheduleLabel, signedAmount } from "./entry-display";

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

describe("signedAmount：金額帶正負號與語氣", () => {
  it("收入是 + 而且用綠色", () => {
    expect(signedAmount("income", 43000)).toEqual({ text: "+$43,000", tone: "income" });
  });

  it("支出是 -", () => {
    expect(signedAmount("expense", 120)).toEqual({ text: "-$120", tone: "expense" });
  });

  it("轉帳不帶符號、調整照差額的正負號，兩種都是中性的顏色", () => {
    expect(signedAmount("transfer", 2500)).toEqual({ text: "$2,500", tone: "neutral" });
    expect(signedAmount("adjust", -350)).toEqual({ text: "-$350", tone: "neutral" });
    expect(signedAmount("adjust", 1200)).toEqual({ text: "+$1,200", tone: "neutral" });
  });

  it("信用卡的調整寫未繳的增減：餘額 +480 是未繳少了 480（-$480），不會讀成欠更多", () => {
    expect(signedAmount("adjust", 480, "credit")).toEqual({ text: "-$480", tone: "neutral" });
    expect(signedAmount("adjust", -500, "credit")).toEqual({ text: "+$500", tone: "neutral" });
    expect(signedAmount("expense", 120, "credit")).toEqual({ text: "-$120", tone: "expense" });
  });
});

describe("scheduleLabel：固定收支的日期", () => {
  it("每月幾日", () => {
    expect(scheduleLabel(6)).toBe("每月 6 日");
    expect(scheduleLabel(31)).toBe("每月 31 日");
  });
});
