import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { coreUsers } from "../db/schema";
import { hashPassword, needsRehash, normalizeUsername, passwordProblem, usernameProblem, verifyPassword } from "./credentials";
import type { SessionClaims } from "./session";

export type SessionUser = { id: string; username: string };

export type ChangePasswordResult =
  | { ok: true; sessionVersion: number }
  | { ok: false; reason: "wrong_password" | "invalid" | "not_found" | "conflict"; error: string };

/** 帳號不存在或格式不對時也跑一次假的驗證，回應時間不透露帳號是否存在 */
export async function authenticate(usernameInput: string, password: string): Promise<{ id: string; sessionVersion: number } | null> {
  const username = normalizeUsername(usernameInput);
  const [user] = usernameProblem(username) ? [] : await db().select().from(coreUsers).where(eq(coreUsers.username, username));
  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) return null;

  if (needsRehash(user.passwordHash)) {
    // 只在雜湊沒被改過時寫回：同一時間在別處改了密碼，不能用舊密碼蓋回去；不遞增版本，其他裝置不受影響
    await db()
      .update(coreUsers)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(coreUsers.id, user.id), eq(coreUsers.passwordHash, user.passwordHash)));
  }
  return { id: user.id, sessionVersion: user.sessionVersion };
}

export async function findSessionUser({ userId, version }: SessionClaims): Promise<SessionUser | null> {
  const [user] = await db()
    .select({ id: coreUsers.id, username: coreUsers.username })
    .from(coreUsers)
    .where(and(eq(coreUsers.id, userId), eq(coreUsers.sessionVersion, version)));
  return user ?? null;
}

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db().select({ id: coreUsers.id }).from(coreUsers).limit(1);
  return rows.length > 0;
}

/** 成功時 session 版本遞增，其他裝置的 cookie 立刻失效；呼叫端要用回傳的新版本重新簽發這台裝置的 cookie */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, reason: "invalid", error: problem };

  const [user] = await db().select().from(coreUsers).where(eq(coreUsers.id, userId));
  if (!(await verifyPassword(currentPassword, user?.passwordHash ?? null)) || !user) {
    return user ? { ok: false, reason: "wrong_password", error: "目前的密碼不正確" } : { ok: false, reason: "not_found", error: "找不到這個帳號，請重新登入" };
  }
  if (newPassword.normalize("NFKC") === currentPassword.normalize("NFKC")) return { ok: false, reason: "invalid", error: "新密碼不能跟目前的密碼一樣" };

  const [updated] = await db()
    .update(coreUsers)
    .set({ passwordHash: await hashPassword(newPassword), sessionVersion: sql`${coreUsers.sessionVersion} + 1`, updatedAt: new Date() })
    // 驗證完到寫入之間密碼若被別處改掉，就不覆蓋
    .where(and(eq(coreUsers.id, userId), eq(coreUsers.passwordHash, user.passwordHash)))
    .returning({ sessionVersion: coreUsers.sessionVersion });
  if (!updated) return { ok: false, reason: "conflict", error: "密碼剛被變更過，請重新登入後再試" };
  return { ok: true, sessionVersion: updated.sessionVersion };
}
