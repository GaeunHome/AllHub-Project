import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { serverLabel } from "../../lib/roles";
import { cachedAccounts, cachedRecentCheckins } from "../../service/cached";
import { pickAccount } from "../account-tabs";
import { AccountHeader, AccountSkeleton, AccountTabs, DailyNotePanel, DailyNoteSkeleton } from "../components/account-card";
import { CharacterPanel, CharacterPanelSkeleton } from "../components/character-panel";
import { CheckinLogList } from "../components/checkin-log-list";
import { EndgamePanel, EndgameSkeleton } from "../components/endgame-panel";
import { LedgerPanel, LedgerSkeleton } from "../components/ledger-panel";
import { LinkAccountForm } from "../components/link-account-form";
import { LinkResultBanner, LinkResultProvider } from "../components/link-result";
import { RedeemPanel } from "../components/redeem-panel";
import { StarrailBackdrop } from "../components/starrail-backdrop";
import { StarrailBanner } from "../components/starrail-banner";
import { gameFont } from "../game-font";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 圖示、名稱、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
// theme-starrail 讓這一頁不論全站淺色或深色，都是遊戲裡的深藍星空；手機上滿版，寬螢幕是圓角的面板
export function StarrailPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <div
      data-accent={info.accent}
      className={`theme-starrail ${gameFont.variable} page-stack relative isolate -mx-4 -mt-6 -mb-16 px-4 pt-6 pb-16 sm:m-0 sm:rounded-2xl sm:border sm:border-line sm:p-6 lg:p-8`}
    >
      <StarrailBackdrop />
      <StarrailBanner info={info} />
      {/* 連結帳號的表單在最下面（或是還沒有帳號時的整頁表單），結果顯示在帳號分頁上方：兩邊共用同一份 */}
      <LinkResultProvider>
        <Suspense fallback={<AccountSkeleton />}>
          <AccountArea searchParams={searchParams} />
        </Suspense>
      </LinkResultProvider>
    </div>
  );
}

/** 一次只看一個帳號：網址參數 ?account=<id> 選帳號，下面每一塊都只顯示這個帳號；只從自己的帳號裡選，別人的 id 當作不存在 */
export async function AccountArea({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const accounts = await cachedAccounts(user.id);
  const account = pickAccount(accounts, (await searchParams).account);
  if (!account) {
    return (
      <div className="stack">
        <LinkAccountForm defaultOpen />
        <p className="sr-panel flex items-center gap-3 p-5 text-ink-soft sm:p-6">
          <Icon name="sparkles" className="size-5 text-sr-gold" />
          還沒有連結任何帳號：貼上 cookie 就能看到開拓力、角色與戰績
        </p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="stack">
        <LinkResultBanner accountId={account.id} />
        <AccountTabs accounts={accounts} selectedId={account.id} />
        <AccountHeader account={account} />
      </div>
      {/* 每一塊各自向 HoYoLAB 查、各自串流，不互相等待；key 讓切換帳號時重新顯示骨架 */}
      <Suspense key={`note-${account.id}`} fallback={<DailyNoteSkeleton />}>
        <DailyNotePanel account={account} />
      </Suspense>
      <Suspense key={`characters-${account.id}`} fallback={<CharacterPanelSkeleton />}>
        <CharacterPanel account={account} />
      </Suspense>
      {/* 全寬的超寬螢幕上開拓月曆與終局戰績並排，不會被拉成一長條 */}
      <div className="grid items-start gap-8 2xl:grid-cols-2">
        <Suspense key={`ledger-${account.id}`} fallback={<LedgerSkeleton />}>
          <LedgerPanel account={account} />
        </Suspense>
        <Suspense key={`endgame-${account.id}`} fallback={<EndgameSkeleton />}>
          <EndgamePanel account={account} />
        </Suspense>
      </div>
      {/* 兌換碼的輸入框不拉到整個畫面寬：超寬螢幕跟簽到紀錄並排；同一列的卡片等高，兩邊的卡片（各自區塊裡的 sr-panel）撐滿整格 */}
      {/* 簽到紀錄收起時仍比兌換碼高：兌換碼的內容由它自己的格線放在卡片中間，不在下面留一大片空白；展開更早的紀錄後第一列改成照內容高，回到上方 */}
      <div className="grid gap-8 2xl:grid-cols-2 [&>section>.sr-panel]:flex-1 2xl:has-[details[open]]:[&>section>form.sr-panel]:grid-rows-[auto_auto_1fr]">
        <RedeemPanel key={`redeem-${account.id}`} accountId={account.id} label={`${serverLabel(account.region)} · ${account.nickname ?? "開拓者"}（UID ${account.uid}）`} />
        <Suspense key={`checkins-${account.id}`} fallback={null}>
          <CheckinLogs accountId={account.id} />
        </Suspense>
      </div>
      <LinkAccountForm defaultOpen={false} />
    </div>
  );
}

async function CheckinLogs({ accountId }: { accountId: number }) {
  const user = await requireSession();
  const logs = await cachedRecentCheckins(user.id, accountId);
  if (logs.length === 0) return null;
  return <CheckinLogList logs={logs} />;
}
