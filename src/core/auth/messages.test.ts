import { describe, expect, it } from "vitest";
import { credentialsHint } from "./messages";

describe("登入錯誤的補充說明", () => {
  it("其他錯誤或沒有錯誤_不補充", () => {
    expect(credentialsHint("暫時無法登入，請稍後再試")).toBeNull();
    expect(credentialsHint(undefined)).toBeNull();
  });
});
