import { refresh, revalidateTag, updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";
import { form, mocksOf, updated } from "@/dev/test-helpers";

const SECRET = "s".repeat(32);
const USER_ID = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";

stubCoreEnv({ SESSION_SECRET: SECRET });

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.20" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("./registration", { spy: true });
vi.mock("./attempts", { spy: true });
vi.mock("./users", { spy: true });
vi.mock("./captcha", { spy: true });

const registration = mocksOf(await import("./registration"), "registerMember");
const attempts = mocksOf(await import("./attempts"), "checkAttempts", "recordAttempt");
const users = mocksOf(await import("./users"), "deleteOwnAccount", "findSessionUser");
const captcha = mocksOf(await import("./captcha"), "takeCaptchaToken", "verifyCaptcha");
const { deleteAccountAction, registerAction } = await import("./actions");
const { SESSION_COOKIE, signSession } = await import("./session");

const PASSWORD = "plum blossom 2026";
const registerFields = () => form({ code: "A".repeat(43), username: "bob", password: PASSWORD, confirmPassword: PASSWORD, agree: "on", website: "" });

beforeEach(async () => {
  jar.clear();
  jar.set(SESSION_COOKIE, await signSession({ userId: USER_ID, version: 1 }, SECRET));
  attempts.checkAttempts.mockReset().mockResolvedValue({ allowed: true });
  attempts.recordAttempt.mockReset().mockResolvedValue({ allowed: true });
  registration.registerMember.mockReset().mockResolvedValue({ ok: true, id: USER_ID, sessionVersion: 1 });
  users.findSessionUser.mockReset().mockResolvedValue({ id: USER_ID, username: "alice", role: "member" });
  users.deleteOwnAccount.mockReset().mockResolvedValue({ ok: true });
  captcha.takeCaptchaToken.mockReset().mockResolvedValue("captcha-token");
  captcha.verifyCaptcha.mockReset().mockResolvedValue(true);
});

describe("帳號的 Server Action：寫入後用 updateTag 讓管理頁的清單失效", () => {
  it.each([
    // 新帳號出現在使用者清單、邀請的已用次數加一
    ["registerAction", ["core:invites", "core:users"], () => registerAction({}, registerFields())],
    // 帳號刪除時，他建立的邀請也跟著外鍵刪掉
    ["deleteAccountAction", ["core:invites", "core:users"], () => deleteAccountAction({}, form({ password: PASSWORD }))],
  ] as const)("%s_%j", async (_name, tags, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");

    expect(updated()).toEqual([...tags].sort());
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("註冊失敗（邀請無效）_沒有寫入就不失效", async () => {
    registration.registerMember.mockResolvedValue({ ok: false, reason: "invite", error: "邀請連結無效、已過期或已用完，請向站長索取新的連結" });

    await registerAction({}, registerFields());

    expect(updateTag).not.toHaveBeenCalled();
  });

  it("刪除帳號失敗（密碼錯誤）_沒有寫入就不失效", async () => {
    users.deleteOwnAccount.mockResolvedValue({ ok: false, reason: "wrong_password", error: "密碼不正確" });

    await deleteAccountAction({}, form({ password: "wrong password!!" }));

    expect(updateTag).not.toHaveBeenCalled();
  });
});
