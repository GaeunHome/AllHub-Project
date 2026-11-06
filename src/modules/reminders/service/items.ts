import "server-only";
import { and, asc, count, eq, gte, ne, or, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { lockUserRow } from "@/core/db/users";
import { taipeiDateKey } from "@/core/time";
import { remindersItems } from "../data/schema";
import { ITEM_LIMIT, nextOccurrence, parseReminder, type ReminderInput, type ReminderValues } from "../lib/rules";
import { ReminderNotFoundError, ReminderUserError } from "./errors";

// userId 一律是登入者 表單送來的 id 只決定操作哪一筆 別人的當作不存在

export type ReminderItem = ReminderValues & { id: number };

const ITEM_COLUMNS = { id: remindersItems.id, title: remindersItems.title, date: remindersItems.date, notifyDaysBefore: remindersItems.notifyDaysBefore, repeat: remindersItems.repeat };

const ownRow = (userId: string, id: number) => and(eq(remindersItems.id, id), eq(remindersItems.userId, userId));
/** 日期當天還沒過期 隔天才算 重複的不會過期 */
const notExpired = (today: string) => or(gte(remindersItems.date, today), ne(remindersItems.repeat, "none"));

function parsed(input: ReminderInput, today: string): ReminderValues {
  const result = parseReminder(input, today);
  if (!result.ok) throw new ReminderUserError(result.error);
  return result.value;
}

/** 這個人全部的項目 照日期排 同一天先建立的在前 過期還沒刪的也在裡面 由呼叫端過濾 */
export async function listItems(userId: string): Promise<ReminderItem[]> {
  return db().select(ITEM_COLUMNS).from(remindersItems).where(eq(remindersItems.userId, userId)).orderBy(asc(remindersItems.date), asc(remindersItems.id));
}

export async function createItem(userId: string, input: ReminderInput, now = new Date()): Promise<ReminderItem> {
  const today = taipeiDateKey(now);
  const values = parsed(input, today);
  return db().transaction(async (tx) => {
    // 鎖住這個使用者再數 同一個人同時新增時一個一個來 清單是空的時也沒有列可鎖
    await lockUserRow(tx, userId, "no key update");
    const [{ active }] = await tx
      .select({ active: count() })
      .from(remindersItems)
      .where(and(eq(remindersItems.userId, userId), notExpired(today)));
    if (active >= ITEM_LIMIT) throw new ReminderUserError(`提醒已滿 ${ITEM_LIMIT} 個，請先刪除一個`);
    const [row] = await tx
      .insert(remindersItems)
      .values({ userId, ...values })
      .returning(ITEM_COLUMNS);
    return row;
  });
}

/** 過期還沒刪的當作不存在 畫面已經看不到 改回未來的話上限就擋不住了 */
export async function updateItem(userId: string, id: number, input: ReminderInput, now = new Date()): Promise<ReminderItem> {
  const today = taipeiDateKey(now);
  const values = parsed(input, today);
  const [current] = await db()
    .select(ITEM_COLUMNS)
    .from(remindersItems)
    .where(and(ownRow(userId, id), notExpired(today)));
  if (!current) throw new ReminderNotFoundError();
  // 視窗顯示的是下一次 沒改就留第一次的日期 不然 31 號存成 30 號之後就回不去了
  const unchanged = values.repeat === current.repeat && values.date === nextOccurrence(current, today);
  const [row] = await db()
    .update(remindersItems)
    .set({ ...values, date: unchanged ? current.date : values.date, updatedAt: sql`now()` })
    .where(and(ownRow(userId, id), notExpired(today)))
    .returning(ITEM_COLUMNS);
  if (!row) throw new ReminderNotFoundError();
  return row;
}

/** 回傳標題給畫面寫訊息 */
export async function deleteItem(userId: string, id: number): Promise<{ title: string }> {
  const [row] = await db().delete(remindersItems).where(ownRow(userId, id)).returning({ title: remindersItems.title });
  if (!row) throw new ReminderNotFoundError();
  return row;
}
