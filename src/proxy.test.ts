import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, signSession } from "@/core/auth/session";

const SECRET = "p".repeat(32);
vi.stubEnv("SESSION_SECRET", SECRET);

const { proxy, config } = await import("./proxy");

/** matcher 是整段比對的正規式：比對到的路徑才會經過 proxy（要登入），比對不到的就是公開的 */
const needsLogin = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

const requestWith = (token?: string) =>
  new NextRequest("https://hub.example.com/twitch", { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });

describe("proxy", () => {
  it("帶 sub 與 ver 的有效 session_放行（只驗簽章與期限，不查資料庫）", async () => {
    const response = await proxy(requestWith(await signSession({ userId: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", version: 1 }, SECRET)));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("沒有 cookie_導向 /login", async () => {
    const response = await proxy(requestWith());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://hub.example.com/login");
  });

  it("舊版 cookie（sub: owner、沒有 ver）_導向 /login 重新登入", async () => {
    const legacy = await new SignJWT({ sub: "owner" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

    const response = await proxy(requestWith(legacy));

    expect(response.status).toBe(307);
  });

  it("robots.txt 不用登入（爬蟲要讀得到才知道不要抓）_其他路徑照樣要登入", () => {
    expect(needsLogin("/robots.txt")).toBe(false);
    expect(needsLogin("/login")).toBe(false);
    expect(needsLogin("/api/cron/twitch:sync")).toBe(false);
    expect(needsLogin("/robots.txtx")).toBe(true);
    expect(needsLogin("/loginx")).toBe(true);
    expect(needsLogin("/twitch")).toBe(true);
    expect(needsLogin("/")).toBe(true);
  });

  it("註冊頁與使用聲明不用登入（沒有帳號的人要能打開邀請連結）_名稱相近的路徑與管理頁照樣要登入", () => {
    expect(needsLogin("/register")).toBe(false);
    expect(needsLogin("/terms")).toBe(false);
    expect(needsLogin("/registerx")).toBe(true);
    expect(needsLogin("/terms-old")).toBe(true);
    expect(needsLogin("/admin")).toBe(true);
    expect(needsLogin("/account")).toBe(true);
  });

  it("驗證碼圖片不用登入（登入與註冊頁要載得到）_名稱相近的路徑照樣要登入", () => {
    expect(needsLogin("/api/auth/captcha")).toBe(false);
    expect(needsLogin("/api/auth/captchax")).toBe(true);
    expect(needsLogin("/api/auth")).toBe(true);
    expect(needsLogin("/api/authx/captcha")).toBe(true);
  });

  it("proxy 不 import 資料庫（維持 edge 可用）", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8") + readFileSync(new URL("./core/auth/session.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/core\/db|drizzle|postgres|node:/);
  });
});
