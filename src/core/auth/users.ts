import "server-only";
import { and, asc, eq, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { coreUsers, type UserRole } from "../db/schema";
import { hashPassword, needsRehash, newPasswordProblem, normalizeUsername, usernameProblem, verifyPassword } from "./credentials";
import type { SessionClaims } from "./session";

export type { UserRole } from "../db/schema";
export type SessionUser = { id: string; username: string; role: UserRole };

/** 連續錯 failures 次鎖一次；第 n 次鎖定的長度是 minutes[n-1] 分鐘，之後都用最後一個。上限不設太長：知道帳號的人可以故意鎖住別人 */
export const LOGIN_LOCK = { failures: 5, minutes: [15, 30, 60] } as const;

/** disabled 只在密碼正確時才會出現，不知道密碼的人分不出帳號是否存在或停用 */
export type AuthResult = { id: string; sessionVersion: number; disabled?: true };

export type ChangePasswordResult =
  | { ok: true; sessionVersion: number }
  | { ok: false; reason: "wrong_password" | "invalid" | "not_found" | "conflict"; error: string };

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "wrong_password" | "last_owner" | "not_found"; error: string };

const NOT_FOUND_MESSAGE = "找不到這個帳號，請重新登入";

/** 帳號不存在、格式不對或鎖定中都跑一次假的驗證，回應時間不透露帳號是否存在 */
export async function authenticate(usernameInput: string, password: string, now = new Date()): Promise<AuthResult | null> {
  const username = normalizeUsername(usernameInput);
  const user = usernameProblem(username) ? undefined : await reserveLoginAttempt(username, now);
  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) return null;

  await db().update(coreUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(coreUsers.id, user.id));
  if (needsRehash(user.passwordHash)) {
    // 只在雜湊沒被改過時寫回：同一時間在別處改了密碼，不能用舊密碼蓋回去；不遞增版本，其他裝置不受影響
    await db()
      .update(coreUsers)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(coreUsers.id, user.id), eq(coreUsers.passwordHash, user.passwordHash)));
  }
  return user.disabledAt ? { id: user.id, sessionVersion: user.sessionVersion, disabled: true } : { id: user.id, sessionVersion: user.sessionVersion };
}

/** 先把這次算成失敗再驗證密碼（成功時才歸零）：同時送出很多請求也只有鎖定前的幾次拿得到雜湊，不會趁計數還沒寫入時多猜 */
async function reserveLoginAttempt(username: string, now: Date) {
  const next = sql`(${coreUsers.failedLogins} + 1)`;
  const [user] = await db()
    .update(coreUsers)
    .set({ failedLogins: next, lockedUntil: lockedUntilAfter(next, now) })
    .where(and(eq(coreUsers.username, username), or(isNull(coreUsers.lockedUntil), lte(coreUsers.lockedUntil, now))))
    .returning({ id: coreUsers.id, passwordHash: coreUsers.passwordHash, sessionVersion: coreUsers.sessionVersion, disabledAt: coreUsers.disabledAt });
  return user;
}

/** 在同一個 update 裡算鎖定時間，不必先讀再寫；常數直接寫進 SQL，避免參數型別被推成 numeric 而變成小數除法 */
function lockedUntilAfter(count: SQL, now: Date): SQL {
  const { failures, minutes } = LOGIN_LOCK;
  const lockFor = (mins: number) => sql`${now.toISOString()}::timestamptz + make_interval(mins => ${sql.raw(String(mins))})`;
  const steps = minutes.slice(0, -1).map((mins, i) => sql`when ${count} = ${sql.raw(String(failures * (i + 1)))} then ${lockFor(mins)}`);
  return sql`case when ${count} % ${sql.raw(String(failures))} <> 0 then ${coreUsers.lockedUntil} ${sql.join(steps, sql` `)} else ${lockFor(minutes[minutes.length - 1])} end`;
}

/** 停用的帳號也查不到：站長停用後，簽章仍有效的 cookie 立刻失效 */
export async function findSessionUser({ userId, version }: SessionClaims): Promise<SessionUser | null> {
  const [user] = await db()
    .select({ id: coreUsers.id, username: coreUsers.username, role: coreUsers.role })
    .from(coreUsers)
    .where(and(eq(coreUsers.id, userId), eq(coreUsers.sessionVersion, version), isNull(coreUsers.disabledAt)));
  return user ?? null;
}

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db().select({ id: coreUsers.id }).from(coreUsers).limit(1);
  return rows.length > 0;
}

/** 成功時 session 版本遞增，其他裝置的 cookie 立刻失效；呼叫端要用回傳的新版本重新簽發這台裝置的 cookie */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  // 長度與常見密碼不必查資料庫就能判斷；包含帳號名稱要等讀到帳號才知道
  const problem = newPasswordProblem(newPassword);
  if (problem) return { ok: false, reason: "invalid", error: problem };

  const [user] = await db().select().from(coreUsers).where(eq(coreUsers.id, userId));
  if (!(await verifyPassword(currentPassword, user?.passwordHash ?? null)) || !user) {
    return user ? { ok: false, reason: "wrong_password", error: "目前的密碼不正確" } : { ok: false, reason: "not_found", error: NOT_FOUND_MESSAGE };
  }
  const nameProblem = newPasswordProblem(newPassword, user.username);
  if (nameProblem) return { ok: false, reason: "invalid", error: nameProblem };
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

/** 要再輸入一次密碼：偷到 cookie 的人不能直接刪掉別人的帳號；最後一個（未停用的）站長不能刪除自己，否則沒人能管理 */
export async function deleteOwnAccount(userId: string, password: string): Promise<DeleteAccountResult> {
  const [user] = await db().select({ passwordHash: coreUsers.passwordHash }).from(coreUsers).where(eq(coreUsers.id, userId));
  if (!(await verifyPassword(password, user?.passwordHash ?? null)) || !user) {
    return user ? { ok: false, reason: "wrong_password", error: "密碼不正確" } : { ok: false, reason: "not_found", error: NOT_FOUND_MESSAGE };
  }

  return db().transaction(async (tx): Promise<DeleteAccountResult> => {
    // 依 id 順序鎖住所有站長：兩個站長同時刪除自己時，後一個要等前一個完成，才看得到真正剩下幾個
    const owners = await tx
      .select({ id: coreUsers.id, disabledAt: coreUsers.disabledAt })
      .from(coreUsers)
      .where(eq(coreUsers.role, "owner"))
      .orderBy(asc(coreUsers.id))
      .for("update");
    const isOwner = owners.some((owner) => owner.id === userId);
    if (isOwner && !owners.some((owner) => owner.id !== userId && owner.disabledAt === null)) {
      return { ok: false, reason: "last_owner", error: "你是唯一的站長，不能刪除自己的帳號" };
    }
    // 他的邀請、通知與各模組依使用者的資料（追蹤、API Key、HoYoLAB 帳號、記帳）由外鍵 on delete cascade 一起刪除；共用的翻譯只把發起人改成 null
    const deleted = await tx.delete(coreUsers).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
    return deleted.length > 0 ? { ok: true } : { ok: false, reason: "not_found", error: NOT_FOUND_MESSAGE };
  });
}
