import "server-only";
import { expiringTask } from "@/core/cache";
import type { CronTask } from "@/core/module";
import { savingsTags } from "./service/cache-tags";
import { sendDividendNotices } from "./service/dividend-notices";
import { postDueRecurring } from "./service/recurring";

export const savingsCron: Record<string, CronTask> = {
  // 自動記帳寫紀錄與游標 到期通知認領固定收支與信用卡的寄送日 再清掉舊帳單
  recurring: expiringTask(() => postDueRecurring(), savingsTags.transactions, savingsTags.recurring, savingsTags.accounts, savingsTags.bills),
  // 只寫通知與寄過的記號 畫面讀不到那張表 notify 自己會讓通知的 tag 失效
  dividends: expiringTask(() => sendDividendNotices()),
};
