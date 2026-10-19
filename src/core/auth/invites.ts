import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, type Executor } from "../db";
import { coreInvites, coreUsers } from "../db/schema";
import { UserError } from "../form";
import { DAY_MS } from "../time";
import { INVITE_DAY_OPTIONS, INVITE_NOTE_MAX_LENGTH, INVITE_USE_OPTIONS } from "./invite-rules";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// 管理頁只列最近的邀請 小網站用不到更多
const LIST_LIMIT = 100;

export type InviteStatus = "active" | "expired" | "used_up" | "revoked";

/** 管理頁的清單 不含邀請碼雜湊 createdBy 是建立者的帳號名稱 */
export type InviteSummary = {
  id: number;
  note: string | null;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  maxUses: number;
  usedCount: number;
  revokedAt: Date | null;
};

/** 站長輸入錯誤 例如期限 次數 備註 訊息直接顯示在表單上 */
export class InviteInputError extends UserError {
  name = "InviteInputError";
}

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** 邀請碼是 256 位元亂數 不必像密碼用慢的雜湊 sha256 就查不回原文 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 網址上的 code 格式不對就不必查資料庫 */
export function isInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** 撤銷優先 再來是用完 最後才看期限 用完的就算過期 站長關心的是被用掉了 */
export function inviteStatus(invite: Pick<InviteSummary, "expiresAt" | "maxUses" | "usedCount" | "revokedAt">, now: Date): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.usedCount >= invite.maxUses) return "used_up";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/** 回傳的 token 只在這裡出現一次 資料庫只存雜湊 之後拿不回原本的連結 */
export async function createInvite(
  { createdBy, days, maxUses, note }: { createdBy: string; days: number; maxUses: number; note?: string | null },
  now = new Date(),
): Promise<{ token: string; id: number; expiresAt: Date }> {
  if (!(INVITE_DAY_OPTIONS as readonly number[]).includes(days)) throw new InviteInputError("期限只能選 1、7 或 30 天");
  if (!(INVITE_USE_OPTIONS as readonly number[]).includes(maxUses)) throw new InviteInputError("次數只能選 1、5 或 10 次");
  const trimmed = note?.trim() ?? "";
  if ([...trimmed].length > INVITE_NOTE_MAX_LENGTH) throw new InviteInputError(`備註最多 ${INVITE_NOTE_MAX_LENGTH} 個字`);

  const token = generateInviteToken();
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  const [row] = await db()
    .insert(coreInvites)
    .values({ tokenHash: hashInviteToken(token), createdBy, createdAt: now, expiresAt, maxUses, note: trimmed || null })
    .returning({ id: coreInvites.id });
  return { token, id: row.id, expiresAt };
}

const usable = (token: string, now: Date) =>
  and(eq(coreInvites.tokenHash, hashInviteToken(token)), isNull(coreInvites.revokedAt), gt(coreInvites.expiresAt, now), lt(coreInvites.usedCount, coreInvites.maxUses));

/** 註冊頁打開時先檢查 無效就不顯示表單 真正用掉次數在 consumeInvite */
export async function findUsableInvite(token: string, now = new Date()): Promise<{ id: number; expiresAt: Date } | null> {
  if (!isInviteToken(token)) return null;
  const [row] = await db().select({ id: coreInvites.id, expiresAt: coreInvites.expiresAt }).from(coreInvites).where(usable(token, now));
  return row ?? null;
}

/**
 * 條件式 update 同時用同一個邀請時資料庫一次只讓一個加一 後到的會重新檢查條件
 * 註冊時要跟建立帳號在同一個交易裡 所以也收交易的 tx
 */
export async function consumeInvite(token: string, now = new Date(), executor: Executor = db()): Promise<number | null> {
  if (!isInviteToken(token)) return null;
  const [row] = await executor
    .update(coreInvites)
    .set({ usedCount: sql`${coreInvites.usedCount} + 1` })
    .where(usable(token, now))
    .returning({ id: coreInvites.id });
  return row?.id ?? null;
}

export async function listInvites(limit = LIST_LIMIT): Promise<InviteSummary[]> {
  return db()
    .select({
      id: coreInvites.id,
      note: coreInvites.note,
      createdBy: coreUsers.username,
      createdAt: coreInvites.createdAt,
      expiresAt: coreInvites.expiresAt,
      maxUses: coreInvites.maxUses,
      usedCount: coreInvites.usedCount,
      revokedAt: coreInvites.revokedAt,
    })
    .from(coreInvites)
    .innerJoin(coreUsers, eq(coreInvites.createdBy, coreUsers.id))
    .orderBy(desc(coreInvites.createdAt), desc(coreInvites.id))
    .limit(limit);
}

/** 已經撤銷或不存在時回 false 不改撤銷時間 */
export async function revokeInvite(id: number, now = new Date()): Promise<boolean> {
  const rows = await db()
    .update(coreInvites)
    .set({ revokedAt: now })
    .where(and(eq(coreInvites.id, id), isNull(coreInvites.revokedAt)))
    .returning({ id: coreInvites.id });
  return rows.length > 0;
}
