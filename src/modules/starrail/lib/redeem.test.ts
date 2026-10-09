import { describe, expect, it } from "vitest";
import { interpretRedeem, normalizeRedeemCode, redeemCookieProblem } from "./redeem";

describe("normalizeRedeemCode：兌換碼先整理再送出", () => {
  it("轉大寫、去掉空白（含全形空白）", () => {
    expect(normalizeRedeemCode(" starrail gift ")).toEqual({ ok: true, code: "STARRAILGIFT" });
    expect(normalizeRedeemCode("5s6z　hrwn gpj5\n")).toEqual({ ok: true, code: "5S6ZHRWNGPJ5" });
  });

  it("全形英數字換成半形", () => {
    expect(normalizeRedeemCode("ＳＴＡＲ２０２６")).toEqual({ ok: true, code: "STAR2026" });
  });

  it("沒輸入_請輸入兌換碼", () => {
    expect(normalizeRedeemCode("   ")).toEqual({ ok: false, error: "請輸入兌換碼" });
  });

  it("有英數字以外的字元，或長度不在 6–20 個字之間_不送出", () => {
    for (const input of ["STAR-RAIL", "星穹鐵道GIFT", "ABC12", "A".repeat(21), "<script>"]) {
      expect(normalizeRedeemCode(input)).toEqual({ ok: false, error: "兌換碼是 6–20 個英文字母或數字" });
    }
  });
});

describe("redeemCookieProblem：兌換要用 cookie_token_v2 與帳號 id", () => {
  it("cookie_token_v2 加上 account_id_v2 或 account_mid_v2_可以兌換", () => {
    expect(redeemCookieProblem("ltoken_v2=a; ltuid_v2=1; cookie_token_v2=c; account_id_v2=1")).toBeNull();
    expect(redeemCookieProblem("ltoken_v2=a; ltuid_v2=1; cookie_token_v2=c; account_mid_v2=m")).toBeNull();
  });

  it("缺欄位_提示重新連結並一起貼上，訊息列出缺少的欄位、不帶 cookie 內容", () => {
    const message = redeemCookieProblem("ltoken_v2=secret-value; ltuid_v2=1");

    expect(message).toContain("cookie_token_v2");
    expect(message).toContain("account_id_v2");
    expect(message).toContain("重新連結");
    expect(message).not.toContain("secret-value");
    expect(redeemCookieProblem("ltoken_v2=a; ltuid_v2=1; account_id_v2=1")).toContain("cookie_token_v2");
    expect(redeemCookieProblem("ltoken_v2=a; ltuid_v2=1; cookie_token_v2=c")).toContain("account_id_v2");
  });
});

describe("interpretRedeem：兌換結果的代碼對應中文訊息", () => {
  const result = (retcode: number, message = "english detail") => interpretRedeem({ retcode, message, data: null });

  it("成功_獎勵會寄到遊戲內信箱", () => {
    expect(result(0)).toMatchObject({ ok: true, retcode: 0, cookieInvalid: false });
    expect(result(0).message).toContain("遊戲內信箱");
  });

  it.each([
    [-2003, "兌換碼無效"],
    [-2004, "兌換碼無效"],
    [-1065, "兌換碼無效"],
    [-2014, "兌換碼無效"],
    [-2001, "兌換碼已過期"],
    [-2006, "兌換碼的使用次數已滿"],
    [-2017, "已經兌換過"],
    [-2018, "已經兌換過"],
    [-2016, "兌換太頻繁"],
    [-2011, "開拓等級不足"],
    [-2021, "開拓等級不足"],
  ])("%i_%s", (retcode, text) => {
    const outcome = result(retcode);

    expect(outcome).toMatchObject({ ok: false, retcode, cookieInvalid: false });
    expect(outcome.message).toContain(text);
    expect(outcome.message).not.toContain("english detail");
  });

  it("太頻繁_提示等約 5 秒", () => {
    expect(result(-2016).message).toContain("5 秒");
  });

  it.each([-100, 10001, -1071])("cookie 失效或沒登入（%i）_標記失效，沿用失效標記流程", (retcode) => {
    expect(result(retcode)).toMatchObject({ ok: false, cookieInvalid: true });
    expect(result(retcode).message).toContain("cookie 已失效");
  });

  it("其他代碼_兌換失敗（代碼 N）", () => {
    expect(result(-9999).message).toBe("兌換失敗（代碼 -9999）");
  });

  it("連不上或格式不對_不丟錯", () => {
    expect(interpretRedeem({ localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" })).toMatchObject({ ok: false, retcode: null, message: expect.stringContaining("連不上") });
    expect(interpretRedeem("<html>")).toMatchObject({ ok: false, retcode: null });
  });
});
