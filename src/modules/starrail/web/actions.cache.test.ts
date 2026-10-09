import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { form, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });

const service = mocksOf(await import("../service/accounts"), "linkAccount", "checkinAccount", "setStaminaThreshold", "removeAccount");
const { checkinAction, linkAccountAction, removeAccountAction, setThresholdAction } = await import("./actions");

beforeEach(() => {
  service.linkAccount.mockReset().mockResolvedValue({ ok: true, message: "已連結" });
  service.checkinAccount.mockReset().mockResolvedValue({ ok: true, message: "簽到成功" });
  service.setStaminaThreshold.mockReset().mockResolvedValue(true);
  service.removeAccount.mockReset().mockResolvedValue(undefined);
});

describe("星穹鐵道的 Server Action：寫入後用 updateTag 讓對應的 tag 失效", () => {
  it.each([
    ["linkAccountAction", ["starrail:accounts"], () => linkAccountAction({}, form({ cookie: "ltoken_v2=x; ltuid_v2=1" }))],
    ["checkinAction", ["starrail:accounts", "starrail:checkins"], () => checkinAction({}, form({ accountId: "1" }))],
    ["setThresholdAction", ["starrail:accounts"], () => setThresholdAction({}, form({ accountId: "1", threshold: "200" }))],
    ["removeAccountAction", ["starrail:accounts", "starrail:checkins"], () => removeAccountAction({}, form({ accountId: "1" }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await run();

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    // updateTag 已經會讓這次回應帶著重新算繪的頁面，再呼叫 refresh 是多餘的
    expect(refresh).not.toHaveBeenCalled();
  });

  it("簽到失敗（HoYoLAB 回錯誤）_仍讓紀錄與帳號失效：失敗也會寫一筆紀錄、可能標記 cookie 失效", async () => {
    service.checkinAccount.mockResolvedValue({ ok: false, error: "cookie 已失效" });

    expect(await checkinAction({}, form({ accountId: "1" }))).toEqual({ error: "cookie 已失效" });
    expect(updated()).toEqual(["starrail:accounts", "starrail:checkins"]);
  });

  it.each([
    ["linkAccountAction 沒貼 cookie", () => linkAccountAction({}, form({ cookie: "  " }))],
    ["setThresholdAction 門檻不正確", () => setThresholdAction({}, form({ accountId: "1", threshold: "-5" }))],
  ])("%s_沒寫入就不失效", async (_name, run) => {
    await run();

    expect(updateTag).not.toHaveBeenCalled();
  });
});
