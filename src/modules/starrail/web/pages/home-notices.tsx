import { requireModule } from "@/core/auth";
import { NoticeItem } from "@/core/ui/notice-strip";
import { accountHref } from "../../lib/urls";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedAccounts, cachedDailyNote } from "../../service/cached";
import { accountNotice } from "../notes-view";

/** 跟即時便箋讀同一份快取 不會多問 HoYoLAB */
export async function StarrailNotices() {
  const user = await requireModule("starrail");
  const accounts = await cachedAccounts(user.id);
  const notices = await Promise.all(accounts.map((account) => noticeOf(user.id, account)));
  return notices;
}

async function noticeOf(userId: string, account: StarrailAccountView) {
  const notice = accountNotice(account, await cachedDailyNote(userId, account.id));
  return notice && <NoticeItem key={account.id} tone={notice.tone} title={notice.title} detail={notice.detail} href={accountHref(account.id)} />;
}
