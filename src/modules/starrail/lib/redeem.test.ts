import { describe, expect, it } from "vitest";
import { interpretRedeem, normalizeRedeemCode, redeemCookieProblem, redeemVerdict } from "./redeem";

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

  it("有英數字以外的字元，或長度不在 4–20 個字之間_不送出", () => {
    for (const input of ["STAR-RAIL", "星穹鐵道GIFT", "ABC", "A".repeat(21), "<script>"]) {
      expect(normalizeRedeemCode(input)).toEqual({ ok: false, error: "兌換碼是 4–20 個英文字母或數字" });
    }
  });

  it("真的有只有 5 個字的兌換碼（OMEGA，hoyo-codes 與 ennead 在 2026-10-15 都列為有效）_可以送出", () => {
    expect(normalizeRedeemCode("omega")).toEqual({ ok: true, code: "OMEGA" });
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

// 代碼的意思照 genshin.py 的 genshin/errors.py 與 constants.py 的 GEETEST_RETCODES 2026-10-15 讀取
describe("interpretRedeem：兌換結果的代碼對應中文訊息", () => {
  const result = (retcode: number, message = "english detail") => interpretRedeem({ retcode, message, data: null });

  it("成功_獎勵會寄到遊戲內信箱（畫面的標題已經寫「兌換成功」，說明不再重複）", () => {
    expect(result(0)).toMatchObject({ ok: true, retcode: 0, cookieInvalid: false });
    expect(result(0).message).toBe("獎勵會寄到遊戲內信箱");
  });

  it.each([
    [-2003, "Redemption code is incorrectly formatted", "兌換碼無效"],
    [-1065, "RedemptionInvalid", "兌換碼無效"],
    [-2001, "Redemption code has expired", "兌換碼已過期"],
    [-2006, "Redemption code has reached max usage limit", "兌換碼的使用次數已滿"],
    [-2014, "Redemption code not activated", "還沒開放"],
    [-2017, "RedemptionClaimed", "已經兌換過"],
    [-2016, "RedemptionCooldown", "兌換太頻繁"],
    [-2021, "RedeemGameLevelTooLow", "開拓等級不足"],
    [-2008, "RedemptionRegionLock", "不能在這個伺服器使用"],
    [-110, "VisitsTooFrequently", "請求太頻繁"],
    [10101, "TooManyRequests", "請求太頻繁"],
  ])("%i（%s）_%s", (retcode, _meaning, text) => {
    const outcome = result(retcode);

    expect(outcome).toMatchObject({ ok: false, retcode, cookieInvalid: false });
    expect(outcome.message).toContain(text);
    expect(outcome.message).not.toContain("english detail");
  });

  it("冷卻（-2016）_提示等約 5 秒", () => {
    expect(result(-2016).message).toContain("5 秒");
  });

  it.each([-100, 10001, -1071])("cookie 失效或沒登入（%i，InvalidCookies）_標記失效，沿用失效標記流程", (retcode) => {
    expect(result(retcode)).toMatchObject({ ok: false, cookieInvalid: true });
    expect(result(retcode).message).toContain("cookie 已失效");
  });

  it("其他代碼_原因不明（錯誤代碼 N）：畫面的標題已經寫「兌換失敗」，說明不再重複", () => {
    expect(result(-9999).message).toBe("原因不明（錯誤代碼 -9999）");
  });

  it("連不上或格式不對_不丟錯", () => {
    expect(interpretRedeem({ localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" })).toMatchObject({ ok: false, retcode: null, message: expect.stringContaining("連不上") });
    expect(interpretRedeem("<html>")).toMatchObject({ ok: false, retcode: null });
  });
});

describe("redeemVerdict：自動兌換只記下有確定答案的結果（記下來的不再送出），其他的明天再試", () => {
  const verdictOf = (retcode: number) => redeemVerdict(interpretRedeem({ retcode, message: "", data: null }));

  it("成功_記下來", () => {
    expect(verdictOf(0)).toEqual({ kind: "success", settled: true });
  });

  it.each([
    [-2017, "RedemptionClaimed", "already"],
    [-2001, "Redemption code has expired", "expired"],
    [-2003, "Redemption code is incorrectly formatted", "invalid"],
    [-2008, "RedemptionRegionLock：這個伺服器不能用", "invalid"],
  ] as const)("%i（%s）_答案不會變，記下來", (retcode, _meaning, kind) => {
    expect(verdictOf(retcode)).toEqual({ kind, settled: true });
  });

  it("-2014（Redemption code not activated：直播碼這類還沒開放的）_不記，明天再試", () => {
    expect(verdictOf(-2014)).toEqual({ kind: "inactive", settled: false });
  });

  it.each([
    [-110, "VisitsTooFrequently"],
    [1028, "VisitsTooFrequently"],
    [10101, "TooManyRequests"],
  ])("%i（%s）_請求太頻繁，不記，這個帳號今天先停", (retcode) => {
    expect(verdictOf(retcode)).toEqual({ kind: "rate_limit", settled: false });
  });

  it("10035（GEETEST_RETCODES：要求驗證）_不記，整批停下", () => {
    expect(verdictOf(10035)).toEqual({ kind: "risk", settled: false });
  });

  it("-2016（RedemptionCooldown）、-2021（RedeemGameLevelTooLow）、-1071（InvalidCookies）_都會變，不記", () => {
    expect(verdictOf(-2016)).toEqual({ kind: "cooldown", settled: false });
    expect(verdictOf(-2021)).toEqual({ kind: "level", settled: false });
    expect(verdictOf(-1071)).toEqual({ kind: "cookie", settled: false });
  });

  it("沒見過的代碼、連不上（沒有 retcode）_不記", () => {
    expect(verdictOf(-9999)).toEqual({ kind: "failed", settled: false });
    expect(redeemVerdict(interpretRedeem({ localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" }))).toEqual({ kind: "network", settled: false });
  });

  it("要求驗證（GEETEST_RETCODES）_手動兌換時說明要到官方兌換頁", () => {
    expect(interpretRedeem({ retcode: 10035, message: "risk", data: null }).message).toContain("hsr.hoyoverse.com/gift");
  });
});
