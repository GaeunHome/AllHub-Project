import "server-only";
import { asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { coreUsers, type UserRole } from "../db/schema";

/** 管理頁的使用者清單；不含密碼雜湊與登入失敗紀錄 */
export type ManagedUser = { id: string; username: string; role: UserRole; createdAt: Date; disabledAt: Date | null };

/** 鎖定中的帳號與鎖定期限 */
export type LockedUser = { id: string; lockedUntil: Date };

/** 站長的操作不被允許（例如停用自己），訊息直接顯示在畫面上 */
export class AdminUserError extends Error {
  name = "AdminUserError";
}

export async function listUsers(): Promise<ManagedUser[]> {
  return db()
    .select({ id: coreUsers.id, username: coreUsers.username, role: coreUsers.role, createdAt: coreUsers.createdAt, disabledAt: coreUsers.disabledAt })
    .from(coreUsers)
    .orderBy(asc(coreUsers.createdAt), asc(coreUsers.username));
}

/** 回 false 代表帳號已經不在了（畫面太舊）；停用期間舊 cookie 由 requireSession 擋下 */
export async function setUserDisabled(actorId: string, userId: string, disabled: boolean, now = new Date()): Promise<boolean> {
  // 停用自己就沒有人能恢復了
  if (actorId === userId) throw new AdminUserError("不能停用自己的帳號");
  // 停用時 session 版本加一：恢復後他要重新登入，停用前（可能外洩）的 cookie 不會跟著復活
  const sessionVersion = disabled ? { sessionVersion: sql`${coreUsers.sessionVersion} + 1` } : {};
  const rows = await db()
    .update(coreUsers)
    .set({ disabledAt: disabled ? now : null, updatedAt: now, ...sessionVersion })
    .where(eq(coreUsers.id, userId))
    .returning({ id: coreUsers.id });
  return rows.length > 0;
}

/** 回 false 代表帳號已經不在了；刪除自己要到帳號頁輸入密碼，那裡會檢查是不是最後一個站長 */
export async function deleteUser(actorId: string, userId: string): Promise<boolean> {
  if (actorId === userId) throw new AdminUserError("不能在管理頁刪除自己的帳號");
  // 他的邀請、通知與各模組依使用者的資料由外鍵 on delete cascade 一起刪除；共用的翻譯只把發起人改成 null
  const rows = await db().delete(coreUsers).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
  return rows.length > 0;
}

/** 鎖定是登入失敗時寫入的，登入流程不讓快取失效（多一次對外請求，回應時間會透露帳號是否存在），所以管理頁每次直接讀 */
export async function listLockedUsers(now = new Date()): Promise<LockedUser[]> {
  const rows = await db().select({ id: coreUsers.id, lockedUntil: coreUsers.lockedUntil }).from(coreUsers).where(gt(coreUsers.lockedUntil, now));
  return rows.flatMap(({ id, lockedUntil }) => (lockedUntil ? [{ id, lockedUntil }] : []));
}

/** 只把登入失敗次數歸零、清掉鎖定期限，不改密碼與停用狀態；回 false 代表帳號已經不在了 */
export async function unlockUser(userId: string): Promise<boolean> {
  const rows = await db().update(coreUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
  return rows.length > 0;
}
