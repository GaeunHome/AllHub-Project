import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, gte, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { currentSession } from "./auth";
import { clientIp } from "./auth/rate-limit";
import { db } from "./db";
import { coreAuditLogs, coreUsers, type AuditOutcome } from "./db/schema";
import { logError } from "./errors";
import { AUDIT_RETENTION_DAYS } from "./retention";
import { deleteExpired } from "./retention-cleanup";
import { HOUR_MS } from "./time";

export const ANONYMOUS_ACTOR = "（未登入）";
export const UNKNOWN_ACCOUNT = "不存在的帳號";
/**
 * 一小時最多這麼多列合併的失敗 超過的全部算進同一列
 * 換 IP 打也不會把資料表灌滿 7 天最多約 3 萬列
 */
export const MERGED_ROWS_PER_HOUR = 200;
const MANY_IPS = "多個 IP";

export type AuditActor = { id: string | null; name: string; ip: string };
export type AuditEntry = { module: string; action: string; outcome?: AuditOutcome; target?: string | null; detail?: string | null };

/** 現在是誰 從哪個 IP 動作開始前呼叫 刪除帳號之後就讀不到了 */
export async function auditActor(): Promise<AuditActor> {
  const [session, requestHeaders] = await Promise.all([currentSession(), headers()]);
  return { id: session?.id ?? null, name: session?.username ?? ANONYMOUS_ACTOR, ip: clientIp(requestHeaders.get("x-forwarded-for")) };
}

/** 同一次呼叫的項目共用一個批次編號 */
export async function writeAudit(actor: AuditActor, entries: readonly AuditEntry[], now = new Date()): Promise<void> {
  const batchId = randomUUID();
  await db()
    .insert(coreAuditLogs)
    .values(entries.map((entry) => ({ ...rowOf(actor, entry, now), batchId })));
}

function rowOf(actor: AuditActor, entry: AuditEntry, now: Date) {
  return {
    createdAt: now,
    actorId: actor.id,
    actorName: actor.name,
    ip: actor.ip,
    module: entry.module,
    action: entry.action,
    outcome: entry.outcome ?? ("success" as const),
    target: entry.target ?? null,
    detail: entry.detail ?? null,
  };
}

/** 回應送出後才寫 登入的回應時間才不會洩漏帳號存不存在 寫不進去只記 log 不影響使用者的操作 */
function later(write: () => Promise<void>): void {
  after(() => write().catch((error: unknown) => logError("audit", "寫入操作紀錄失敗", error)));
}

export function audit(actor: AuditActor, ...entries: AuditEntry[]): void {
  later(() => writeAudit(actor, entries));
}

const hashOf = (...parts: (string | number | null)[]) => createHash("sha256").update(parts.join("|")).digest("hex");

/**
 * 登入與註冊失敗誰都能觸發 同一小時同一件事同一個 IP 合併成一列 算次數
 * 超過上限時連 IP 也合併 資料表才不會被刷登入灌滿
 */
export async function writeMergedFailure(actor: AuditActor, entry: AuditEntry, now = new Date()): Promise<void> {
  const hour = Math.floor(now.getTime() / HOUR_MS);
  const hourStart = new Date(hour * HOUR_MS);
  const [{ rows }] = await db()
    .select({ rows: count() })
    .from(coreAuditLogs)
    .where(and(isNotNull(coreAuditLogs.mergeKey), gte(coreAuditLogs.createdAt, hourStart)));
  const overflow = rows >= MERGED_ROWS_PER_HOUR;
  const row = overflow ? rowOf({ ...actor, ip: MANY_IPS }, { ...entry, target: null, detail: null }, now) : rowOf(actor, { ...entry, outcome: "failure" }, now);
  const mergeKey = overflow ? hashOf(hour, "overflow") : hashOf(hour, entry.module, entry.action, entry.target ?? null, actor.ip);
  await db()
    .insert(coreAuditLogs)
    .values({ ...row, outcome: "failure", batchId: randomUUID(), mergeKey })
    .onConflictDoUpdate({ target: coreAuditLogs.mergeKey, set: { attempts: sql`${coreAuditLogs.attempts} + 1`, createdAt: now } });
}

/** 打錯的帳號可能是密碼打錯欄位 不存在的帳號不存原文 */
export async function writeLoginFailure(actor: AuditActor, username: string, now = new Date()): Promise<void> {
  const [user] = await db().select({ id: coreUsers.id }).from(coreUsers).where(eq(coreUsers.username, username));
  await writeMergedFailure(actor, { module: "auth", action: "登入失敗", target: user ? username : UNKNOWN_ACCOUNT }, now);
}

export function auditLoginFailure(actor: AuditActor, username: string): void {
  later(() => writeLoginFailure(actor, username));
}

export function auditMergedFailure(actor: AuditActor, entry: AuditEntry): void {
  later(() => writeMergedFailure(actor, entry));
}

export function cleanupAudit(now = new Date()): Promise<string> {
  return deleteExpired(coreAuditLogs.createdAt, "操作紀錄", now, AUDIT_RETENTION_DAYS);
}
