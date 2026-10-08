import { SignJWT, decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { SESSION_DAYS, signSession, verifySessionToken } from "./session";

const secret = "x".repeat(32);
const claims = { userId: "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f", version: 3 };

const signRaw = (payload: Record<string, unknown>, expiresInSeconds = 3600) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));

describe("session", () => {
  it("自己簽的 token 驗證通過_帶回使用者 id 與 session 版本", async () => {
    expect(await verifySessionToken(await signSession(claims, secret), secret)).toEqual(claims);
  });

  it("沒有 token 時不通過", async () => {
    expect(await verifySessionToken(undefined, secret)).toBeNull();
  });

  it("用別的密鑰簽的 token 不通過", async () => {
    expect(await verifySessionToken(await signSession(claims, "y".repeat(32)), secret)).toBeNull();
  });

  it("過期的 token 不通過", async () => {
    const expired = await signRaw({ sub: claims.userId, ver: claims.version }, -60);
    expect(await verifySessionToken(expired, secret)).toBeNull();
  });

  it("密鑰是空字串時（未設定環境變數）一律不通過", async () => {
    expect(await verifySessionToken(await signSession(claims, secret), "")).toBeNull();
  });

  it("JWT 的 sub 是使用者 id、ver 是 session 版本_30 天後到期", async () => {
    const payload = decodeJwt(await signSession(claims, secret));

    expect(payload.sub).toBe(claims.userId);
    expect(payload.ver).toBe(claims.version);
    expect(payload.exp! - payload.iat!).toBe(SESSION_DAYS * 24 * 3600);
  });

  it("舊版 token（sub: owner、沒有 ver）不通過_要重新登入", async () => {
    expect(await verifySessionToken(await signRaw({ sub: "owner" }), secret)).toBeNull();
  });

  it.each([
    ["沒有 ver", { sub: claims.userId }],
    ["ver 是字串", { sub: claims.userId, ver: "3" }],
    ["ver 是 0", { sub: claims.userId, ver: 0 }],
    ["ver 有小數", { sub: claims.userId, ver: 1.5 }],
    ["sub 不是 UUID", { sub: "1", ver: 1 }],
    ["沒有 sub", { ver: 1 }],
  ])("內容不對（%s）不通過", async (_name, payload) => {
    expect(await verifySessionToken(await signRaw(payload), secret)).toBeNull();
  });
});
