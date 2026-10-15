import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { HomeCard } from "@/core/ui/home-card";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedAccounts, cachedDailyNote } from "../../service/cached";
import { AccountNoteRow, AccountNoteSkeleton, NoLinkedAccount, NotesSkeleton } from "../components/home-note";
import { syncCookieFlagAfter } from "../cookie-flag";

// web 層不能 import 模組根目錄 名稱 圖示 點綴色由 src/app 從 info.ts 傳進來
export function StarrailHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="即時便箋" skeleton={<NotesSkeleton />}>
      <StarrailNotes />
    </HomeCard>
  );
}

/** 自己的帳號一個一列 每列各自用 Suspense 向 HoYoLAB 查 慢的不會擋住其他帳號 */
export async function StarrailNotes() {
  const user = await requireSession();
  const accounts = await cachedAccounts(user.id);
  if (accounts.length === 0) return <NoLinkedAccount />;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {accounts.map((account) => (
        <li key={account.id} className="py-4 first:pt-0 last:pb-0">
          <Suspense fallback={<AccountNoteSkeleton account={account} />}>
            <AccountNote account={account} />
          </Suspense>
        </li>
      ))}
    </ul>
  );
}

/** 跟星穹鐵道頁讀同一份快取 5 分鐘的即時便箋 */
export async function AccountNote({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const result = await cachedDailyNote(user.id, account.id);
  syncCookieFlagAfter(user.id, account, result.cookieInvalid);
  return <AccountNoteRow account={account} result={result} now={new Date()} />;
}
