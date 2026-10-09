import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireSession } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf, updated } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../service/accounts", { spy: true });

const service = mocksOf(await import("../service/accounts"), "linkAccount", "redeemCodeFor");
const { linkAccountAction, redeemCodeAction } = await import("./actions");

const COOKIE = "ltoken_v2=secret-token; ltuid_v2=1";
const ROLES = [
  { uid: "900000001", nickname: "開拓者", server: "台港澳服", level: 70, likelyUnused: false, selected: true },
  { uid: "800000002", nickname: "小號", server: "亞服", level: 4, likelyUnused: true, selected: false },
];

/** 同一個欄位送好幾個值（勾選多個 UID） */
function multi(fields: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of fields) data.append(key, value);
  return data;
}

beforeEach(() => {
  requireSession.mockReset();
  service.linkAccount.mockReset().mockResolvedValue({ ok: true, message: "已連結 開拓者（台港澳服，900000001）" });
  service.redeemCodeFor.mockReset().mockResolvedValue({ ok: true, message: "兌換成功，獎勵會寄到遊戲內信箱", cookieFlagChanged: false });
});

describe("linkAccountAction：先查角色，好幾個時讓使用者選伺服器", () => {
  it("第一步_用 ask 查角色；好幾個角色時回傳清單讓使用者選，還沒寫入就不讓快取失效", async () => {
    service.linkAccount.mockResolvedValue({ ok: false, roles: ROLES });

    expect(await linkAccountAction({}, form({ cookie: COOKIE }))).toEqual({ roles: ROLES });
    expect(service.linkAccount).toHaveBeenCalledWith(TEST_SESSION.id, COOKIE, "ask");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("只有一個角色（service 直接連結）_成功訊息、帳號失效", async () => {
    expect(await linkAccountAction({}, form({ cookie: COOKIE }))).toEqual({ message: "已連結 開拓者（台港澳服，900000001）" });
    expect(updated()).toEqual(["starrail:accounts"]);
  });

  it("第二步_cookie 從瀏覽器的表單再送一次，只連結勾選的 UID", async () => {
    await linkAccountAction({}, multi([["cookie", COOKIE], ["step", "choose"], ["uid", "900000001"], ["uid", "800000002"]]));

    expect(service.linkAccount).toHaveBeenCalledWith(TEST_SESSION.id, COOKIE, ["900000001", "800000002"]);
    expect(updated()).toEqual(["starrail:accounts"]);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("第二步沒勾任何一個_交給 service 回錯誤", async () => {
    service.linkAccount.mockResolvedValue({ ok: false, error: "請至少選一個要連結的帳號" });

    expect(await linkAccountAction({}, form({ cookie: COOKIE, step: "choose" }))).toEqual({ error: "請至少選一個要連結的帳號" });
    expect(service.linkAccount).toHaveBeenCalledWith(TEST_SESSION.id, COOKIE, []);
  });

  it("非預期錯誤_回摘要；log 只記錯誤種類，不記 cookie", async () => {
    const log = captureErrorLog();
    service.linkAccount.mockRejectedValue(Object.assign(new Error(`boom ${COOKIE}`), { name: "DrizzleQueryError" }));

    expect(await linkAccountAction({}, form({ cookie: COOKIE }))).toEqual({ error: "連結帳號失敗（詳見伺服器 log）" });
    expect(loggedText(log)).not.toContain("secret-token");
  });
});

describe("redeemCodeAction：兌換碼", () => {
  it("先檢查登入_沒登入時不兌換", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(redeemCodeAction({}, form({ accountId: "1", code: "STARRAILGIFT" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(service.redeemCodeFor).not.toHaveBeenCalled();
  });

  it("帳號 id 不正確_請重新整理，不呼叫 service", async () => {
    expect((await redeemCodeAction({}, form({ accountId: "abc", code: "STARRAILGIFT" }))).error).toContain("重新整理頁面");
    expect(service.redeemCodeFor).not.toHaveBeenCalled();
  });

  it("成功_顯示訊息；兌換本身不寫資料庫，不讓快取失效", async () => {
    expect(await redeemCodeAction({}, form({ accountId: "1", code: " starrailgift " }))).toEqual({ message: "兌換成功，獎勵會寄到遊戲內信箱" });
    expect(service.redeemCodeFor).toHaveBeenCalledWith(TEST_SESSION.id, 1, " starrailgift ");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("cookie 失效（寫了失效標記）_顯示錯誤並讓帳號失效", async () => {
    service.redeemCodeFor.mockResolvedValue({ ok: false, error: "HoYoLAB cookie 已失效", cookieFlagChanged: true });

    expect(await redeemCodeAction({}, form({ accountId: "1", code: "STARRAILGIFT" }))).toEqual({ error: "HoYoLAB cookie 已失效" });
    expect(updated()).toEqual(["starrail:accounts"]);
  });

  it("非預期錯誤_回摘要", async () => {
    captureErrorLog();
    service.redeemCodeFor.mockRejectedValue(new Error("boom"));

    expect(await redeemCodeAction({}, form({ accountId: "1", code: "STARRAILGIFT" }))).toEqual({ error: "兌換失敗（詳見伺服器 log）" });
  });
});
