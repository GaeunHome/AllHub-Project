import "server-only";
import { claimKey, sendOnce } from "@/core/claim";
import { notifiedSince, notify } from "@/core/notify";
import type { StarrailAccount } from "../data/schema";

// 星穹鐵道的通知都從這裡寄 只寄給帳號的擁有者
// service 不能 import 模組根目錄的 info.ts 模組 id 寫在這裡
const MODULE_ID = "starrail";

/** kind 是通知的種類 提醒偏好與一週一則的判斷都看它 */
type Notice = { kind: string; title: string; body: string; url: string };

export function notifyOwner(userId: string, notice: Notice): Promise<void> {
  return notify({ recipients: [userId], module: MODULE_ID, ...notice });
}

/**
 * 同一個帳號同一期只寄一次 先認領再寄 寄不出去就放掉 下一輪排程再試
 * 認領記在 core_rate_limits 一天後就刪 所以每種提醒的時段都短於一天
 */
export function notifyOnce(account: StarrailAccount, period: string, now: Date, notice: Notice): Promise<boolean> {
  return sendOnce(
    { scope: `starrail:${notice.kind}`, key: claimKey(account.id, period), now, log: { module: MODULE_ID, what: "放掉通知的認領失敗" } },
    () => notifyOwner(account.userId, notice),
  );
}

/** 這個人在 since 之後有沒有收過連到同一個地方的同一種通知 */
export function notifiedOwnerSince(userId: string, kind: string, since: Date, url: string): Promise<boolean> {
  return notifiedSince({ userId, module: MODULE_ID, kind, since, url });
}
