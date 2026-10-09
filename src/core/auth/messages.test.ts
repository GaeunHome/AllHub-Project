import { describe, expect, it } from "vitest";
import { INVALID_CREDENTIALS, credentialsHint } from "./messages";

describe("登入錯誤的補充說明", () => {
  it("帳號或密碼錯誤時_提醒連續輸錯會暫時鎖定（帳號存不存在都一樣，不透露）", () => {
    expect(INVALID_CREDENTIALS).toBe("帳號或密碼錯誤");
    expect(credentialsHint(INVALID_CREDENTIALS)).toBe("同一個帳號連續輸錯幾次後會暫時鎖定，請過一段時間再試；忘記密碼請聯絡站長。");
  });

  it("其他錯誤或沒有錯誤_不補充", () => {
    expect(credentialsHint("暫時無法登入，請稍後再試")).toBeNull();
    expect(credentialsHint(undefined)).toBeNull();
  });
});
