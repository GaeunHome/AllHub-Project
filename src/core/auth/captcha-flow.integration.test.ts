import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { form } from "@/dev/test-helpers";
import { coreUsers } from "../db/schema";
import { hashPassword } from "./credentials";

// 整條路都是真的：驗證碼路由發 cookie → 表單送出 → Server Action 驗證碼 → 資料庫；只把 next/headers 換成一個共用的假 cookie

const CODE = "K7MRX";
const PASSWORD = "plum blossom 2026";

stubCoreEnv();
vi.stubEnv("DEV_CAPTCHA_CODE", CODE);

const request = vi.hoisted(() => ({ ip: "203.0.113.70", jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": request.ip }),
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void request.jar.set(name, value),
    delete: (name: string) => void request.jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

const { GET } = await import("./captcha-route");
const { login, registerAction } = await import("./actions");
const { captchaCookieName } = await import("./captcha");
const { createInvite } = await import("./invites");
const { SESSION_COOKIE } = await import("./session");

const getDb = setupTestDb();
let ipSeq = 0;

beforeEach(() => {
  request.jar.clear();
  request.ip = `203.0.113.${70 + ++ipSeq}`;
});

const loadCaptcha = (purpose: "login" | "register") => GET(new NextRequest(`https://hub.example.com/api/auth/captcha?for=${purpose}&t=${Date.now()}`));
const userRow = async (username: string) => (await getDb().select().from(coreUsers).where(eq(coreUsers.username, username)))[0];

async function createUser(username = "alice", role: "owner" | "member" = "member") {
  const [user] = await getDb()
    .insert(coreUsers)
    .values({ username, role, passwordHash: await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1 }) })
    .returning();
  return user;
}

// 登入成功會改用正式參數重新雜湊，scrypt 在機器忙時會超過預設的 5 秒
describe("登入：先驗證碼、再密碼", { timeout: 30_000 }, () => {
  it("驗證碼正確（不分大小寫、可以有空白）_登入成功，驗證碼的 cookie 清掉", async () => {
    await createUser();
    await loadCaptcha("login");

    await expect(login({}, form({ username: "alice", password: PASSWORD, captcha: " k7 mrx " }))).rejects.toThrow("NEXT_REDIRECT:/");

    expect(request.jar.has(SESSION_COOKIE)).toBe(true);
    expect(request.jar.has(captchaCookieName("login"))).toBe(false);
  });

  it("驗證碼錯誤_回「驗證碼錯誤，請重新輸入」；還沒檢查密碼，所以帳號的失敗次數不變；cookie 一樣清掉", async () => {
    const user = await createUser();
    await loadCaptcha("login");

    expect(await login({}, form({ username: "alice", password: PASSWORD, captcha: "AAAAA" }))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "alice" });

    expect((await userRow("alice")).failedLogins).toBe(user.failedLogins);
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
    expect(request.jar.has(captchaCookieName("login"))).toBe(false);
  });

  it("帳號不存在時答錯驗證碼_跟帳號存在時一模一樣（不能拿來判斷帳號是否存在）", async () => {
    await createUser();
    await loadCaptcha("login");
    const existing = await login({}, form({ username: "alice", password: "wrong password!!", captcha: "AAAAA" }));
    await loadCaptcha("login");
    const missing = await login({}, form({ username: "nobody", password: "wrong password!!", captcha: "AAAAA" }));

    expect(existing).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "alice" });
    expect(missing).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "nobody" });
  });

  it("沒有先載入驗證碼圖片（沒有 cookie）_拒絕", async () => {
    await createUser();

    expect(await login({}, form({ username: "alice", password: PASSWORD, captcha: CODE }))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "alice" });
  });

  it("把用過的驗證碼 cookie 再送一次_拒絕（每個 nonce 只能用一次）", async () => {
    await createUser();
    await loadCaptcha("login");
    const used = request.jar.get(captchaCookieName("login"))!;
    await login({}, form({ username: "alice", password: PASSWORD, captcha: CODE })).catch(() => {});

    request.jar.delete(SESSION_COOKIE);
    request.jar.set(captchaCookieName("login"), used);

    expect(await login({}, form({ username: "alice", password: PASSWORD, captcha: CODE }))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "alice" });
    expect(request.jar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("註冊：蜜罐之後檢查驗證碼", { timeout: 30_000 }, () => {
  async function inviteCode() {
    const owner = await createUser("owner", "owner");
    return (await createInvite({ createdBy: owner.id, days: 7, maxUses: 5 })).token;
  }
  const fields = (code: string, captcha: string) => form({ code, username: "bob", password: PASSWORD, confirmPassword: PASSWORD, agree: "on", website: "", captcha });

  it("驗證碼正確_建立帳號並登入，cookie 清掉", async () => {
    const code = await inviteCode();
    await loadCaptcha("register");

    await expect(registerAction({}, fields(code, "k7mrx"))).rejects.toThrow("NEXT_REDIRECT:/");

    expect((await userRow("bob")).role).toBe("member");
    expect(request.jar.has(captchaCookieName("register"))).toBe(false);
  });

  it("驗證碼錯誤_不建立帳號，回「驗證碼錯誤，請重新輸入」", async () => {
    const code = await inviteCode();
    await loadCaptcha("register");

    expect(await registerAction({}, fields(code, "AAAAA"))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "bob" });
    expect(await userRow("bob")).toBeUndefined();
  });

  it("登入頁的驗證碼不能拿來註冊", async () => {
    const code = await inviteCode();
    await loadCaptcha("login");

    expect(await registerAction({}, fields(code, CODE))).toEqual({ error: "驗證碼錯誤，請重新輸入", username: "bob" });
  });
});
