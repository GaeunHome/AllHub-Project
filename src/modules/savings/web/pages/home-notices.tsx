import { requireModule } from "@/core/auth";
import { NoticeItem } from "@/core/ui/notice-strip";
import { loadChecklist } from "../overview-data";
import { checklistRows, urgentRows } from "../overview-view";
import { SAVINGS_PATHS } from "../paths";

/** 逾期與等著填的帳單 其他的留在這個月要做的事 */
export async function SavingsNotices() {
  const user = await requireModule("savings");
  const rows = checklistRows(await loadChecklist(user.id, new Date()));
  return urgentRows(rows).map((row) => <NoticeItem key={row.key} tone={row.tone} title={row.title} detail={row.detail} href={SAVINGS_PATHS.overview} />);
}
