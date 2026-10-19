import { describe, expect, it } from "vitest";
import { captureErrorLog, form, loggedText } from "@/dev/test-helpers";
import { UserError, actionErrorMessage, formFlag, formId, formText, formUuid, runAction } from "./form";

class DemoUserError extends Error {}
class StreamerNotFound extends UserError {}
const isDemoUserError = (error: unknown) => error instanceof DemoUserError;
const SCOPE = { module: "demo", action: "加入主播" };

describe("表單欄位", () => {
  it("formText_沒填是空字串", () => {
    expect(formText(form({ login: " alice " }), "login")).toBe(" alice ");
    expect(formText(form({}), "login")).toBe("");
  });

  it("formId_正整數才收", () => {
    expect(formId(form({ id: "3" }), "id")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "abc", "", "9007199254740993"]) expect(formId(form({ id: bad }), "id")).toBeNull();
    expect(formId(form({}), "id")).toBeNull();
  });

  it("formFlag_只認 true／false", () => {
    expect(formFlag(form({ enabled: "true" }), "enabled")).toBe(true);
    expect(formFlag(form({ enabled: "false" }), "enabled")).toBe(false);
    for (const bad of ["on", "1", ""]) expect(formFlag(form({ enabled: bad }), "enabled")).toBeNull();
    expect(formFlag(form({}), "enabled")).toBeNull();
  });

  it("formUuid_只收 UUID（帳號 id），大寫轉成小寫", () => {
    const id = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";
    expect(formUuid(form({ userId: id }), "userId")).toBe(id);
    expect(formUuid(form({ userId: id.toUpperCase() }), "userId")).toBe(id);
    for (const bad of ["", "1", "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6", "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6fz", "' or 1=1 --"]) {
      expect(formUuid(form({ userId: bad }), "userId")).toBeNull();
    }
    expect(formUuid(form({}), "userId")).toBeNull();
  });
});

describe("runAction", () => {
  it("成功_回傳文字當成功訊息、回傳 FormState 原樣交出、沒回傳是空狀態", async () => {
    expect(await runAction(SCOPE, isDemoUserError, async () => "已加入 Alice")).toEqual({ message: "已加入 Alice" });
    expect(await runAction(SCOPE, isDemoUserError, async () => ({ error: "找不到這位主播" }))).toEqual({ error: "找不到這位主播" });
    expect(await runAction(SCOPE, isDemoUserError, async () => {})).toEqual({});
  });

  it("使用者輸入錯誤_直接顯示訊息_不記 log", async () => {
    const log = captureErrorLog();

    expect(await runAction(SCOPE, isDemoUserError, async () => Promise.reject(new DemoUserError("Twitch 帳號格式不正確")))).toEqual({
      error: "Twitch 帳號格式不正確",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("非預期錯誤_表單上只顯示摘要_不丟出（不會跳錯誤畫面）_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    const error = Object.assign(new Error('Failed query: insert into "twitch_streamers" params: secret-detail'), { name: "DrizzleQueryError" });

    expect(await runAction(SCOPE, isDemoUserError, async () => Promise.reject(error))).toEqual({ error: "加入主播失敗（詳見伺服器 log）" });
    expect(log.mock.calls).toEqual([["[demo] 加入主播失敗", "DrizzleQueryError"]]);
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("結果放在標題已經寫了「…失敗」的結果框（titled）_非預期錯誤的說明只寫原因不明、不重複標題；log 照樣記「<動作>失敗」與錯誤種類", async () => {
    const log = captureErrorLog();
    const titled = { ...SCOPE, titled: true };

    expect(await runAction(titled, isDemoUserError, async () => Promise.reject(new TypeError("secret-detail")))).toEqual({ error: "原因不明（詳見伺服器 log）" });
    expect(log.mock.calls).toEqual([["[demo] 加入主播失敗", "TypeError"]]);
    expect(await runAction(titled, isDemoUserError, async () => Promise.reject(new DemoUserError("Twitch 帳號格式不正確")))).toEqual({ error: "Twitch 帳號格式不正確" });
  });
});

describe("UserError：不給判斷時 runAction 預設就認它", () => {
  it("UserError 與它的子類別_原樣顯示訊息、不記 log；其他錯誤照樣只給摘要", async () => {
    const log = captureErrorLog();

    expect(await runAction(SCOPE, async () => Promise.reject(new StreamerNotFound("找不到這位主播")))).toEqual({ error: "找不到這位主播" });
    expect(await runAction(SCOPE, async () => Promise.reject(new UserError("Twitch 帳號格式不正確")))).toEqual({ error: "Twitch 帳號格式不正確" });
    expect(log).not.toHaveBeenCalled();
    expect(await runAction(SCOPE, async () => Promise.reject(new DemoUserError("secret-detail")))).toEqual({ error: "加入主播失敗（詳見伺服器 log）" });
    expect(log.mock.calls).toEqual([["[demo] 加入主播失敗", "Error"]]);
  });

  it("另外給了判斷時_UserError 照樣原樣顯示，判斷認得的錯誤也原樣顯示", async () => {
    expect(await runAction(SCOPE, isDemoUserError, async () => Promise.reject(new StreamerNotFound("找不到這位主播")))).toEqual({ error: "找不到這位主播" });
    expect(await runAction(SCOPE, isDemoUserError, async () => Promise.reject(new DemoUserError("Twitch 回應：帳號已停權")))).toEqual({ error: "Twitch 回應：帳號已停權" });
  });

  it("actionErrorMessage 不給判斷時一樣只認 UserError", () => {
    const log = captureErrorLog();

    expect(actionErrorMessage(SCOPE, new StreamerNotFound("找不到這位主播"))).toBe("找不到這位主播");
    expect(actionErrorMessage(SCOPE, new TypeError("secret-detail"))).toBe("加入主播失敗（詳見伺服器 log）");
    expect(log.mock.calls).toEqual([["[demo] 加入主播失敗", "TypeError"]]);
  });
});

describe("actionErrorMessage：回傳形狀不是 FormState 的 action 用", () => {
  it("使用者錯誤回原訊息、其他錯誤回摘要並記 log", () => {
    const log = captureErrorLog();

    expect(actionErrorMessage(SCOPE, isDemoUserError, new DemoUserError("這支影片還沒開始翻譯"))).toBe("這支影片還沒開始翻譯");
    expect(actionErrorMessage(SCOPE, isDemoUserError, new TypeError("secret-detail"))).toBe("加入主播失敗（詳見伺服器 log）");
    expect(log.mock.calls).toEqual([["[demo] 加入主播失敗", "TypeError"]]);
  });

  it("titled_非預期錯誤回原因不明（標題已經寫了「…失敗」），使用者錯誤照樣回原訊息", () => {
    const log = captureErrorLog();
    const titled = { ...SCOPE, titled: true };

    expect(actionErrorMessage(titled, isDemoUserError, new TypeError("secret-detail"))).toBe("原因不明（詳見伺服器 log）");
    expect(actionErrorMessage(titled, isDemoUserError, new DemoUserError("這支影片還沒開始翻譯"))).toBe("這支影片還沒開始翻譯");
    expect(log.mock.calls).toEqual([["[demo] 加入主播失敗", "TypeError"]]);
  });
});
