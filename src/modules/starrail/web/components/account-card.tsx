import Link from "next/link";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { checkinAction, removeAccountAction, setAutoRedeemAction, setGameRemindersAction, setThresholdAction } from "../actions";
import { serverLabel } from "../../lib/roles";
import { accountHref } from "../../lib/urls";
import type { StarrailAccountView } from "../../service/accounts";
import { AccountActionForm } from "./account-action-form";
import { AccountAvatar } from "./account-avatar";
import { DailyNoteSkeleton } from "./daily-note-panel";
import { GoldChip } from "./sr-visuals";

/** 連結兩個以上的帳號時用伺服器切換 只有一個時不顯示 */
export function AccountTabs({ accounts, selectedId }: { accounts: StarrailAccountView[]; selectedId: number }) {
  if (accounts.length < 2) return null;
  return (
    <nav aria-label="切換帳號" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
      {accounts.map((account) => (
        <Link key={account.id} href={accountHref(account.id)} scroll={false} aria-current={account.id === selectedId ? "page" : undefined} className="sr-account-tab">
          <span className="font-semibold">{serverLabel(account.region)}</span>
          <span aria-hidden>·</span>
          {account.nickname ?? account.uid}
          {account.level !== null && <span className="sr-num text-base font-bold text-sr-gold">Lv.{account.level}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** 頭像還在讀或讀不到時的列車圖示 跟 md 頭像一樣大 */
const TRAIN_BADGE = (
  <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-sr-gold">
    <Icon name="train-front" className="size-6" />
  </span>
);

/** 帳號的名牌 常用的立即簽到放外面 門檻與移除收在帳號設定 */
export function AccountHeader({ account }: { account: StarrailAccountView }) {
  return (
    <header className="sr-panel stack p-5 sm:p-6">
      {/* 名牌文字至少佔 14rem 手機上立即簽到換到下一行 標籤才不會被擠成直的 */}
      <div className="flex flex-wrap items-center gap-4">
        <AccountAvatar account={account} size="md" placeholder={TRAIN_BADGE} className="ring-1 ring-[var(--sr-gold-line)]" />
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
          <h2 className="truncate text-xl font-bold tracking-wide text-ink">{account.nickname ?? "（未知暱稱）"}</h2>
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
        </div>
        <AccountActionForm action={checkinAction} accountId={account.id} label="立即簽到" pendingLabel="簽到中…" icon="calendar-check" />
      </div>
      <details className="disclosure text-sm">
        <summary>
          <Icon name="settings" className="size-4" />
          帳號設定
        </summary>
        {/* 移除放在最後 手機上排成一欄時不夾在兩個設定中間 */}
        <div className="stack">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AutoRedeemSetting account={account} />
            <GameRemindersSetting account={account} />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <AccountActionForm action={setThresholdAction} accountId={account.id} label="設定開拓力提醒門檻" pendingLabel="儲存中…" icon="bell">
              <input
                type="number"
                name="threshold"
                min={0}
                max={1000}
                aria-label="開拓力提醒門檻"
                defaultValue={account.staminaAlertThreshold ?? ""}
                placeholder="預設：上限 − 20"
                className="input w-44"
              />
            </AccountActionForm>
            <div className="sm:ml-auto">
              <ActionButton
                action={removeAccountAction}
                fields={{ accountId: account.id }}
                confirmMessage={`確定移除「${account.nickname ?? account.uid}」？之後要重新貼 cookie 才能再連結。`}
                pendingLabel={
                  <>
                    <Icon name="trash-2" className="size-4" />
                    移除中…
                  </>
                }
                className="btn-danger"
              >
                <Icon name="trash-2" className="size-4" />
                移除這個帳號
              </ActionButton>
            </div>
          </div>
        </div>
      </details>
    </header>
  );
}

/**
 * 每天把社群整理的新兌換碼送到這個帳號 cookie 少了兌換要用的鍵時不能打開
 * 已經打開的照樣可以關掉
 */
export function AutoRedeemSetting({ account }: { account: StarrailAccountView }) {
  const hintId = `auto-redeem-hint-${account.id}`;
  const locked = !account.canAutoRedeem && !account.autoRedeem;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <ActionButton
        action={setAutoRedeemAction}
        fields={{ accountId: account.id, enabled: String(!account.autoRedeem) }}
        role="switch"
        aria-checked={account.autoRedeem}
        aria-describedby={hintId}
        disabled={locked}
        formClassName="flex flex-col items-start gap-1"
        className="btn-secondary"
      >
        <span aria-hidden className="switch-visual" />
        自動兌換新的兌換碼
      </ActionButton>
      <p id={hintId} className="text-ink-soft">
        {account.canAutoRedeem
          ? "每天中午把社群整理的新兌換碼用這個帳號兌換，兌換成功會通知你。"
          : "需要 cookie 裡的 cookie_token_v2：用「新增帳號或更新 cookie」重新貼上完整的 cookie。"}
      </p>
    </div>
  );
}

/** 開拓力提醒另外看門檻 這裡只管每日實訓 每週內容與終局挑戰 */
export function GameRemindersSetting({ account }: { account: StarrailAccountView }) {
  const hintId = `game-reminders-hint-${account.id}`;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <ActionButton
        action={setGameRemindersAction}
        fields={{ accountId: account.id, enabled: String(!account.gameReminders) }}
        role="switch"
        aria-checked={account.gameReminders}
        aria-describedby={hintId}
        formClassName="flex flex-col items-start gap-1"
        className="btn-secondary"
      >
        <span aria-hidden className="switch-visual" />
        每日、每週與終局提醒
      </ActionButton>
      <p id={hintId} className="text-ink-soft">
        每日實訓、每週內容快重置還沒做完，或終局挑戰快結束還沒拿滿時通知你；開拓力提醒看門檻。
      </p>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <LoadingState label="載入帳號中…" className="page-stack">
      <div className="sr-panel flex items-center gap-4 p-5 sm:p-6">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
      </div>
      <DailyNoteSkeleton />
    </LoadingState>
  );
}
