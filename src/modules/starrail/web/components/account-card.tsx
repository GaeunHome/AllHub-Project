import { after } from "next/server";
import { logError } from "@/core/errors";
import { ActionButton } from "@/core/ui/action-button";
import { FormMessage } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { checkinAction, removeAccountAction, setThresholdAction } from "../actions";
import { formatTaipeiTime, staminaFullAt, type DailyNote } from "../../lib/responses";
import { syncCookieInvalid, type StarrailAccountView } from "../../service/accounts";
import { cachedDailyNote } from "../../service/cached";
import { alertThreshold } from "../../lib/stamina";
import { AccountActionForm } from "./account-action-form";

const METER_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

export function AccountCard({ account, children }: { account: StarrailAccountView; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <span className="icon-tile size-12 rounded-full">
          <Icon name="star" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-ink">{account.nickname ?? "（未知暱稱）"}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="chip">UID {account.uid}</span>
            {account.level !== null && <span className="chip chip-accent">開拓等級 {account.level}</span>}
          </div>
        </div>
        {account.cookieInvalid && (
          <span className="chip chip-danger whitespace-normal">
            <Icon name="circle-alert" className="size-3.5" />
            cookie 已失效，請在上方重新連結
          </span>
        )}
      </header>
      {children}
      <div className="flex flex-wrap items-start gap-3 border-t border-line pt-4">
        <AccountActionForm action={checkinAction} accountId={account.id} label="立即簽到" pendingLabel="簽到中…" icon="calendar-check" />
        <AccountActionForm action={setThresholdAction} accountId={account.id} label="設定提醒門檻" pendingLabel="儲存中…" icon="bell">
          <input
            type="number"
            name="threshold"
            min={0}
            max={1000}
            defaultValue={account.staminaAlertThreshold ?? ""}
            placeholder="預設：上限 − 20"
            className="input min-h-9 w-40 py-1.5 text-sm"
          />
        </AccountActionForm>
        <div className="sm:ml-auto">
          <ActionButton
            action={removeAccountAction}
            fields={{ accountId: account.id }}
            confirmMessage={`確定移除「${account.nickname ?? account.uid}」？之後要重新貼 cookie 才能再連結。`}
            pendingLabel={
              <>
                <Icon name="trash-2" className="size-3.5" />
                移除中…
              </>
            }
            className="btn-danger btn-sm"
          >
            <Icon name="trash-2" className="size-3.5" />
            移除這個角色
          </ActionButton>
        </div>
      </div>
    </section>
  );
}

/** 即時便箋（快取最多 5 分鐘）；HoYoLAB 失敗時只在這張卡顯示錯誤 */
export async function DailyNotePanel({ account }: { account: StarrailAccountView }) {
  const result = await cachedDailyNote(account.id);
  // 快取函式裡不能寫入：便箋顯示的 cookie 狀態跟帳號上的標記不同時，回應送出後再寫回
  if (result.cookieInvalid !== account.cookieInvalid) {
    after(() =>
      syncCookieInvalid(account.id, result.cookieInvalid).catch((error: unknown) => logError("starrail", "同步 cookie 狀態失敗", error)),
    );
  }
  if (!result.ok) return <FormMessage tone="error">{result.message}</FormMessage>;
  return <NoteView note={result.note} fetchedAt={result.fetchedAt} customThreshold={account.staminaAlertThreshold} />;
}

// HoYoLAB 回應要等幾秒，除了骨架也把正在做什麼寫出來
export function DailyNoteSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢即時便箋…" className="flex flex-col gap-3">
      <p aria-hidden className="text-xs text-muted">
        向 HoYoLAB 查詢即時便箋…
      </p>
      <div className={METER_GRID}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-2xl bg-surface-muted p-4">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-3 h-2.5 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

export function AccountCardSkeleton() {
  return (
    <LoadingState label="載入帳號中…" className="card flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className={METER_GRID}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-72 max-w-full rounded-full" />
      </div>
    </LoadingState>
  );
}

function NoteView({ note, fetchedAt, customThreshold }: { note: DailyNote; fetchedAt: Date; customThreshold: number | null }) {
  const now = new Date();
  // 便箋可能是幾分鐘前查的，回滿時間從查詢當下起算；已經過了就是回滿了
  const recoveredAt = staminaFullAt(note, fetchedAt);
  const fullAt = recoveredAt && recoveredAt > now ? recoveredAt : null;
  const threshold = alertThreshold(note, customThreshold);

  return (
    <div className="flex flex-col gap-2">
      <div className={METER_GRID}>
        <Meter
          label="開拓力"
          icon="battery-charging"
          value={note.stamina}
          max={note.maxStamina}
          hint={
            [fullAt ? `${formatTaipeiTime(fullAt, now)} 回滿` : note.stamina !== null ? "已回滿" : null, threshold !== null ? `提醒門檻 ${threshold}` : null]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
        <Meter label="後備開拓力" icon="zap" value={note.reserveStamina} max={2400} />
        <Meter label="每日實訓" icon="calendar-check" value={note.trainScore} max={note.maxTrainScore} />
        <Meter label="模擬宇宙（本週積分）" icon="sparkles" value={note.rogueScore} max={note.maxRogueScore} />
        <Meter label="歷戰餘響（本週剩餘次數）" icon="gamepad-2" value={note.cocoonRemaining} max={note.cocoonLimit} />
        <Meter label="委託" icon="clock" value={note.expeditionsAccepted} max={note.expeditionsTotal} />
      </div>
      <p className="text-xs text-muted">資料時間：{formatTaipeiTime(fetchedAt, now)}（最多 5 分鐘前）</p>
    </div>
  );
}

function Meter({ label, icon, value, max, hint }: { label: string; icon: UiIconName; value: number | null; max: number | null; hint?: string }) {
  const percent = value !== null && max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="rounded-2xl bg-surface-muted p-4">
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink-soft">
          <Icon name={icon} className="size-4 text-accent" />
          {label}
        </span>
        <span className="shrink-0 font-mono text-ink tabular-nums">
          {value ?? "—"} / {max ?? "—"}
        </span>
      </div>
      <div aria-hidden className="progress-track mt-3">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}
