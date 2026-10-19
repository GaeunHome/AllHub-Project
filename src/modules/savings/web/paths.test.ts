import { describe, expect, it } from "vitest";
import { recordsHref } from "./paths";

describe("紀錄頁的網址", () => {
  it("本月不帶月份；帳戶與分類照紀錄頁認得的參數帶上", () => {
    expect(recordsHref()).toBe("/savings/records");
    expect(recordsHref({ month: "2026-08", account: 4 })).toBe("/savings/records?month=2026-08&account=4");
  });
});
