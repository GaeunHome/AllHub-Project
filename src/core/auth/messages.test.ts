import { describe, expect, it } from "vitest";
import { credentialsHint, safeNextPath } from "./messages";

describe("登入錯誤的補充說明", () => {
  it("其他錯誤或沒有錯誤_不補充", () => {
    expect(credentialsHint("暫時無法登入，請稍後再試")).toBeNull();
    expect(credentialsHint(undefined)).toBeNull();
  });
});

describe("登入後回去的頁面：網址誰都能改，只能回站內", () => {
  it("群組連結這類站內路徑照收", () => {
    expect(safeNextPath("/travel/join/12/abc_DEF-123")).toBe("/travel/join/12/abc_DEF-123");
  });

  it.each(["https://evil.example.com", "//evil.example.com", "/\\\\evil.example.com", "javascript:alert(1)", "", "travel/join", "/a?b=https://evil.example.com", "/a\nb"])("%s 回首頁", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
