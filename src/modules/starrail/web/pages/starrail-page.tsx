import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { PageTheme } from "@/core/ui/page-theme";
import { serverLabel } from "../../lib/roles";
import { cachedAccounts, cachedRecentCheckins } from "../../service/cached";
import { pickAccount } from "../account-tabs";
import { AccountHeader, AccountSkeleton, AccountTabs } from "../components/account-card";
import { CalendarPanel, CalendarSkeleton } from "../components/calendar-panel";
import { CharacterPanel, CharacterPanelSkeleton } from "../components/character-panel";
import { CheckinLogList } from "../components/checkin-log-list";
import { DailyNotePanel, DailyNoteSkeleton } from "../components/daily-note-panel";
import { EndgamePanel, EndgameSkeleton } from "../components/endgame-panel";
import { LedgerPanel, LedgerSkeleton } from "../components/ledger-panel";
import { LinkAccountForm } from "../components/link-account-form";
import { RedeemPanel } from "../components/redeem-panel";
import { StarrailBanner } from "../components/starrail-banner";
import { WarpCard, WarpCardSkeleton } from "../components/warp-card";

// web 不能 import 模組根目錄 info 由 src/app 傳進來
// theme-starrail 不論外觀都是深藍星空 導覽列不變
export function StarrailPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <PageTheme accent={info.accent} className="theme-starrail page-stack">
      <StarrailBanner info={info} />
      <Suspense fallback={<AccountSkeleton />}>
        <AccountArea searchParams={searchParams} />
      </Suspense>
    </PageTheme>
  );
}

/**
 * 一次只看一個帳號 用網址參數 account 選 下面每一塊都只顯示它
 * 只從自己的帳號裡選 別人的 id 當作不存在
 */
export async function AccountArea({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("starrail");
  const accounts = await cachedAccounts(user.id);
  const account = pickAccount(accounts, (await searchParams).account);
  if (!account) {
    return <LinkAccountForm variant="hero" />;
  }

  return (
    <div className="page-stack">
      <div className="stack">
        <AccountTabs accounts={accounts} selectedId={account.id} />
        <AccountHeader account={account} />
      </div>
      {/* 每塊各自查各自串流不互相等 key 讓切換帳號時重新顯示骨架 */}
      <Suspense key={`note-${account.id}`} fallback={<DailyNoteSkeleton />}>
        <DailyNotePanel account={account} />
      </Suspense>
      <Suspense key={`calendar-${account.id}`} fallback={<CalendarSkeleton />}>
        <CalendarPanel account={account} />
      </Suspense>
      <Suspense key={`characters-${account.id}`} fallback={<CharacterPanelSkeleton />}>
        <CharacterPanel account={account} />
      </Suspense>
      <Suspense key={`ledger-${account.id}`} fallback={<LedgerSkeleton />}>
        <LedgerPanel account={account} />
      </Suspense>
      {/* 使用者選的 終局戰績獨佔一整列 隊伍與角色卡才放得大 */}
      <Suspense key={`endgame-${account.id}`} fallback={<EndgameSkeleton />}>
        <EndgamePanel account={account} />
      </Suspense>
      <Suspense key={`warps-${account.id}`} fallback={<WarpCardSkeleton />}>
        <WarpCard account={account} />
      </Suspense>
      {/* 超寬螢幕時兌換碼跟簽到紀錄並排 同一列的卡片等高撐滿整格 */}
      <div className="grid gap-8 2xl:grid-cols-2 [&>section>.sr-panel]:flex-1">
        <RedeemPanel key={`redeem-${account.id}`} accountId={account.id} server={serverLabel(account.region)} name={`${account.nickname ?? "開拓者"}（UID ${account.uid}）`} />
        <Suspense key={`checkins-${account.id}`} fallback={null}>
          <CheckinLogs accountId={account.id} />
        </Suspense>
      </div>
      <LinkAccountForm variant="button" />
    </div>
  );
}

async function CheckinLogs({ accountId }: { accountId: number }) {
  const user = await requireModule("starrail");
  const logs = await cachedRecentCheckins(user.id, accountId);
  if (logs.length === 0) return null;
  return <CheckinLogList logs={logs} />;
}
