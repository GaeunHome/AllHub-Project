import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTHER_SESSION, TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });

const service = mocksOf(await import("../service/accounts"), "linkAccount", "checkinAccount", "setStaminaThreshold", "removeAccount");
const { checkinAction, linkAccountAction, removeAccountAction, setThresholdAction } = await import("./actions");

const dbError = () => Object.assign(new Error('Failed query: update "starrail_accounts" params: ltoken_v2=secret-detail'), { name: "DrizzleQueryError" });

beforeEach(() => {
  requireSession.mockReset();
  service.linkAccount.mockReset().mockResolvedValue({ ok: true, message: "已連結" });
  service.checkinAccount.mockReset().mockResolvedValue({ ok: true, message: "簽到成功" });
  service.setStaminaThreshold.mockReset().mockResolvedValue(true);
  service.removeAccount.mockReset().mockResolvedValue(undefined);
});

describe("帳號 id 不正確（表單被改過或畫面太舊）", () => {
  it.each([
    ["checkinAction", () => checkinAction({}, form({ accountId: "abc" }))],
    ["setThresholdAction", () => setThresholdAction({}, form({ accountId: "0", threshold: "200" }))],
    ["removeAccountAction", () => removeAccountAction({}, form({ accountId: "-1" }))],
  ])("%s_回訊息請使用者重新整理_不丟例外、不呼叫 service", async (_name, run) => {
    expect((await run()).error).toContain("重新整理頁面");
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("非預期錯誤顯示在表單上（不會跳錯誤畫面）_log 只記錯誤種類", () => {
  it.each([
    ["linkAccountAction", "連結帳號", () => (service.linkAccount.mockRejectedValue(dbError()), linkAccountAction({}, form({ cookie: "ltoken_v2=x; ltuid_v2=1" })))],
    ["checkinAction", "簽到", () => (service.checkinAccount.mockRejectedValue(dbError()), checkinAction({}, form({ accountId: "1" })))],
    ["setThresholdAction", "設定提醒門檻", () => (service.setStaminaThreshold.mockRejectedValue(dbError()), setThresholdAction({}, form({ accountId: "1", threshold: "200" })))],
    ["removeAccountAction", "移除角色", () => (service.removeAccount.mockRejectedValue(dbError()), removeAccountAction({}, form({ accountId: "1" })))],
  ])("%s_回摘要不丟例外", async (_name, action, run) => {
    const log = captureErrorLog();

    expect(await run()).toEqual({ error: `${action}失敗（詳見伺服器 log）` });
    expect(loggedText(log)).toContain("DrizzleQueryError");
    expect(loggedText(log)).not.toContain("secret-detail");
  });
});

describe("removeAccountAction", () => {
  it("先檢查登入_沒登入時不移除", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(removeAccountAction({}, form({ accountId: "1" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(service.removeAccount).not.toHaveBeenCalled();
  });

  it("成功_回空狀態（這張卡片會在同一次更新裡消失）", async () => {
    expect(await removeAccountAction({}, form({ accountId: "1" }))).toEqual({});
    expect(service.removeAccount).toHaveBeenCalledWith(TEST_SESSION.id, 1);
  });
});

describe("擁有權：一律用登入者的 id 呼叫 service", () => {
  it.each([
    ["linkAccountAction", () => linkAccountAction({}, form({ cookie: "ltoken_v2=x; ltuid_v2=1" })), "linkAccount"],
    ["checkinAction", () => checkinAction({}, form({ accountId: "1" })), "checkinAccount"],
    ["setThresholdAction", () => setThresholdAction({}, form({ accountId: "1", threshold: "200" })), "setStaminaThreshold"],
    ["removeAccountAction", () => removeAccountAction({}, form({ accountId: "1" })), "removeAccount"],
  ] as const)("%s_帶的是登入者（bob）的 id", async (_name, run, method) => {
    requireSession.mockResolvedValue(OTHER_SESSION);

    await run();

    expect(service[method].mock.calls[0][0]).toBe(OTHER_SESSION.id);
  });

  it("setThresholdAction_帳號不是自己的（service 找不到）_請重新整理", async () => {
    service.setStaminaThreshold.mockResolvedValue(false);

    expect(await setThresholdAction({}, form({ accountId: "1", threshold: "200" }))).toEqual({ error: "找不到這個帳號，請重新整理頁面" });
  });
});
