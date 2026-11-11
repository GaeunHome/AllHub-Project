import "server-only";
import { desc, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { coreAnnouncements, type CoreAnnouncement } from "../db/schema";
import { ANNOUNCEMENT_RETENTION_DAYS, retentionCutoff } from "../retention";
import type { AnnouncementInput } from "./rules";

export async function listAnnouncements(): Promise<CoreAnnouncement[]> {
  return db().select().from(coreAnnouncements).orderBy(desc(coreAnnouncements.createdAt), desc(coreAnnouncements.id));
}

export async function createAnnouncement(input: AnnouncementInput): Promise<CoreAnnouncement> {
  const [row] = await db().insert(coreAnnouncements).values(input).returning();
  return row;
}

export async function updateAnnouncement(id: number, input: AnnouncementInput): Promise<boolean> {
  const updated = await db().update(coreAnnouncements).set({ ...input, updatedAt: new Date() }).where(eq(coreAnnouncements.id, id)).returning({ id: coreAnnouncements.id });
  return updated.length > 0;
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  const deleted = await db().delete(coreAnnouncements).where(eq(coreAnnouncements.id, id)).returning({ id: coreAnnouncements.id });
  return deleted.length > 0;
}

/** 排程用 結束時間比保留期還早的刪掉 沒寫結束時間的比較不到 會留著 回傳摘要 */
export async function cleanupAnnouncements(now = new Date()): Promise<string> {
  const deleted = await db()
    .delete(coreAnnouncements)
    .where(lt(coreAnnouncements.endsAt, retentionCutoff(now, ANNOUNCEMENT_RETENTION_DAYS)))
    .returning({ id: coreAnnouncements.id });
  return `刪除 ${deleted.length} 則結束超過 ${ANNOUNCEMENT_RETENTION_DAYS} 天的公告`;
}
