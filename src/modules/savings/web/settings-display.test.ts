import { describe, expect, it } from "vitest";
import { accountDeleteWarning, accountDetail, purposeDeleteWarning } from "./settings-display";

const base = { monthlyPlan: null, targetAmount: null, dueDay: null, payFromName: null };

describe("accountDetail：設定頁帳戶那一列的說明", () => {
  it("存款與投資：類型、每月規劃、目標（有設才寫）", () => {
    expect(accountDetail({ ...base, kind: "deposit", monthlyPlan: 5000, targetAmount: 100000 })).toBe("存款 · 每月規劃 $5,000 · 目標 $100,000");
    expect(accountDetail({ ...base, kind: "investment" })).toBe("投資");
  });

  it("信用卡：繳款日與扣款帳戶", () => {
    expect(accountDetail({ ...base, kind: "credit", dueDay: 6, payFromName: "國泰" })).toBe("信用卡 · 每月 6 日繳款 · 從「國泰」扣款");
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
