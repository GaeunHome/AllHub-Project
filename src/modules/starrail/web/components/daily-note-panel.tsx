import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { ExternalImage } from "@/core/ui/external-image";
import { FormMessage } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { expeditionStates, formatRemaining, formatTaipeiTime, type DailyNote, type Expedition, type ExpeditionState } from "../../lib/responses";
import { alertThreshold, percentOf, staminaFullText, staminaGauge } from "../../lib/stamina";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedDailyNote } from "../../service/cached";
import { syncCookieFlagAfter } from "../cookie-flag";
import { LoadingTitle } from "./panel-parts";

/** 即時便箋快取最多 5 分鐘 HoYoLAB 失敗時只在這一塊顯示錯誤 */
export async function DailyNotePanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const result = await cachedDailyNote(user.id, account.id);
  syncCookieFlagAfter(user.id, account, result.cookieInvalid);
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

// 五個數字裡最後的委託佔兩欄 手機兩欄與寬螢幕三欄時最後一列都排滿
const METER_GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3";
const NOTE_GRID = "grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]";

export function DailyNoteSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢即時便箋…" className="stack">
      <LoadingTitle title="即時便箋" />
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

type NoteViewProps = { note: DailyNote; expeditions: Expedition[]; fetchedAt: Date; customThreshold: number | null };

function NoteView({ note, expeditions, fetchedAt, customThreshold }: NoteViewProps) {
  const now = new Date();
  const { percent, fullAt } = staminaGauge(note, fetchedAt, now);
  const threshold = alertThreshold(note, customThreshold);

  return (
    <div className="stack">
      <div className={NOTE_GRID}>
        {/* 開拓力最常看 放大成主角 */}
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
            <div className="h-full bg-linear-to-r from-[var(--sr-gauge-from)] to-[var(--sr-gauge-to)]" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">
              <Icon name="clock" className="size-3.5" />
              {staminaFullText(note, fullAt, now)}
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
        <div className="h-full bg-sr-gold" style={{ width: `${percentOf(value, max)}%` }} />
      </div>
    </div>
  );
}

/** 委託中的角色 剩餘時間已經由 expeditionStates 扣掉查詢後過去的時間 */
function ExpeditionList({ expeditions }: { expeditions: ExpeditionState[] }) {
  return (
    <ul aria-label="委託" className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      {expeditions.map((expedition, i) => {
        const done = expedition.done;
        const remaining = done ? "已完成" : formatRemaining(expedition.remainingSeconds);
        return (
          <li key={i} className="sr-panel flex items-center gap-3 p-4 [--sr-cut:10px]">
            <div className="flex shrink-0 -space-x-3">
              {expedition.avatars.length > 0 ? (
                expedition.avatars.map((avatar, j) => (
                  <span key={j} className="relative size-12 overflow-hidden rounded-full bg-[var(--sr-avatar-bg)] ring-2 ring-[var(--sr-avatar-ring)]">
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
                <span className="grid size-12 place-items-center rounded-full bg-[var(--sr-avatar-bg)] text-ink-soft">
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
