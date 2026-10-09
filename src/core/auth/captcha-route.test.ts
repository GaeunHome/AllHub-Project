import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubCoreEnv } from "@/dev/test-env";

stubCoreEnv();

const jar = vi.hoisted(() => new Map<string, { value: string; options?: Record<string, unknown> }>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

const { GET } = await import("./captcha-route");
const { captchaCookieName, verifyCaptchaToken } = await import("./captcha");

const request = (query: string) => new NextRequest(`https://hub.example.com/api/auth/captcha${query}`);

/** 只驗格式、期限與 HMAC（不碰資料庫），用來確認 cookie 對應的是哪個驗證碼 */
const signedFor = (code: string, purpose: "login" | "register" = "login") => verifyCaptchaToken(purpose, code, jar.get(captchaCookieName(purpose))!.value, new Date());

beforeEach(() => {
  jar.clear();
  vi.unstubAllEnvs();
  stubCoreEnv();
});

describe("GET /api/auth/captcha", () => {
  it("回 SVG 圖片、不能快取；同時設好 HttpOnly、SameSite=Strict、5 分鐘、整站都送得到的 cookie", async () => {
    const response = await GET(request("?for=login&t=1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const svg = await response.text();
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/<text/i);
    const cookie = jar.get(captchaCookieName("login"))!;
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{22}\.\d{13}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 300 });
  });

  it("production 加上 Secure（本機開發是 http，沿用登入 cookie 的做法）", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await GET(request("?for=register"));

    expect(jar.get(captchaCookieName("register"))!.options).toMatchObject({ secure: true, httpOnly: true, sameSite: "strict" });
  });

  it("登入與註冊各用各的 cookie，同時開著兩個頁面也不會互相蓋掉", async () => {
    await GET(request("?for=login"));
    await GET(request("?for=register"));

    expect(jar.has(captchaCookieName("login"))).toBe(true);
    expect(jar.has(captchaCookieName("register"))).toBe(true);
  });

  it("用途不是 login／register_回 400，不設 cookie", async () => {
    for (const query of ["", "?for=admin", "?for=login&for=register"]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
    }
    expect(jar.size).toBe(0);
  });

  it("開發與測試時可以用 DEV_CAPTCHA_CODE 固定驗證碼（E2E 用）", async () => {
    vi.stubEnv("DEV_CAPTCHA_CODE", "K7MRX");

    await GET(request("?for=login"));

    expect(signedFor("K7MRX")).toBe(true);
  });

  it("production 一定不理 DEV_CAPTCHA_CODE：驗證碼照樣是隨機的", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_CAPTCHA_CODE", "K7MRX");

    for (let i = 0; i < 5; i++) {
      await GET(request("?for=login"));
      expect(signedFor("K7MRX")).toBe(false);
    }
  });
});
