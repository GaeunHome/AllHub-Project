import { refresh, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireOwner } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../auth/invites", { spy: true });
vi.mock("./service", { spy: true });

const request = vi.hoisted(() => ({ headers: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.headers) }));

const { InviteInputError } = await import("../auth/invites");
const invites = mocksOf(await import("../auth/invites"), "createInvite", "revokeInvite");
const { AdminUserError } = await import("./service");
const service = mocksOf(await import("./service"), "setUserDisabled", "deleteUser", "unlockUser");
const { createInviteAction, deleteUserAction, revokeInviteAction, setUserDisabledAction, unlockUserAction } = await import("./actions");
const { INVALID_FORM_MESSAGE } = await import("../form");

const TOKEN = "T".repeat(43);
const MEMBER_ID = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";

beforeEach(() => {
  requireOwner.mockReset();
  request.headers = { origin: "https://hub.example.com", host: "hub.example.com" };
  invites.createInvite.mockReset().mockResolvedValue({ token: TOKEN, id: 1, expiresAt: new Date("2026-10-15T00:00:00Z") });
  invites.revokeInvite.mockReset().mockResolvedValue(true);
  service.setUserDisabled.mockReset().mockResolvedValue(true);
  service.deleteUser.mockReset().mockResolvedValue(true);
  service.unlockUser.mockReset().mockResolvedValue(true);
});

