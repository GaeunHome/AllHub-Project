import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { coreAnnouncements, type CoreAnnouncement } from "../db/schema";
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
