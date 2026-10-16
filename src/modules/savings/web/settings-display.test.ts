import { describe, expect, it } from "vitest";
import { accountDeleteWarning, accountDetail, purposeDeleteWarning, sortByNextDate } from "./settings-display";

const base = { purposeName: null, monthlyPlan: null, targetAmount: null, dueDay: null, statementDay: null, payFromName: null, autopay: false };

describe("accountDetail：設定頁帳戶那一列的說明（已經照類型分組，不再寫類型）", () => {
  it("存款與投資：用途、每月規劃、目標（有設才寫）", () => {
    expect(accountDetail({ ...base, kind: "deposit", purposeName: "緊急預備金", monthlyPlan: 2000, targetAmount: 10000 })).toBe("緊急預備金 · 每月規劃 $2,000 · 目標 $10,000");
    expect(accountDetail({ ...base, kind: "investment" })).toBe("");
  });

  it("信用卡：照一期的順序先寫結帳日再寫截止日，接著扣款帳戶與自動扣繳", () => {
    expect(accountDetail({ ...base, kind: "credit", statementDay: 5, dueDay: 20, payFromName: "生活費帳戶", autopay: true })).toBe("每月 5 日結帳 · 20 日截止 · 從「生活費帳戶」扣款 · 自動扣繳");
  });

  it("信用卡沒有結帳日：只寫截止日", () => {
    expect(accountDetail({ ...base, kind: "credit", dueDay: 25, autopay: true })).toBe("每月 25 日截止 · 自動扣繳");
  });
});

describe("刪除前的確認", () => {
  const usage = { recurringCount: 0, hasRecords: true, hasTransfers: false };

  it("帳戶：說明紀錄與固定收支會一起刪除、無法復原，也提醒可以改成停用", () => {
    const message = accountDeleteWarning("國泰", { ...usage, recurringCount: 2 });

    expect(message).toContain("確定刪除「國泰」？");
    expect(message).toContain("這個帳戶的所有紀錄和 2 筆固定收支都會一起刪除，無法復原");
    expect(message).toContain("可以改成「停用」");
  });

  it("帳戶有跟其他帳戶的轉帳：說明轉帳的兩邊一起刪，其他帳戶的餘額會跟著改變", () => {
    const message = accountDeleteWarning("國泰", { ...usage, hasTransfers: true });

    expect(message).toContain("跟其他帳戶之間的轉帳也會一起刪除，那些帳戶的餘額會跟著改變");
    expect(accountDeleteWarning("國泰", usage)).not.toContain("轉帳");
  });

  it("帳戶沒有固定收支_不提固定收支", () => {
    expect(accountDeleteWarning("郵局", usage)).not.toContain("固定收支");
  });

  it("帳戶還沒有任何紀錄_直接說沒有紀錄，不嚇人", () => {
    const message = accountDeleteWarning("郵局", { ...usage, hasRecords: false });

    expect(message).toBe("確定刪除「郵局」？這個帳戶還沒有任何紀錄。");
    expect(accountDeleteWarning("郵局", { ...usage, hasRecords: false, recurringCount: 1 })).toContain("1 筆固定收支會一起刪除");
  });

  it("用途：用了它的帳戶會改成未設定；沒有帳戶用時只問要不要刪", () => {
    expect(purposeDeleteWarning("生活費", 2)).toBe("確定刪除用途「生活費」？用了這個用途的 2 個帳戶會改成「未設定」，帳戶和紀錄都會留著。");
    expect(purposeDeleteWarning("投資", 0)).toBe("確定刪除用途「投資」？");
  });
});

describe("sortByNextDate：設定頁的固定收支照下一期的日期排", () => {
  const rule = (id: number, nextDate: string | null, fields: { active?: boolean; accountPaused?: boolean } = {}) => ({ id, nextDate, active: true, accountPaused: false, ...fields });

  it("日期早的在前；同一天照建立的順序", () => {
    const sorted = sortByNextDate([rule(1, "2026-11-10"), rule(2, "2026-10-20"), rule(3, "2026-11-05"), rule(4, "2026-10-20")]);

    expect(sorted.map((item) => item.id)).toEqual([2, 4, 3, 1]);
  });

  it("停用的、帳戶停用的沒有下一期，排在最後", () => {
    const sorted = sortByNextDate([rule(1, null, { active: false }), rule(2, "2026-12-01", { accountPaused: true }), rule(3, "2026-12-20")]);

    expect(sorted.map((item) => item.id)).toEqual([3, 1, 2]);
  });
});
