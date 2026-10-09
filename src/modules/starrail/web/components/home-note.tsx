import Link from "next/link";
import type { ReactNode } from "react";
import { externalAssetUrl } from "@/core/external-url";
import { EmptyState } from "@/core/ui/empty-state";
import { ExternalImage } from "@/core/ui/external-image";
import { FormMessage } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { expeditionStates, formatTaipeiTime, type ExpeditionState } from "../../lib/responses";
import { serverLabel } from "../../lib/roles";
import { staminaGauge } from "../../lib/stamina";
import type { DailyNoteResult, StarrailAccountView } from "../../service/accounts";
import { accountHref } from "../account-tabs";

// web 層不能讀模組根目錄的 info.ts，模組網址寫在這裡（帳號的網址用 accountHref）
const STARRAIL_PAGE = "/starrail";
// 寬螢幕左邊是開拓力、右邊是後備開拓力與每日實訓，兩欄等寬等高；手機上上下排
const PAIR = "grid gap-4 sm:grid-cols-2";

export function NoLinkedAccount() {
  return (
    <EmptyState
      compact
      icon="train-front"
      title="還沒有連結 HoYoLAB 帳號"
      action={
        <Link href={STARRAIL_PAGE} className="btn-secondary">
          連結帳號
        </Link>
      }
    />
  );
}

/** 帳號的名牌（伺服器、暱稱、等級），點了到星穹鐵道頁的這個帳號；便箋還在查的時候也先顯示 */
function AccountTitle({ account }: { account: StarrailAccountView }) {
  return (
    <Link href={accountHref(account.id)} className="group flex min-w-0 items-center gap-2 pointer-coarse:min-h-11">
      <span className="chip chip-accent shrink-0">{serverLabel(account.region)}</span>
      <span className="truncate font-semibold text-ink group-hover:text-brand-ink">{account.nickname ?? "開拓者"}</span>
      {account.level !== null && <span className="shrink-0 text-sm text-ink-soft tabular-nums">Lv.{account.level}</span>}
      <Icon name="chevron-right" className="size-4 shrink-0 text-ink-soft" />
    </Link>
  );
}

/** 一個帳號的即時便箋：開拓力（目前／上限、回滿時間）、後備開拓力、每日實訓、委託；查詢失敗時只在這一列說明 */
export function AccountNoteRow({ account, result, now }: { account: StarrailAccountView; result: DailyNoteResult; now: Date }) {
  if (!result.ok) {
    return (
      <div className="stack">
        <AccountTitle account={account} />
        {result.cookieInvalid ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip chip-danger">
              <Icon name="circle-alert" className="size-3.5" />
              cookie 已失效
            </span>
            <Link href={accountHref(account.id)} className="link">
              到星穹鐵道頁重新連結
            </Link>
          </div>
        ) : (
          <FormMessage tone="error">{result.message}</FormMessage>
        )}
      </div>
    );
  }

  const { note, fetchedAt } = result;
  const gauge = staminaGauge(note, fetchedAt, now);
  const expeditions = expeditionStates(result.expeditions, fetchedAt, now);

  return (
    <div className="stack">
      <AccountTitle account={account} />
      <div className={PAIR}>
        {/* 開拓力最常看，放大成主角；右邊兩個數字跟它一樣高 */}
        <div className="panel flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink">
              <Icon name="battery-charging" className="size-4 text-accent" />
              開拓力
            </span>
            <span className="text-ink-soft tabular-nums">
              <span className="text-2xl font-bold text-ink">{note.stamina ?? "—"}</span> / {note.maxStamina ?? "—"}
            </span>
          </div>
          <div aria-hidden className="progress-track">
            <div className="progress-fill" style={{ width: `${gauge.percent}%` }} />
          </div>
          <p className="flex items-center gap-2 text-ink">
            <Icon name="clock" className="size-4 text-accent" />
            {gauge.fullAt ? `${formatTaipeiTime(gauge.fullAt, now)} 回滿` : note.stamina !== null ? "已回滿" : "回滿時間不明"}
          </p>
        </div>
        <dl className="flex flex-col gap-4">
          <NoteFigure icon="zap" label="後備開拓力">
            {note.reserveStamina ?? "—"}
          </NoteFigure>
          <NoteFigure icon="calendar-check" label="每日實訓">
            {note.trainScore ?? "—"} / {note.maxTrainScore ?? "—"}
          </NoteFigure>
        </dl>
      </div>
      <dl className="panel flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-ink">
            <Icon name="users" className="size-4 text-accent" />
            委託
          </dt>
          <dd className="font-semibold text-ink tabular-nums">
            {note.expeditionsAccepted ?? "—"} / {note.expeditionsTotal ?? "—"}
          </dd>
        </div>
        {expeditions.length > 0 && <ExpeditionAvatars expeditions={expeditions} />}
      </dl>
    </div>
  );
}

function NoteFigure({ icon, label, children }: { icon: UiIconName; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-xl bg-surface-muted px-4">
      <dt className="flex items-center gap-2 text-ink">
        <Icon name={icon} className="size-4 text-accent" />
        {label}
      </dt>
      <dd className="font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/** 派遣中的角色頭像，一個委託一組；完成的加上勾勾 */
function ExpeditionAvatars({ expeditions }: { expeditions: ExpeditionState[] }) {
  const done = expeditions.filter((e) => e.done).length;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="sr-only">委託中的角色</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">
        {expeditions.map((expedition, i) => (
          <span key={i} title={expedition.name ?? undefined} className="relative flex -space-x-2">
            {expedition.avatars.map((src, j) => (
              <span key={j} className="relative size-9 overflow-hidden rounded-full bg-accent-soft ring-2 ring-[var(--surface-solid)]">
                <ExternalImage
                  src={externalAssetUrl(src)}
                  alt=""
                  fill
                  className="object-cover"
                  fallback={
                    <span className="absolute inset-0 grid place-items-center text-accent-ink">
                      <Icon name="users" className="size-3.5" />
                    </span>
                  }
                />
              </span>
            ))}
            {expedition.done && (
              <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-[var(--success-dot)] text-white ring-2 ring-[var(--surface-solid)]">
                <Icon name="check" className="size-2.5" />
              </span>
            )}
          </span>
        ))}
      </dd>
      <dd className="shrink-0 text-ink tabular-nums">{done} 個已完成</dd>
    </div>
  );
}

/** 便箋還在向 HoYoLAB 查詢：先顯示是哪個帳號 */
export function AccountNoteSkeleton({ account }: { account: StarrailAccountView }) {
  return (
    <LoadingState label="向 HoYoLAB 查詢即時便箋…" className="stack">
      <AccountTitle account={account} />
      <NoteBodySkeleton />
    </LoadingState>
  );
}

/** 帳號清單還沒讀出來 */
export function NotesSkeleton() {
  return (
    <LoadingState label="載入星穹鐵道帳號…" className="stack">
      <Skeleton className="h-7 w-48" />
      <NoteBodySkeleton />
    </LoadingState>
  );
}

function NoteBodySkeleton() {
  return (
    <>
      <div className={PAIR}>
        <Skeleton className="h-28 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="flex-1 rounded-xl" />
          <Skeleton className="flex-1 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-11 rounded-xl" />
    </>
  );
}
