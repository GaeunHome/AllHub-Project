import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "@/dev/test-db";
import { stubCoreEnv } from "@/dev/test-env";
import { coreRateLimits } from "../db/schema";

const SECRET = "s".repeat(32);
stubCoreEnv({ SESSION_SECRET: SECRET });

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { CAPTCHA_TTL_MS, captchaCookieName, createCaptchaToken, normalizeCaptchaAnswer, takeCaptchaToken, verifyCaptcha } = await import("./captcha");

const getDb = setupTestDb();
const NOW = new Date("2026-10-08T00:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

beforeEach(() => {
  jar.clear();
});

describe("驗證碼 cookie 的內容", () => {
  it("只放 nonce、到期時間與兩個 HMAC（含答案的、不含答案的），不放驗證碼本身", () => {
    const token = createCaptchaToken("login", "K7MRX", NOW);
    const [nonce, expiresAt, mac, tokenMac, ...rest] = token.split(".");

    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Number(expiresAt)).toBe(NOW.getTime() + CAPTCHA_TTL_MS);
    expect(mac).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenMac).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenMac).not.toBe(mac);
    expect(rest).toEqual([]);
    expect(token.toUpperCase()).not.toContain("K7MRX");
    expect(CAPTCHA_TTL_MS).toBe(5 * 60_000);
  });

  it("HMAC 的金鑰從 SESSION_SECRET 衍生，而且跟 IP 雜湊用的金鑰分開", () => {
    const [nonce, expiresAt, mac] = createCaptchaToken("login", "K7MRX", NOW).split(".");
    const clientKeyStyle = createHmac("sha256", createHmac("sha256", SECRET).update("allhub:client-key").digest())
      .update(`login.K7MRX.${nonce}.${expiresAt}`)
      .digest("base64url");

    expect(mac).not.toBe(clientKeyStyle);
  });
});

describe("verifyCaptcha", () => {
  it("答案正確_通過；不分大小寫、空白與全形都不影響", async () => {
    for (const answer of ["K7MRX", "k7mrx", " k7 m r x ", "Ｋ７ＭＲＸ"]) {
      expect(normalizeCaptchaAnswer(answer)).toBe("K7MRX");
      expect(await verifyCaptcha("login", answer, createCaptchaToken("login", "K7MRX", NOW), NOW)).toBe(true);
    }
  });

  it("同一張驗證碼只能用一次（nonce 用過就記在資料庫）", async () => {
    const token = createCaptchaToken("login", "K7MRX", NOW);

    expect(await verifyCaptcha("login", "K7MRX", token, NOW)).toBe(true);
    expect(await verifyCaptcha("login", "K7MRX", token, later(1000))).toBe(false);
  });

  it("答錯也會用掉這張驗證碼：拿同一個 cookie 換答案一直猜沒有用", async () => {
    const token = createCaptchaToken("login", "K7MRX", NOW);

    expect(await verifyCaptcha("login", "AAAAA", token, NOW)).toBe(false);
    expect(await verifyCaptcha("login", "K7MRX", token, NOW)).toBe(false);
  });

  it("含答案的 HMAC 被改過_拒絕", async () => {
    const [nonce, expiresAt, mac, tokenMac] = createCaptchaToken("login", "K7MRX", NOW).split(".");
    const tampered = `${nonce}.${expiresAt}.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BB" : "AA"}.${tokenMac}`;

    expect(await verifyCaptcha("login", "K7MRX", tampered, NOW)).toBe(false);
  });

  it("把到期時間改晚_不含答案的 HMAC 對不上，先擋下、不寫資料庫", async () => {
    const [nonce, expiresAt, mac, tokenMac] = createCaptchaToken("login", "K7MRX", NOW).split(".");

    expect(await verifyCaptcha("login", "K7MRX", `${nonce}.${Number(expiresAt) + 3_600_000}.${mac}.${tokenMac}`, NOW)).toBe(false);
    expect(await getDb().select().from(coreRateLimits)).toEqual([]);
  });

  it("偽造的 cookie（格式對、期限內，但不是伺服器簽的）_先擋下，不寫資料庫：亂送 cookie 不能拿來塞滿 core_rate_limits", async () => {
    for (const forged of [`${"n".repeat(22)}.${NOW.getTime() + 60_000}.${"m".repeat(43)}.${"t".repeat(43)}`, `${"n".repeat(22)}.${NOW.getTime() + 60_000}.${"m".repeat(43)}`]) {
      expect(await verifyCaptcha("login", "K7MRX", forged, NOW)).toBe(false);
    }
    expect(await getDb().select().from(coreRateLimits)).toEqual([]);
  });

  it("不含答案的 HMAC 也綁定用途：登入的 cookie 拿去註冊，先擋下、不寫資料庫", async () => {
    expect(await verifyCaptcha("register", "K7MRX", createCaptchaToken("login", "K7MRX", NOW), NOW)).toBe(false);
    expect(await getDb().select().from(coreRateLimits)).toEqual([]);
  });

  it("過期（5 分鐘到的那一刻起）_拒絕", async () => {
    const token = createCaptchaToken("login", "K7MRX", NOW);

    expect(await verifyCaptcha("login", "K7MRX", token, later(CAPTCHA_TTL_MS))).toBe(false);
  });

  it("登入的驗證碼不能拿去註冊", async () => {
    expect(await verifyCaptcha("register", "K7MRX", createCaptchaToken("login", "K7MRX", NOW), NOW)).toBe(false);
  });

  it("沒有 cookie 或格式不對_拒絕", async () => {
    for (const token of [undefined, "", "abc", "a.b.c", `${"x".repeat(22)}.soon.${"y".repeat(43)}.${"z".repeat(43)}`, `${"x".repeat(22)}.${NOW.getTime() + 60_000}.${"y".repeat(43)}`]) {
      expect(await verifyCaptcha("login", "K7MRX", token, NOW)).toBe(false);
    }
  });

  it("資料庫只存 nonce 的雜湊（沒有 nonce 原文與驗證碼），一天後的紀錄會被清掉", async () => {
    await getDb().insert(coreRateLimits).values({ scope: "captcha", keyHash: "old", windowStartedAt: later(-25 * 60 * 60_000), attempts: 1 });
    const token = createCaptchaToken("login", "K7MRX", NOW);
    const nonce = token.split(".")[0];

    await verifyCaptcha("login", "K7MRX", token, NOW);

    const rows = await getDb().select().from(coreRateLimits);
    expect(rows.map((row) => [row.scope, row.keyHash])).toEqual([["captcha", createHash("sha256").update(nonce).digest("hex")]]);
    expect(JSON.stringify(rows)).not.toContain(nonce);
    expect(JSON.stringify(rows)).not.toContain("K7MRX");
  });
});

describe("takeCaptchaToken", () => {
  it("讀出這次表單的驗證碼 cookie 並立刻清掉：不論後面成功或失敗，每張圖只能送出一次", async () => {
    jar.set(captchaCookieName("login"), "token-value");
    jar.set(captchaCookieName("register"), "other");

    expect(await takeCaptchaToken("login")).toBe("token-value");
    expect(jar.has(captchaCookieName("login"))).toBe(false);
    expect(jar.get(captchaCookieName("register"))).toBe("other");
    expect(await takeCaptchaToken("login")).toBeUndefined();
  });
});
