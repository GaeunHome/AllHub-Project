import { eq } from "drizzle-orm";
import type { TestDb } from "@/dev/test-db";
import { remindersItems } from "../data/schema";

type ItemValues = Partial<typeof remindersItems.$inferInsert> & { date: string };

/** 前置資料直接寫進資料表 不用受測的函式自己驗自己 預設是當天通知 */
export async function insertItem(db: TestDb, userId: string, values: ItemValues) {
  const [row] = await db
    .insert(remindersItems)
    .values({ title: "繳房屋稅", notifyDaysBefore: 0, ...values, userId })
    .returning();
  return row;
}

/** 一次寫很多個 測上限用 標題照順序編號 */
export async function insertItems(db: TestDb, userId: string, count: number, date: string) {
  await db.insert(remindersItems).values(Array.from({ length: count }, (_, i) => ({ userId, title: `提醒 ${i + 1}`, date })));
}

/** 結果直接查資料表 照 id 排 */
export const itemsOf = (db: TestDb, userId: string) => db.select().from(remindersItems).where(eq(remindersItems.userId, userId)).orderBy(remindersItems.id);

/** 所有人的項目 web 的測試不能直接 import data 的資料表 */
export const allItems = (db: TestDb) => db.select().from(remindersItems);
