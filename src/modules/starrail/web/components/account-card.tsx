import Link from "next/link";
import { after } from "next/server";
import { requireSession } from "@/core/auth";
import { logError } from "@/core/errors";
import { externalAssetUrl } from "@/core/external-url";
import { ActionButton } from "@/core/ui/action-button";
import { ExternalImage } from "@/core/ui/external-image";
import { FormMessage } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { checkinAction, removeAccountAction, setThresholdAction } from "../actions";
import { expeditionStates, formatRemaining, formatTaipeiTime, type DailyNote, type Expedition, type ExpeditionState } from "../../lib/responses";
import { serverLabel } from "../../lib/roles";
import { alertThreshold, staminaGauge } from "../../lib/stamina";
import { syncCookieInvalid, type StarrailAccountView } from "../../service/accounts";
import { cachedDailyNote } from "../../service/cached";
import { accountHref } from "../account-tabs";
import { AccountActionForm } from "./account-action-form";

/** 連結了兩個以上的帳號時，用伺服器切換；只有一個帳號時不顯示 */
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

/** 帳號的名牌：伺服器、UID、開拓等級；常用的「立即簽到」放外面，門檻與移除收在「帳號設定」 */
export function AccountHeader({ account }: { account: StarrailAccountView }) {
  return (
    <header className="sr-panel stack p-5 sm:p-6">
      {/* 名牌的文字至少佔 14rem：手機上「立即簽到」換到下一行，標籤不會被擠成一個一行 */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-sr-gold">
          <Icon name="train-front" className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
          <h2 className="truncate text-xl font-bold tracking-wide text-ink">{account.nickname ?? "（未知暱稱）"}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip border-[var(--sr-gold-line)] bg-[var(--sr-gold-soft)] text-[#f4d79b]">{serverLabel(account.region)}</span>
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
      </details>
    </header>
  );
}

/** 即時便箋（快取最多 5 分鐘）；HoYoLAB 失敗時只在這一塊顯示錯誤 */
export async function DailyNotePanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const result = await cachedDailyNote(user.id, account.id);
  // 快取函式裡不能寫入：便箋顯示的 cookie 狀態跟帳號上的標記不同時，回應送出後再寫回
  if (result.cookieInvalid !== account.cookieInvalid) {
    after(() => syncCookieInvalid(user.id, account.id, result.cookieInvalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)));
  }
  return (
    <section className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h3 className="sr-title">即時便箋</h3>
        {result.ok && (
          <span className="chip">
            <Icon name="clock" className="size-3.5" />
            {formatTaipeiTime(result.fetchedAt, new Date())} 更新
          </span>
        )}
      </div>
      {result.ok ? (
        <NoteView note={result.note} expeditions={result.expeditions} fetchedAt={result.fetchedAt} customThreshold={account.staminaAlertThreshold} />
      ) : (
        <FormMessage tone="error">{result.message}</FormMessage>
      )}
    </section>
  );
}

// 五個數字：手機兩欄、寬螢幕三欄；最後一個（委託）佔兩欄，兩種寬度的最後一列都排滿，不留空格
const METER_GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3";
const NOTE_GRID = "grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]";

// HoYoLAB 回應要等幾秒，除了骨架也把正在做什麼寫出來
export function DailyNoteSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢即時便箋…" className="stack">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h3 className="sr-title">即時便箋</h3>
        <span aria-hidden className="text-sm text-ink-soft">
          向 HoYoLAB 查詢中…
        </span>
      </div>
      <div className={NOTE_GRID}>
        <Skeleton className="h-44 rounded-none" />
        <div className={METER_GRID}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className={`h-[5.5rem] rounded-none ${i === 4 ? "col-span-2" : ""}`} />
          ))}
        </div>
      </div>
    </LoadingState>
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

type NoteViewProps = { note: DailyNote; expeditions: Expedition[]; fetchedAt: Date; customThreshold: number | null };

