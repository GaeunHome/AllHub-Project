import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { remindersTags } from "./cache-tags";
import { listItems, type ReminderItem } from "./items";

// 只給頁面用 userId 是頁面從 session 拿到的登入者

/** 這個人全部的項目 今天要在快取外面過濾 不然過了午夜快取裡的舊資料會多顯示一天 */
export async function cachedReminders(userId: string): Promise<ReminderItem[]> {
  "use cache: remote";
  cacheLife("db");
  cacheTag(remindersTags.items);
  return listItems(userId);
}
