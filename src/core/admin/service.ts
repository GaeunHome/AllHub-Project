import "server-only";
import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { coreAuditLogs, coreModuleDenials, coreUsers, type UserRole } from "../db/schema";
import { userAvatar, userLastSeen } from "../db/users";
import { UserError } from "../form";
import { AUDIT_PAGE_SIZE, type AuditQuery } from "./audit-query";

/** 管理頁的使用者清單 不含密碼雜湊與登入失敗紀錄 */
export type ManagedUser = { id: string; username: string; nickname: string | null; avatar: string | null; role: UserRole; createdAt: Date; disabledAt: Date | null };

export type LockedUser = { id: string; lockedUntil: Date };

/** 只記不能用的 沒有列出來的模組都能用 */
export type ModuleDenial = { userId: string; moduleId: string };

/** 站長的操作不被允許 例如停用自己 訊息會直接顯示在畫面上 */
export class AdminUserError extends UserError {
  name = "AdminUserError";
}

export async function listUsers(): Promise<ManagedUser[]> {
  return db()
    .select({ id: coreUsers.id, username: coreUsers.username, nickname: coreUsers.nickname, avatar: userAvatar, role: coreUsers.role, createdAt: coreUsers.createdAt, disabledAt: coreUsers.disabledAt })
    .from(coreUsers)
    .orderBy(asc(coreUsers.createdAt), asc(coreUsers.username));
}

/** 回 false 代表帳號已經不在 停用期間的舊 cookie 由 requireSession 擋下 */
export async function setUserDisabled(actorId: string, userId: string, disabled: boolean, now = new Date()): Promise<boolean> {
  // 停用自己就沒有人能恢復了
  if (actorId === userId) throw new AdminUserError("不能停用自己的帳號");
  // 停用時 session 版本加一 恢復後要重新登入 停用前可能外洩的 cookie 不會復活
  const sessionVersion = disabled ? { sessionVersion: sql`${coreUsers.sessionVersion} + 1` } : {};
  const rows = await db()
    .update(coreUsers)
    .set({ disabledAt: disabled ? now : null, updatedAt: now, ...sessionVersion })
    .where(eq(coreUsers.id, userId))
    .returning({ id: coreUsers.id });
  return rows.length > 0;
}

/** 回 false 代表帳號已經不在 刪除自己要到帳號頁 那裡會檢查是不是最後一個站長 */
export async function deleteUser(actorId: string, userId: string): Promise<boolean> {
  if (actorId === userId) throw new AdminUserError("不能在管理頁刪除自己的帳號");
  // 邀請 通知與各模組依使用者的資料靠外鍵 cascade 一起刪
  // 共用的翻譯只把發起人改成 null
  const rows = await db().delete(coreUsers).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
  return rows.length > 0;
}

/**
 * 登入失敗寫入鎖定時不讓快取失效 回應時間才不會透露帳號是否存在
 * 所以管理頁每次直接讀
 */
/** 操作紀錄寫帳號名稱才看得懂 找不到時寫 id */
export async function usernameOf(userId: string): Promise<string> {
  try {
    const [row] = await db().select({ username: coreUsers.username }).from(coreUsers).where(eq(coreUsers.id, userId));
    return row?.username ?? userId;
  } catch {
    // 只是紀錄上的名字 讀不到不能擋住站長的操作
    return userId;
  }
}

export type AuditLogRow = typeof coreAuditLogs.$inferSelect;

/** 每次直接讀不走快取 每個操作都在寫這張表 快取一下就過期了 */
export async function listAuditLogs({ actor, module, outcome, ip, batch, page }: AuditQuery): Promise<{ rows: AuditLogRow[]; total: number }> {
  const where = and(
    actor ? eq(coreAuditLogs.actorName, actor) : undefined,
    module ? eq(coreAuditLogs.module, module) : undefined,
    outcome ? eq(coreAuditLogs.outcome, outcome) : undefined,
    ip ? eq(coreAuditLogs.ip, ip) : undefined,
    batch ? eq(coreAuditLogs.batchId, batch) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db()
      .select()
      .from(coreAuditLogs)
      .where(where)
      .orderBy(desc(coreAuditLogs.createdAt), desc(coreAuditLogs.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db().select({ total: count() }).from(coreAuditLogs).where(where),
  ]);
  return { rows, total };
}

/** 篩選的下拉選單 只列紀錄裡真的有的人 */
export async function listAuditActors(): Promise<string[]> {
  const rows = await db().selectDistinct({ name: coreAuditLogs.actorName }).from(coreAuditLogs).orderBy(coreAuditLogs.actorName);
  return rows.map((row) => row.name);
}

export async function listLockedUsers(now = new Date()): Promise<LockedUser[]> {
  const rows = await db().select({ id: coreUsers.id, lockedUntil: coreUsers.lockedUntil }).from(coreUsers).where(gt(coreUsers.lockedUntil, now));
  return rows.flatMap(({ id, lockedUntil }) => (lockedUntil ? [{ id, lockedUntil }] : []));
}

/** 每次直接讀 使用者清單的快取不會因為有人上線而失效 還沒有紀錄的不列 */
export async function listLastSeen(): Promise<Map<string, Date>> {
  const rows = await db().select({ id: coreUsers.id, lastSeenAt: userLastSeen }).from(coreUsers);
  return new Map(rows.flatMap(({ id, lastSeenAt }) => (lastSeenAt ? [[id, new Date(lastSeenAt)] as const] : [])));
}

/** 只清掉失敗次數與鎖定期限 不改密碼與停用狀態 回 false 代表帳號已經不在 */
export async function unlockUser(userId: string): Promise<boolean> {
  const rows = await db().update(coreUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(coreUsers.id, userId)).returning({ id: coreUsers.id });
  return rows.length > 0;
}

/** 權限每次都讀最新 管理頁也不走快取 */
export async function listModuleDenials(): Promise<ModuleDenial[]> {
  return db().select({ userId: coreModuleDenials.userId, moduleId: coreModuleDenials.moduleId }).from(coreModuleDenials);
}

/** 回 false 代表帳號已經不在 站長一律全部能用 所以不能關掉 */
export async function setModuleAccess(userId: string, moduleId: string, allowed: boolean): Promise<boolean> {
  return db().transaction(async (tx) => {
    // 鎖到寫完 同時刪除帳號時才不會撞到外鍵
    const [user] = await tx.select({ role: coreUsers.role }).from(coreUsers).where(eq(coreUsers.id, userId)).for("key share");
    if (!user) return false;
    if (user.role === "owner") throw new AdminUserError("站長一律全部能用");
    if (allowed) await tx.delete(coreModuleDenials).where(and(eq(coreModuleDenials.userId, userId), eq(coreModuleDenials.moduleId, moduleId)));
    else await tx.insert(coreModuleDenials).values({ userId, moduleId }).onConflictDoNothing();
    return true;
  });
}
