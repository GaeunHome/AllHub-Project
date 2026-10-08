import "server-only";
import { expireTags } from "./cache";
import { db } from "./db";
import { coreNotifications } from "./db/schema";
import { notificationsTag } from "./notifications/cache-tags";
import { linkTarget } from "./notifications/links";

/** module 是發通知的模組 id（twitch、youtube…）：通知頁依它篩選，導覽列依它標未讀數 */
export type NotifyInput = { module: string; kind: string; title: string; body?: string; url?: string | null };

const MODULE_ID = /^[a-z][a-z0-9-]{0,31}$/;

/** 各模組共用的通知出口：寫進網站內通知（core_notifications），鈴鐺輪詢時就會看到 */
export async function notify({ module, kind, title, body = "", url }: NotifyInput): Promise<void> {
  // 這些都是呼叫端寫死的值，不對就是程式錯誤，直接丟出來
  if (!MODULE_ID.test(module)) throw new Error(`notify：模組 id 格式不對（${module}）`);
  if (!kind.trim() || !title.trim()) throw new Error("notify：缺少 kind 或 title");

  await db()
    .insert(coreNotifications)
    .values({ module, kind, title: title.trim(), body: body.trim(), url: linkTarget(url)?.href ?? null });
  // 只會在 webhook、排程、after() 裡被呼叫，不是 Server Action，用 expireTags
  expireTags(notificationsTag);
}