describe("只有站長能用", () => {
  const cases: [string, (prev: object, data: FormData) => Promise<unknown>, Record<string, string>][] = [
    ["createInviteAction", createInviteAction, { days: "7", uses: "1", note: "" }],
    ["revokeInviteAction", revokeInviteAction, { inviteId: "1" }],
    ["setUserDisabledAction", setUserDisabledAction, { userId: MEMBER_ID, disabled: "true" }],
    ["deleteUserAction", deleteUserAction, { userId: MEMBER_ID }],
    ["unlockUserAction", unlockUserAction, { userId: MEMBER_ID }],
  ];

  it.each(cases)("%s_不是站長（requireOwner 導向首頁）_在動到資料前就被擋下", async (_name, action, fields) => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT:/"));

    await expect(action({}, form(fields))).rejects.toThrow("NEXT_REDIRECT:/");

    for (const fn of [...Object.values(invites), ...Object.values(service)]) expect(fn).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("createInviteAction", () => {
  it("建立邀請_連結只在這次回應裡出現（用這次請求的 Origin 組成完整網址）", async () => {
    const state = await createInviteAction({}, form({ days: "7", uses: "5", note: "給小明" }));

    expect(invites.createInvite).toHaveBeenCalledWith({ createdBy: TEST_SESSION.id, days: 7, maxUses: 5, note: "給小明" });
    expect(state).toEqual({
      message: "已建立邀請連結：7 天內可以註冊 5 個帳號。連結只會顯示這一次，請現在複製。",
      link: `https://hub.example.com/register?code=${TOKEN}`,
    });
  });

  it("沒有 Origin 時_用 Host 組網址", async () => {
    request.headers = { host: "localhost:3102", "x-forwarded-proto": "http" };

    expect((await createInviteAction({}, form({ days: "1", uses: "1", note: "" }))).link).toBe(`http://localhost:3102/register?code=${TOKEN}`);
  });

  it.each([
    ["期限不是選項", { days: "2", uses: "1", note: "" }],
    ["次數不是選項", { days: "7", uses: "3", note: "" }],
    ["沒有期限", { uses: "1", note: "" }],
  ])("%s_不建立", async (_name, fields) => {
    expect(await createInviteAction({}, form(fields))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(invites.createInvite).not.toHaveBeenCalled();
  });

  it("備註太長（InviteInputError）_顯示原因、沒有連結", async () => {
    invites.createInvite.mockRejectedValue(new InviteInputError("備註最多 50 個字"));

    expect(await createInviteAction({}, form({ days: "7", uses: "1", note: "字".repeat(51) }))).toEqual({ error: "備註最多 50 個字" });
  });

  it("資料庫出錯_只回摘要、沒有連結_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    invites.createInvite.mockRejectedValue(Object.assign(new Error(`insert core_invites ${TOKEN}`), { name: "PostgresError" }));

    expect(await createInviteAction({}, form({ days: "7", uses: "1", note: "" }))).toEqual({ error: "建立邀請連結失敗（詳見伺服器 log）" });
    expect(loggedText(log)).toContain("PostgresError");
    expect(loggedText(log)).not.toContain(TOKEN);
  });
});

describe("revokeInviteAction", () => {
  it("撤銷_帶 id 給 service", async () => {
    expect(await revokeInviteAction({}, form({ inviteId: "3" }))).toEqual({});
    expect(invites.revokeInvite).toHaveBeenCalledWith(3);
  });

  it("id 格式不對_不撤銷", async () => {
    expect(await revokeInviteAction({}, form({ inviteId: "abc" }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(invites.revokeInvite).not.toHaveBeenCalled();
  });

  it("已經撤銷或不存在（畫面太舊）_說明原因並重新算繪畫面", async () => {
    invites.revokeInvite.mockResolvedValue(false);

    expect(await revokeInviteAction({}, form({ inviteId: "3" }))).toEqual({ error: "這個邀請已經撤銷或不存在" });
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("setUserDisabledAction", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])("disabled=%s_交給 service 的是 %s（以站長的 id 呼叫）", async (raw, disabled) => {
    expect(await setUserDisabledAction({}, form({ userId: MEMBER_ID, disabled: raw }))).toEqual({});
    expect(service.setUserDisabled).toHaveBeenCalledWith(TEST_SESSION.id, MEMBER_ID, disabled);
  });

  it.each([
    ["帳號 id 格式不對", { userId: "1", disabled: "true" }],
    ["停用旗標不是 true／false", { userId: MEMBER_ID, disabled: "on" }],
  ])("%s_不變更", async (_name, fields) => {
    expect(await setUserDisabledAction({}, form(fields))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(service.setUserDisabled).not.toHaveBeenCalled();
  });

  it("停用自己（AdminUserError）_顯示原因", async () => {
    service.setUserDisabled.mockRejectedValue(new AdminUserError("不能停用自己的帳號"));

    expect(await setUserDisabledAction({}, form({ userId: TEST_SESSION.id, disabled: "true" }))).toEqual({ error: "不能停用自己的帳號" });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("帳號已經不在了_說明原因並重新算繪畫面", async () => {
    service.setUserDisabled.mockResolvedValue(false);

    expect(await setUserDisabledAction({}, form({ userId: MEMBER_ID, disabled: "true" }))).toEqual({ error: "找不到這個帳號，可能已經被刪除" });
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("deleteUserAction", () => {
  it("刪除_以站長的 id 呼叫 service", async () => {
    expect(await deleteUserAction({}, form({ userId: MEMBER_ID }))).toEqual({});
    expect(service.deleteUser).toHaveBeenCalledWith(TEST_SESSION.id, MEMBER_ID);
  });

  it("帳號 id 格式不對_不刪除", async () => {
    expect(await deleteUserAction({}, form({ userId: "../etc" }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(service.deleteUser).not.toHaveBeenCalled();
  });

  it("刪除自己（AdminUserError）_顯示原因", async () => {
    service.deleteUser.mockRejectedValue(new AdminUserError("不能在管理頁刪除自己的帳號"));

    expect(await deleteUserAction({}, form({ userId: TEST_SESSION.id }))).toEqual({ error: "不能在管理頁刪除自己的帳號" });
  });

  it("帳號已經不在了_說明原因並重新算繪畫面", async () => {
    service.deleteUser.mockResolvedValue(false);

    expect(await deleteUserAction({}, form({ userId: MEMBER_ID }))).toEqual({ error: "找不到這個帳號，可能已經被刪除" });
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("unlockUserAction", () => {
  it("解除鎖定_帶帳號 id 給 service", async () => {
    expect(await unlockUserAction({}, form({ userId: MEMBER_ID }))).toEqual({});
    expect(service.unlockUser).toHaveBeenCalledWith(MEMBER_ID);
  });

  it("帳號 id 格式不對_不解除", async () => {
    expect(await unlockUserAction({}, form({ userId: "abc" }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(service.unlockUser).not.toHaveBeenCalled();
  });

  it("帳號已經不在了_說明原因並重新算繪畫面", async () => {
    service.unlockUser.mockResolvedValue(false);

    expect(await unlockUserAction({}, form({ userId: MEMBER_ID }))).toEqual({ error: "找不到這個帳號，可能已經被刪除" });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