function NoteView({ note, expeditions, fetchedAt, customThreshold }: NoteViewProps) {
  const now = new Date();
  const { percent, fullAt } = staminaGauge(note, fetchedAt, now);
  const threshold = alertThreshold(note, customThreshold);

  return (
    <div className="stack">
      <div className={NOTE_GRID}>
        {/* 開拓力最常看，放大成主角 */}
        <div className="sr-panel flex flex-col justify-between gap-4 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-semibold text-ink-soft">
            <Icon name="battery-charging" className="size-5 text-sr-gold" />
            開拓力
          </p>
          <p className="sr-num leading-none text-ink">
            <span className="text-6xl font-bold">{note.stamina ?? "—"}</span>
            <span className="text-2xl font-semibold text-ink-soft"> / {note.maxStamina ?? "—"}</span>
          </p>
          <div aria-hidden className="h-2 w-full bg-white/10">
            <div className="h-full bg-linear-to-r from-[#b8893e] to-[#f1d28e]" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">
              <Icon name="clock" className="size-3.5" />
              {fullAt ? `${formatTaipeiTime(fullAt, now)} 回滿` : note.stamina !== null ? "已回滿" : "回滿時間不明"}
            </span>
            {threshold !== null && (
              <span className="chip">
                <Icon name="bell" className="size-3.5" />
                提醒門檻 <span className="sr-num text-[0.8125rem] font-bold">{threshold}</span>
              </span>
            )}
          </div>
        </div>
        <div className={METER_GRID}>
          <Meter label="後備開拓力" icon="zap" value={note.reserveStamina} max={2400} />
          <Meter label="每日實訓" icon="calendar-check" value={note.trainScore} max={note.maxTrainScore} />
          <Meter label="模擬宇宙積分" icon="sparkles" value={note.rogueScore} max={note.maxRogueScore} />
          <Meter label="歷戰餘響" icon="gamepad-2" value={note.cocoonRemaining} max={note.cocoonLimit} />
          <Meter label="委託" icon="clock" value={note.expeditionsAccepted} max={note.expeditionsTotal} className="col-span-2" />
        </div>
      </div>
      {expeditions.length > 0 && <ExpeditionList expeditions={expeditionStates(expeditions, fetchedAt, now)} />}
    </div>
  );
}

function Meter({ label, icon, value, max, className = "" }: { label: string; icon: UiIconName; value: number | null; max: number | null; className?: string }) {
  const percent = value !== null && max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`sr-panel flex flex-col gap-2 p-4 [--sr-cut:10px] ${className}`}>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink-soft">
        <Icon name={icon} className="size-4 shrink-0 text-sr-gold" />
        <span className="truncate">{label}</span>
      </span>
      <span className="sr-num text-2xl leading-none font-bold text-ink">
        {value ?? "—"}
        <span className="text-base font-semibold text-ink-soft"> / {max ?? "—"}</span>
      </span>
      <div aria-hidden className="h-1 w-full bg-white/10">
        <div className="h-full bg-[#e6c27a]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** 委託（派遣）中的角色；剩餘時間已經扣掉查詢後過去的時間（expeditionStates） */
function ExpeditionList({ expeditions }: { expeditions: ExpeditionState[] }) {
  return (
    <ul aria-label="委託" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {expeditions.map((expedition, i) => {
        const done = expedition.done;
        const remaining = done ? "已完成" : formatRemaining(expedition.remainingSeconds);
        return (
          <li key={i} className="sr-panel flex items-center gap-3 p-4 [--sr-cut:10px]">
            <div className="flex shrink-0 -space-x-3">
              {expedition.avatars.length > 0 ? (
                expedition.avatars.map((avatar, j) => (
                  <span key={j} className="relative size-12 overflow-hidden rounded-full bg-[#1f2547] ring-2 ring-[#0b1030]">
                    <ExternalImage
                      src={externalAssetUrl(avatar)}
                      alt=""
                      fill
                      className="object-cover"
                      fallback={
                        <span className="absolute inset-0 grid place-items-center text-ink-soft">
                          <Icon name="users" className="size-4" />
                        </span>
                      }
                    />
                  </span>
                ))
              ) : (
                <span className="grid size-12 place-items-center rounded-full bg-[#1f2547] text-ink-soft">
                  <Icon name="clock" className="size-4" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{expedition.name ?? "委託"}</p>
              {remaining && (
                <p className={done ? "flex items-center gap-1 text-sm font-semibold text-success" : "text-sm text-ink-soft"}>
                  {done ? <Icon name="circle-check" className="size-3.5" /> : null}
                  {remaining}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
