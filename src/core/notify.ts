import "server-only";
import { and, inArray, isNull } from "drizzle-orm";
import { expireTags } from "./cache";
import { db } from "./db";
import { coreNotifications, coreUsers } from "./db/schema";
import { notificationsTag } from "./notifications/cache-tags";
import { linkTarget } from "./notifications/links";

/** recipients 是收件人的使用者 id（追蹤者、帳號擁有者…），由各模組依自己的規則決定；module 是發通知的模組 id：通知頁依它篩選，導覽列依它標未讀數 */
export type NotifyInput = { recipients: readonly string[]; module: string; kind: string; title: string; body?: string; url?: string | null };

const MODULE_ID = /^[a-z][a-z0-9-]{0,31}$/;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 各模組共用的通知出口：每個收件人各寫一則網站內通知（core_notifications），他的鈴鐺輪詢時就會看到 */
export async function notify({ recipients, module, kind, title, body = "", url }: NotifyInput): Promise<void> {
  // 這些都是呼叫端決定的值，不對就是程式錯誤，直接丟出來
  if (!MODULE_ID.test(module)) throw new Error(`notify：模組 id 格式不對（${module}）`);
  if (!kind.trim() || !title.trim()) throw new Error("notify：缺少 kind 或 title");
  if (recipients.some((id) => !USER_ID.test(id))) throw new Error("notify：收件人要是使用者 id");
  const userIds = [...new Set(recipients)];
  if (userIds.length === 0) return;

  const values = { module, kind, title: title.trim(), body: body.trim(), url: linkTarget(url)?.href ?? null };
  // 只寫給還存在的帳號，並鎖住到寫完：查出追蹤者之後才刪除帳號的人直接略過，不會因為外鍵錯誤讓其他人也收不到；停用的帳號是凍結，也不寫
  const inserted = await db().transaction(async (tx) => {
    const users = await tx
      .select({ id: coreUsers.id })
      .from(coreUsers)
      .where(and(inArray(coreUsers.id, userIds), isNull(coreUsers.disabledAt)))
      .for("key share");
    if (users.length === 0) return 0;
    const rows = await tx
      .insert(coreNotifications)
      .values(users.map((user) => ({ userId: user.id, ...values })))
      .returning({ id: coreNotifications.id });
    return rows.length;
  });
  // 只會在 webhook、排程、after() 裡被呼叫，不是 Server Action，用 expireTags
  if (inserted > 0) expireTags(notificationsTag);
}
