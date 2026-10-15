import { SignJWT, jwtVerify } from "jose";

// proxy 也用這個檔案 只用 jose 的 Web Crypto 不碰資料庫與 Node 專屬模組 edge 才能用

export const SESSION_COOKIE = "hub_session";
export const SESSION_DAYS = 30;

/** version 是簽發時的 session_version 改密碼後版本遞增 舊 cookie 就對不上 */
export type SessionClaims = { userId: string; version: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession({ userId, version }: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({ ver: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key(secret));
}

/** 只驗簽章 期限與欄位格式 不查資料庫 使用者與版本由 requireSession 確認 */
export async function verifySessionToken(token: string | undefined, secret: string): Promise<SessionClaims | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    const { sub, ver } = payload;
    // sub 不是使用者 id 或沒有版本就沒辦法跟資料庫比對 一律要求重新登入
    if (typeof sub !== "string" || !UUID.test(sub)) return null;
    if (typeof ver !== "number" || !Number.isSafeInteger(ver) || ver < 1) return null;
    return { userId: sub, version: ver };
  } catch {
    return null;
  }
}
