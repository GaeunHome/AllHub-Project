import { describe, expect, it } from "vitest";
import { accountDeleteWarning, sortByNextDate } from "./settings-display";

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

  it("證券帳戶有持股：持股也會一起刪除（跟固定收支一起寫出數量）", () => {
    expect(accountDeleteWarning("臺銀證券", { ...usage, holdingCount: 2, recurringCount: 1 })).toContain("這個帳戶的所有紀錄和 2 檔持股、1 筆固定收支都會一起刪除，無法復原");
    expect(accountDeleteWarning("臺銀證券", { ...usage, hasRecords: false, holdingCount: 1 })).toContain("1 檔持股會一起刪除");
  });
});

describe("sortByNextDate：每月固定頁的固定收支照下一期的日期排", () => {
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
