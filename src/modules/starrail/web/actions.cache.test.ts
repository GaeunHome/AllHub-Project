import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureErrorLog, form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });

const service = mocksOf(await import("../service/accounts"), "linkAccount", "checkinAccount", "setStaminaThreshold", "setAutoRedeem", "setGameReminders", "removeAccount");
const { checkinAction, linkAccountAction, removeAccountAction, setAutoRedeemAction, setGameRemindersAction, setThresholdAction } = await import("./actions");

beforeEach(() => {
  service.linkAccount.mockReset().mockResolvedValue({ ok: true, message: "已連結" });
  service.checkinAccount.mockReset().mockResolvedValue({ ok: true, message: "簽到成功", accountChanged: false });
  service.setStaminaThreshold.mockReset().mockResolvedValue(true);
  service.setAutoRedeem.mockReset().mockResolvedValue({ ok: true });
  service.setGameReminders.mockReset().mockResolvedValue(true);
  service.removeAccount.mockReset().mockResolvedValue(undefined);
});

describe("星穹鐵道的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([
    ["linkAccountAction", ["starrail:accounts"], () => linkAccountAction({}, form({ cookie: "ltoken_v2=x; ltuid_v2=1" }))],
    // 帳號的 tag 標著所有 HoYoLAB 的快取 cookie 失效標記沒改時不失效 見下面
    ["checkinAction", ["starrail:checkins"], () => checkinAction({}, form({ accountId: "1" }))],
    ["setThresholdAction", ["starrail:accounts"], () => setThresholdAction({}, form({ accountId: "1", threshold: "200" }))],
    ["setAutoRedeemAction", ["starrail:accounts"], () => setAutoRedeemAction({}, form({ accountId: "1", enabled: "true" }))],
    ["setGameRemindersAction", ["starrail:accounts"], () => setGameRemindersAction({}, form({ accountId: "1", enabled: "false" }))],
    ["removeAccountAction", ["starrail:accounts", "starrail:checkins"], () => removeAccountAction({}, form({ accountId: "1" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面 再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it("簽到失敗而且標記了 cookie 失效_紀錄與帳號都失效（帳號上的失效標記要馬上看得到）", async () => {
    service.checkinAccount.mockResolvedValue({ ok: false, error: "cookie 已失效", accountChanged: true });

    expect(await checkinAction({}, form({ accountId: "1" }))).toEqual({ error: "cookie 已失效" });
    expect(updated()).toEqual(["starrail:accounts", "starrail:checkins"]);
  });

  it("簽到失敗但帳號沒改（例如 HoYoLAB 要求驗證碼）_只讓紀錄失效：失敗也會寫一筆紀錄", async () => {
    service.checkinAccount.mockResolvedValue({ ok: false, error: "HoYoLAB 要求驗證碼", accountChanged: false });

    await checkinAction({}, form({ accountId: "1" }));

    expect(updated()).toEqual(["starrail:checkins"]);
  });

  it("簽到中途丟出預期外的錯誤_不知道帳號改了沒有，兩個都失效", async () => {
    captureErrorLog();
    service.checkinAccount.mockRejectedValue(new Error("boom"));

    await checkinAction({}, form({ accountId: "1" }));

    expect(updated()).toEqual(["starrail:accounts", "starrail:checkins"]);
  });

  it.each([
    ["linkAccountAction 沒貼 cookie", () => linkAccountAction({}, form({ cookie: "  " }))],
    ["setThresholdAction 門檻不正確", () => setThresholdAction({}, form({ accountId: "1", threshold: "-5" }))],
    ["setGameRemindersAction 帳號不是自己的（service 找不到）", () => (service.setGameReminders.mockResolvedValue(false), setGameRemindersAction({}, form({ accountId: "1", enabled: "false" })))],
  ])("%s_沒寫入就不失效", async (_name, run) => {
    await run();

    expect(updateTag).not.toHaveBeenCalled();
  });
});
