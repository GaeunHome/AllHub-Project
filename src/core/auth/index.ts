import "server-only";
import { navigation } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after, connection } from "next/server";
import { cache } from "react";
import { coreEnv } from "../env";
import { logError } from "../errors";
import { canUseModule, deniedModules } from "./module-access";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySessionToken } from "./session";
import { findSessionRow, LAST_SEEN_INTERVAL_MS, touchLastSeen, type SessionUser } from "./users";

export { canUseModule, deniedModules } from "./module-access";
export type { SessionUser, UserRole } from "./users";

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

/** 同一次請求很多元件都會檢查登入 用 React cache 只查一次資料庫 */
export const currentSession = cache(async (): Promise<SessionUser | null> => {
  // 站內連結的預先抓取不讀 cookie 直接用建置時的外框 點進去才查登入
  // Route Handler 與 Server Action 呼叫時會直接往下走
  await navigation();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // 驗證期限要讀現在的時間 預先算繪時不能讀 等真的有請求才驗
  await connection();
  const claims = await verifySessionToken(token, coreEnv().SESSION_SECRET);
  // proxy 只驗簽章 被刪除 停用或改過密碼的使用者要在這裡擋下
  const row = claims ? await findSessionRow(claims) : null;
  if (!row) return null;
  noteLastSeen(row.user.id, row.lastSeenAt, new Date());
  return row.user;
});

/** 站長在管理頁看多久沒來 回應送出後才寫 不拖慢頁面 */
function noteLastSeen(userId: string, lastSeenAt: Date | null, now: Date): void {
  if (lastSeenAt && now.getTime() - lastSeenAt.getTime() < LAST_SEEN_INTERVAL_MS) return;
  after(() => touchLastSeen(userId, now).catch((error: unknown) => logError("auth", "記錄最後上線失敗", error)));
}

/**
 * proxy 只驗簽章 Server Action 與讀資料的元件都要呼叫
 * 改密碼後的舊 cookie 與停用的帳號只有這裡擋得住
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}

/** 管理頁與管理用的 Server Action 都要呼叫 cookie 不帶角色 每次從資料庫讀 */
export async function requireOwner(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.role !== "owner") redirect("/");
  return session;
}

/**
 * 導覽列藏起來擋不住直接打開網址
 * 不能用時導回首頁 不說原因
 */
export async function requireModule(moduleId: string): Promise<SessionUser> {
  const session = await requireSession();
  if (!(await canUseModule(session, moduleId))) redirect("/");
  return session;
}

/** 導覽列 首頁與提醒方式只列這個人能用的模組 順序不變 */
export async function usableModules<T extends { id: string }>(modules: readonly T[]): Promise<T[]> {
  const denied = await deniedModules(await requireSession());
  return modules.filter((module) => !denied.has(module.id));
}
