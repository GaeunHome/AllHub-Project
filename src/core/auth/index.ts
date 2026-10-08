import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { coreEnv } from "../env";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySessionToken } from "./session";
import { findSessionUser, type SessionUser } from "./users";

export type { SessionUser } from "./users";

export async function createSession(userId: string, version: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession({ userId, version }, coreEnv().SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** 同一次請求裡很多元件都會檢查登入，用 React cache 只查一次資料庫 */
export const currentSession = cache(async (): Promise<SessionUser | null> => {
  const claims = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, coreEnv().SESSION_SECRET);
  // proxy 只驗簽章；使用者被刪除或改過密碼（版本不符）要在這裡擋下
  return claims ? findSessionUser(claims) : null;
});

/** proxy 只驗簽章；Server Action（可被直接 POST）與讀資料的元件都要再呼叫，改密碼後簽章仍有效的舊 cookie 只有這裡擋得住 */
export async function requireSession(): Promise<SessionUser> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}
