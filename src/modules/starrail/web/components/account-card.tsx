import Link from "next/link";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { checkinAction } from "../actions";
import { serverLabel } from "../../lib/roles";
import { accountHref } from "../../lib/urls";
import type { StarrailAccountView } from "../../service/accounts";
import { AccountActionForm } from "./account-action-form";
import { AccountAvatar } from "./account-avatar";
import { AccountSettings } from "./account-settings";
import { DailyNoteSkeleton } from "./daily-note-panel";
import { GoldChip } from "./sr-visuals";

/** 連結兩個以上的帳號時用伺服器切換 只有一個時不顯示 */
export function AccountTabs({ accounts, selectedId, hrefOf = accountHref }: { accounts: StarrailAccountView[]; selectedId: number; hrefOf?: (accountId: number) => string }) {
  if (accounts.length < 2) return null;
  return (
    <nav {...DRAG_SCROLL} aria-label="切換帳號" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
      {accounts.map((account) => (
        <Link key={account.id} href={hrefOf(account.id)} scroll={false} aria-current={account.id === selectedId ? "page" : undefined} className="sr-account-tab">
          <span className="font-semibold">{serverLabel(account.region)}</span>
          <span>{account.nickname ?? account.uid}</span>
          {account.level !== null && <span className="sr-num text-base font-bold text-sr-gold">Lv.{account.level}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** 頭像還在讀或讀不到時的列車圖示 跟 xl 頭像一樣大 */
const TRAIN_BADGE = (
  <span className="sr-nameplate-avatar grid size-24 shrink-0 place-items-center rounded-full bg-[var(--sr-gold-soft)] text-sr-gold sm:size-28">
    <Icon name="train-front" className="size-10" />
  </span>
);

/**
 * 帳號的名牌 使用者要的頭像放大 常用的立即簽到放在名字下面
 * 使用者選的 電腦上帳號設定直接放在右邊 手機上收在帳號設定裡
 */
export function AccountHeader({ account }: { account: StarrailAccountView }) {
  return (
    <header className="sr-panel flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-8 lg:p-7">
      <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-6 lg:max-w-md">
        <AccountAvatar account={account} size="xl" placeholder={TRAIN_BADGE} className="sr-nameplate-avatar" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
          <h2 className="max-w-full truncate text-2xl font-bold tracking-wide text-ink sm:text-3xl">{account.nickname ?? "（未知暱稱）"}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <GoldChip>{serverLabel(account.region)}</GoldChip>
            <span className="chip">
              UID <span className="sr-num text-[0.8125rem] font-semibold">{account.uid}</span>
            </span>
            {account.level !== null && (
              <span className="chip">
                開拓等級 <span className="sr-num text-[0.8125rem] font-bold">{account.level}</span>
              </span>
            )}
            {account.cookieInvalid && (
              <span className="chip chip-danger whitespace-normal">
                <Icon name="circle-alert" className="size-3.5" />
                cookie 已失效，請重新連結
              </span>
            )}
          </div>
          <AccountActionForm action={checkinAction} accountId={account.id} label="立即簽到" pendingLabel="簽到中…" icon="calendar-check" />
        </div>
      </div>
      <section aria-label="帳號設定" className="sr-nameplate-settings hidden lg:flex">
        <p className="sr-kicker flex items-center gap-1.5">
          <Icon name="settings" className="size-3.5" />
          帳號設定
        </p>
        <AccountSettings account={account} side />
      </section>
      <details className="disclosure text-sm lg:hidden">
        <summary>
          <Icon name="settings" className="size-4" />
          帳號設定
        </summary>
        <AccountSettings account={account} />
      </details>
    </header>
  );
}

export function AccountSkeleton() {
  return (
    <LoadingState label="載入帳號中…" className="page-stack">
      <div className="sr-panel flex items-center gap-4 p-5 sm:p-6">
        <Skeleton className="size-24 shrink-0 rounded-full sm:size-28" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
      </div>
      <DailyNoteSkeleton />
    </LoadingState>
  );
}
