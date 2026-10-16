import type { ReactNode } from "react";
import { requireSession } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { ExternalImage } from "@/core/ui/external-image";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { challengeLabel, ongoingCalendar, type CalendarChallenge, type CalendarEvent, type CalendarWarp, type WarpItem } from "../../lib/calendar";
import { formatRemaining, formatTaipeiTime } from "../../lib/responses";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedActCalendar } from "../../service/cached";

const TITLE_ID = "starrail-calendar-title";
// 手機一欄 寬螢幕兩欄 超寬螢幕三塊並排
const LIST_GRID = "grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3";

/**
 * 活動日曆快取 30 分鐘 結束時間是絕對時間 剩幾天每次算繪時重算
 * 帳號的 cookie 失效標記只由即時便箋決定 這裡不動
 */
export async function CalendarPanel({ account }: { account: StarrailAccountView }) {
  const user = await requireSession();
  const result = await cachedActCalendar(user.id, account.id);
  if (!result.ok) {
    return (
      <section className="stack">
        <h3 className="sr-title min-h-11">活動日曆</h3>
        <FormMessage tone="error">{result.message}</FormMessage>
      </section>
    );
  }
  const now = new Date();
  const { challenges, events, warps } = ongoingCalendar(result.calendar, now);
  const updated = `${formatTaipeiTime(result.fetchedAt, now)} 更新`;

  return (
    <section aria-labelledby={TITLE_ID} className="stack">
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-3">
        <h3 id={TITLE_ID} className="sr-title">
          活動日曆
        </h3>
        <span className="text-sm text-ink-soft">{result.calendar.version ? `目前版本 ${result.calendar.version} · ${updated}` : updated}</span>
      </div>
      <div className={LIST_GRID}>
        <CalendarList title="終局挑戰" empty="目前沒有進行中的終局挑戰">
          {challenges.map((challenge, i) => (
            <ChallengeRow key={challenge.id ?? `c${i}`} challenge={challenge} now={now} />
          ))}
        </CalendarList>
        <CalendarList title="進行中的活動" empty="目前沒有進行中的活動">
          {events.map((event, i) => (
            <EventRow key={event.id ?? `e${i}`} event={event} now={now} />
          ))}
        </CalendarList>
        {/* 兩欄時自己佔一整列 不在右邊留空 */}
        <CalendarList title="角色與光錐躍遷" empty="目前沒有進行中的躍遷" className="lg:col-span-2 2xl:col-span-1">
          {warps.map((warp, i) => (
            <WarpRow key={warp.id ?? `w${i}`} warp={warp} now={now} />
          ))}
        </CalendarList>
      </div>
    </section>
  );
}

function CalendarList({ title, empty, className = "", children }: { title: string; empty: string; className?: string; children: ReactNode[] }) {
  return (
    <div className={`sr-panel ${className}`}>
      <h4 className="card-row font-semibold text-ink">{title}</h4>
      {children.length > 0 ? <ul className="divide-y divide-line border-t border-line">{children}</ul> : <p className="card-row border-t border-line text-ink-soft">{empty}</p>}
    </div>
  );
}

/** 名稱與說明在左 剩幾天在右 說明是結束時間與進度 */
function Row({ leading, title, details, endsAt, now }: { leading?: ReactNode; title: string; details: (string | null)[]; endsAt: number | null; now: Date }) {
  const lines = endsAt === null ? details : [`${formatTaipeiTime(new Date(endsAt), now)} 結束`, ...details];
  const left = endsAt === null ? null : formatRemaining((endsAt - now.getTime()) / 1000);
  return (
    <li className="card-row flex items-center gap-3">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-soft">{lines.filter(Boolean).join(" · ")}</p>
      </div>
      {left && <span className="sr-num shrink-0 text-right text-base font-semibold whitespace-nowrap text-ink">{left}</span>}
    </li>
  );
}

const progress = (current: number | null, total: number | null) => (current !== null && total !== null && total > 0 ? `進度 ${current}/${total}` : null);

function ChallengeRow({ challenge, now }: { challenge: CalendarChallenge; now: Date }) {
  const label = challengeLabel(challenge.kind);
  // 名稱跟模式一樣時只寫一次
  const name = challenge.name && challenge.name !== label ? challenge.name : null;
  return <Row title={label ?? challenge.name ?? "終局挑戰"} details={[name, progress(challenge.current, challenge.total)]} endsAt={challenge.endsAt} now={now} />;
}

function EventRow({ event, now }: { event: CalendarEvent; now: Date }) {
  return <Row title={event.name ?? "活動"} details={[event.kind === "double" ? "雙倍獎勵" : null, progress(event.current, event.total)]} endsAt={event.endsAt} now={now} />;
}

/** 五星排前面當標題 四星的名字寫在說明裡 */
function WarpRow({ warp, now }: { warp: CalendarWarp; now: Date }) {
  const featured = warp.items.filter((item) => item.rarity === 5);
  const headline = featured.length > 0 ? featured : warp.items;
  const others = warp.items.filter((item) => !headline.includes(item));
  const names = (items: WarpItem[]) => items.map((item) => item.name ?? "?").join("、");
  return (
    <Row
      leading={
        headline.length > 0 && (
          <span className="flex shrink-0 -space-x-2">
            {headline.map((item, i) => (
              <WarpIcon key={item.id ?? i} item={item} lightCone={warp.kind === "lightCone"} />
            ))}
          </span>
        )
      }
      title={headline.length > 0 ? names(headline) : (warp.name ?? "躍遷")}
      details={[warp.kind === "lightCone" ? "光錐" : "角色", others.length > 0 ? `四星：${names(others)}` : null]}
      endsAt={warp.endsAt}
      now={now}
    />
  );
}

/** 角色是圓形頭像 光錐是直的卡面 只露出上半部 */
function WarpIcon({ item, lightCone }: { item: WarpItem; lightCone: boolean }) {
  const src = externalAssetUrl(item.icon);
  if (!lightCone) return <Avatar src={src} name={item.name ?? "?"} size="sm" className="ring-2 ring-[#0b1030]" />;
  return (
    <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-[#1f2547] ring-2 ring-[#0b1030]">
      <ExternalImage
        src={src}
        alt=""
        fill
        className="object-cover object-top"
        fallback={
          <span className="absolute inset-0 grid place-items-center text-ink-soft">
            <Icon name="sparkles" className="size-4" />
          </span>
        }
      />
    </span>
  );
}

export function CalendarSkeleton() {
  return (
    <LoadingState label="向 HoYoLAB 查詢活動日曆…" className="stack">
      <h3 className="sr-title min-h-11">活動日曆</h3>
      <div className={LIST_GRID}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-none" />
        ))}
      </div>
    </LoadingState>
  );
}
