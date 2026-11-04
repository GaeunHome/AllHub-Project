import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_SESSION, requireOwner } from "@/dev/session-stub";
import { captureErrorLog, form, loggedText, mocksOf } from "@/dev/test-helpers";

vi.mock("@/core/auth", () => import("@/dev/session-stub"));
vi.mock("../auth/invites", { spy: true });
vi.mock("./service", { spy: true });

const request = vi.hoisted(() => ({ headers: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.headers) }));

const invites = mocksOf(await import("../auth/invites"), "createInvite", "revokeInvite");
const { AdminUserError } = await import("./service");
const service = mocksOf(await import("./service"), "setUserDisabled", "deleteUser", "unlockUser", "setModuleAccess");
const { audit } = await import("@/dev/audit-stub");
const { createInviteAction, deleteUserAction, revokeInviteAction, setModuleAccessAction, setUserDisabledAction, unlockUserAction } = await import("./actions");
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
  service.setModuleAccess.mockReset().mockResolvedValue(true);
});

describe("只有站長能用", () => {
  const cases: [string, (prev: object, data: FormData) => Promise<unknown>, Record<string, string>][] = [
    ["createInviteAction", createInviteAction, { days: "7", uses: "1", note: "" }],
    ["revokeInviteAction", revokeInviteAction, { inviteId: "1" }],
    ["setUserDisabledAction", setUserDisabledAction, { userId: MEMBER_ID, disabled: "true" }],
    ["setModuleAccessAction", setModuleAccessAction, { userId: MEMBER_ID, moduleId: "savings", allowed: "false" }],
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

/** 表單會帶上全部模組與勾選的模組 core 不能 import 模組清單 */
function inviteForm(fields: Record<string, string>, opened = ["twitch"], all = ["twitch", "savings"]) {
  const data = form(fields);
  for (const id of all) data.append("allModules", id);
  for (const id of opened) data.append("modules", id);
  return data;
}

describe("createInviteAction", () => {
  it("建立邀請_連結只在這次回應裡出現（用這次請求的 Origin 組成完整網址）", async () => {
    const state = await createInviteAction({}, inviteForm({ days: "7", uses: "5", note: "給小明" }));

    expect(invites.createInvite).toHaveBeenCalledWith({ createdBy: TEST_SESSION.id, days: 7, maxUses: 5, note: "給小明", deniedModules: ["savings"] });
    expect(state).toEqual({
      message: "已建立邀請連結：7 天內可以註冊 5 個帳號。",
      link: `https://hub.example.com/register?code=${TOKEN}`,
    });
  });

  it("站長先決定開哪些功能：沒勾的是連結註冊的人不能用的，全勾就沒有限制", async () => {
    await createInviteAction({}, inviteForm({ days: "7", uses: "1", note: "" }, ["twitch", "savings"]));

    expect(invites.createInvite.mock.calls[0][0]).toMatchObject({ deniedModules: [] });
  });

  it("一個功能都沒勾_不建立連結：要先決定才產生", async () => {
    expect(await createInviteAction({}, inviteForm({ days: "7", uses: "1", note: "" }, []))).toEqual({ error: "至少選一個要開放的功能" });
    expect(invites.createInvite).not.toHaveBeenCalled();
  });

  it("格式不對的模組 id 不寫進限制", async () => {
    await createInviteAction({}, inviteForm({ days: "7", uses: "1", note: "" }, ["twitch"], ["twitch", "../evil", "savings"]));

    expect(invites.createInvite.mock.calls[0][0]).toMatchObject({ deniedModules: ["savings"] });
  });

  it("建立邀請寫進操作紀錄：看得到期限、次數與不開放的功能，不記邀請碼", async () => {
    await createInviteAction({}, inviteForm({ days: "7", uses: "1", note: "" }));

    const [, entry] = vi.mocked(audit).mock.calls[0];
    expect(entry).toMatchObject({ module: "admin", action: "建立邀請連結", detail: "7 天 1 次，不開放：savings" });
    expect(JSON.stringify(entry)).not.toContain(TOKEN);
  });

  it("沒有 Origin 時_用 Host 組網址", async () => {
    request.headers = { host: "localhost:3102", "x-forwarded-proto": "http" };

    expect((await createInviteAction({}, inviteForm({ days: "1", uses: "1", note: "" }))).link).toBe(`http://localhost:3102/register?code=${TOKEN}`);
  });

  it.each([
    ["期限不是選項", { days: "2", uses: "1", note: "" }],
    ["次數不是選項", { days: "7", uses: "3", note: "" }],
    ["沒有期限", { uses: "1", note: "" }],
  ])("%s_不建立", async (_name, fields) => {
    expect(await createInviteAction({}, form(fields))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(invites.createInvite).not.toHaveBeenCalled();
  });

  it("資料庫出錯_只回摘要、沒有連結_log 只記錯誤種類", async () => {
    const log = captureErrorLog();
    invites.createInvite.mockRejectedValue(Object.assign(new Error(`insert core_invites ${TOKEN}`), { name: "PostgresError" }));

    expect(await createInviteAction({}, inviteForm({ days: "7", uses: "1", note: "" }))).toEqual({ error: "建立邀請連結失敗（詳見伺服器 log）" });
    expect(loggedText(log)).toContain("PostgresError");
    expect(loggedText(log)).not.toContain(TOKEN);
  });
});

describe("revokeInviteAction", () => {
  it("id 格式不對_不撤銷", async () => {
    expect(await revokeInviteAction({}, form({ inviteId: "abc" }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(invites.revokeInvite).not.toHaveBeenCalled();
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
});

describe("unlockUserAction", () => {
  it("帳號 id 格式不對_不解除", async () => {
    expect(await unlockUserAction({}, form({ userId: "abc" }))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(service.unlockUser).not.toHaveBeenCalled();
  });
});

describe("setModuleAccessAction", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])("allowed=%s_交給 service 的是 %s", async (raw, allowed) => {
    expect(await setModuleAccessAction({}, form({ userId: MEMBER_ID, moduleId: "savings", allowed: raw }))).toEqual({});
    expect(service.setModuleAccess).toHaveBeenCalledExactlyOnceWith(MEMBER_ID, "savings", allowed);
  });

  it.each([
    ["帳號 id 格式不對", { userId: "1", moduleId: "savings", allowed: "false" }],
    ["模組 id 格式不對", { userId: MEMBER_ID, moduleId: "Savings; drop", allowed: "false" }],
    ["勾選的值不是 true／false", { userId: MEMBER_ID, moduleId: "savings", allowed: "on" }],
  ])("%s_不變更", async (_name, fields) => {
    expect(await setModuleAccessAction({}, form(fields))).toEqual({ error: INVALID_FORM_MESSAGE });
    expect(service.setModuleAccess).not.toHaveBeenCalled();
  });

  it("站長那一列（AdminUserError）_顯示原因", async () => {
    service.setModuleAccess.mockRejectedValue(new AdminUserError("站長一律全部能用"));

    expect(await setModuleAccessAction({}, form({ userId: TEST_SESSION.id, moduleId: "savings", allowed: "false" }))).toEqual({ error: "站長一律全部能用" });
  });

  it("帳號已經被刪除_告訴站長", async () => {
    service.setModuleAccess.mockResolvedValue(false);

    expect((await setModuleAccessAction({}, form({ userId: MEMBER_ID, moduleId: "savings", allowed: "false" }))).error).toContain("找不到這個帳號");
  });
});
