import { describe, expect, it } from "vitest";
import { captureErrorLog, loggedText } from "@/dev/test-helpers";
import { DecryptionError } from "./crypto";
import { connectionProblem, errorKind, logError } from "./errors";

describe("errorKind：log 只記錯誤種類", () => {
  it("一般錯誤_記 name_不帶 message", () => {
    const error = Object.assign(new Error('Failed query: insert into "core_users" params: secret-detail'), { name: "DrizzleQueryError" });

    expect(errorKind(error)).toBe("DrizzleQueryError");
    expect(errorKind(new TypeError("fetch failed secret-detail"))).toBe("TypeError");
  });

  it("DecryptionError_記原因代碼（換金鑰後要看是哪一種解不開）", () => {
    expect(errorKind(new DecryptionError("unknown_key"))).toBe("unknown_key");
    expect(errorKind(new DecryptionError("auth_failed"))).toBe("auth_failed");
  });

  it("丟出來的不是 Error_記型別", () => {
    expect(errorKind("secret-detail")).toBe("string");
    expect(errorKind(undefined)).toBe("undefined");
  });
});

describe("connectionProblem：連線層錯誤給畫面看的中文摘要（不放錯誤原文）", () => {
  it("逾時（externalFetch 的 AbortSignal.timeout）_連線逾時，稍後會自動重試", () => {
    expect(connectionProblem(new DOMException("The operation was aborted due to timeout", "TimeoutError"), "Twitch")).toBe("連線逾時，稍後會自動重試");
  });

  it("請求被中止_連線中斷，稍後會自動重試", () => {
    expect(connectionProblem(new DOMException("This operation was aborted", "AbortError"), "Twitch")).toBe("連線中斷，稍後會自動重試");
  });

  it("fetch 連不上（TypeError）_說連不上哪個服務，不帶原文", () => {
    const problem = connectionProblem(new TypeError("fetch failed: getaddrinfo ENOTFOUND secret-detail"), "Twitch");

    expect(problem).toBe("連不上 Twitch，稍後會自動重試");
  });

  it("其他種類的錯誤_回 null，交給呼叫端依自己的錯誤類別處理", () => {
    expect(connectionProblem(Object.assign(new Error("400 secret-detail"), { name: "TwitchApiError" }), "Twitch")).toBeNull();
    expect(connectionProblem("secret-detail", "Twitch")).toBeNull();
  });
});

describe("logError", () => {
  it("格式是「[scope] 做什麼失敗」、附帶的資訊、錯誤種類_不帶 message 與 stack", () => {
    const log = captureErrorLog();

    logError("starrail", "處理帳號時發生錯誤", Object.assign(new Error("cookie ltoken_v2=secret-detail"), { name: "PostgresError" }), "900000001");

    expect(log.mock.calls).toEqual([["[starrail] 處理帳號時發生錯誤", "900000001", "PostgresError"]]);
    expect(loggedText(log)).not.toContain("secret-detail");
  });

  it("沒有附帶資訊時_只有訊息與錯誤種類", () => {
    const log = captureErrorLog();

    logError("cron", "twitch:sync 失敗", new DecryptionError("malformed"));

    expect(log.mock.calls).toEqual([["[cron] twitch:sync 失敗", "malformed"]]);
  });
});
