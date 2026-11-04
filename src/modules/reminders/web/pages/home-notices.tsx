import { requireModule } from "@/core/auth";
import { NoticeItem } from "@/core/ui/notice-strip";
import { cachedReminders } from "../../service/cached";
import { remindersView } from "../reminders-view";

/** 今天與明天的事 更遠的看提醒卡片的倒數就好 */
export async function RemindersNotices() {
  const user = await requireModule("reminders");
  const { shown } = remindersView(await cachedReminders(user.id), new Date());
  return shown.filter((row) => row.days <= 1).map((row) => <NoticeItem key={row.id} tone={row.days === 0 ? "warning" : "info"} title={row.title} detail={row.countdown} />);
}
