import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { formatTaipeiDateTime } from "@/core/time";
import { Icon } from "@/core/ui/icon";
import { serverLabel } from "../../lib/roles";
import { cachedAccounts, cachedRecentCheckins } from "../../service/cached";
import { pickAccount } from "../account-tabs";
import { AccountHeader, AccountSkeleton, AccountTabs, DailyNotePanel, DailyNoteSkeleton } from "../components/account-card";
import { CharacterPanel, CharacterPanelSkeleton } from "../components/character-panel";
import { EndgamePanel, EndgameSkeleton } from "../components/endgame-panel";
import { LedgerPanel, LedgerSkeleton } from "../components/ledger-panel";
import { LinkAccountForm } from "../components/link-account-form";
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
      <Suspense fallback={<AccountSkeleton />}>
        <AccountArea searchParams={searchParams} />
      </Suspense>
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
      <Suspense key={`ledger-${account.id}`} fallback={<LedgerSkeleton />}>
        <LedgerPanel account={account} />
      </Suspense>
      <Suspense key={`endgame-${account.id}`} fallback={<EndgameSkeleton />}>
        <EndgamePanel account={account} />
      </Suspense>
      <RedeemPanel key={`redeem-${account.id}`} accountId={account.id} label={`${serverLabel(account.region)} · ${account.nickname ?? "開拓者"}（UID ${account.uid}）`} />
      <Suspense key={`checkins-${account.id}`} fallback={null}>
        <CheckinLogs accountId={account.id} />
      </Suspense>
      <LinkAccountForm defaultOpen={false} />
    </div>
  );
}

const RESULT_LABEL = { success: "簽到成功", already: "已簽過", failed: "簽到失敗" } as Record<string, string>;
const RESULT_CHIP = { success: "chip chip-success", already: "chip", failed: "chip chip-danger" } as Record<string, string>;

async function CheckinLogs({ accountId }: { accountId: number }) {
  const user = await requireSession();
  const logs = await cachedRecentCheckins(user.id, accountId);
  if (logs.length === 0) return null;

  return (
    <section className="stack">
      <h3 className="sr-title">簽到紀錄</h3>
      <ul className="sr-panel divide-y divide-line">
        {logs.map(({ log }) => (
          <li key={log.id} className="card-row flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`${RESULT_CHIP[log.result] ?? "chip"} shrink-0`}>{RESULT_LABEL[log.result] ?? log.result}</span>
            {log.totalSignDay !== null && (
              <span className="chip">
                累計 <span className="sr-num text-[0.8125rem] font-bold">{log.totalSignDay}</span> 天
              </span>
            )}
            {log.message && log.result === "failed" && <span className="min-w-0 text-sm text-danger">{log.message}</span>}
            <time dateTime={log.createdAt.toISOString()} className="sr-num ml-auto text-[0.9375rem] whitespace-nowrap text-ink-soft">
              {formatTaipeiDateTime(log.createdAt)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
