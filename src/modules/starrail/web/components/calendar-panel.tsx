import type { ReactNode } from "react";
import { requireModule } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { ExternalImage } from "@/core/ui/external-image";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { challengeLabel, ongoingCalendar, type CalendarChallenge, type CalendarEvent, type CalendarWarp, type WarpItem } from "../../lib/calendar";
import { formatRemaining, formatTaipeiTime } from "../../lib/responses";
import { elapsedPercent, ratioPercent } from "../chart-scale";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedActCalendar } from "../../service/cached";
import { PanelNotice } from "./panel-parts";
import { rarityClass } from "./sr-visuals";

const TITLE_ID = "starrail-calendar-title";
// 手機一欄 寬螢幕兩欄 超寬螢幕三塊並排
const LIST_GRID = "grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3";

/**
 * 活動日曆快取 30 分鐘 結束時間是絕對時間 剩幾天每次算繪時重算
 * 帳號的 cookie 失效標記只由即時便箋決定 這裡不動
 */
export async function CalendarPanel({ account }: { account: StarrailAccountView }) {
  const user = await requireModule("starrail");
  const result = await cachedActCalendar(user.id, account.id);
  if (!result.ok) {
    return (
      <PanelNotice title="活動日曆" tall>
        <FormMessage tone="error">{result.message}</FormMessage>
      </PanelNotice>
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
        {result.calendar.version && <span className="text-sm text-ink">目前版本 {result.calendar.version}</span>}
        <span className="text-sm text-ink">{updated}</span>
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
      {children.length > 0 ? <ul className="divide-y divide-line border-t border-line">{children}</ul> : <p className="card-row border-t border-line text-ink">{empty}</p>}
    </div>
  );
}

/** 剩幾天 確切的結束時間放在滑過的說明 旁邊不多寫一行小字 */
function Remaining({ endsAt, now }: { endsAt: number | null; now: Date }) {
  if (endsAt === null) return null;
  const left = formatRemaining((endsAt - now.getTime()) / 1000);
  if (!left) return null;
  return (
    <time dateTime={new Date(endsAt).toISOString()} title={`${formatTaipeiTime(new Date(endsAt), now)} 結束`} className="sr-num shrink-0 text-base font-semibold whitespace-nowrap text-ink">
      {left}
    </time>
  );
}

/** 細細的一條 只用一種金色 */
function Meter({ percent }: { percent: number }) {
  return (
    <span aria-hidden className="sr-meter">
      <span className="sr-meter-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}

/** 名稱在左 剩幾天在右 下面是進度條與數字 */
function Row({ title, extra, endsAt, now, current, total, star = false }: { title: string; extra?: ReactNode; endsAt: number | null; now: Date; current: number | null; total: number | null; star?: boolean }) {
  const percent = ratioPercent(current, total);
  return (
    <li className="card-row flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-semibold text-ink">{title}</span>
          {extra}
        </p>
        <Remaining endsAt={endsAt} now={now} />
      </div>
      {percent !== null && (
        <div className="flex items-center gap-3">
          <Meter percent={percent} />
          <span className="sr-num shrink-0 text-sm font-semibold text-ink">
            {star && <span className="text-sr-gold">★ </span>}
            {current}/{total}
          </span>
        </div>
      )}
    </li>
  );
}

function ChallengeRow({ challenge, now }: { challenge: CalendarChallenge; now: Date }) {
  const label = challengeLabel(challenge.kind);
  // 名稱跟模式一樣時只寫一次
  const name = challenge.name && challenge.name !== label ? challenge.name : null;
  return (
    <Row
      title={label ?? challenge.name ?? "終局挑戰"}
      extra={name && <span className="truncate text-sm text-ink">{name}</span>}
      endsAt={challenge.endsAt}
      now={now}
      current={challenge.current}
      total={challenge.total}
      star
    />
  );
}

function EventRow({ event, now }: { event: CalendarEvent; now: Date }) {
  const extra = event.kind === "double" && (
    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--sr-gold-ink)]">
      <Icon name="gift" className="size-3.5" />
      雙倍獎勵
    </span>
  );
  return <Row title={event.name ?? "活動"} extra={extra} endsAt={event.endsAt} now={now} current={event.current} total={event.total} />;
}

/** 使用者要的有圖 五星的大圖與名字當標題 四星是下面一排小頭像 最下面是時間過了多少 */
function WarpRow({ warp, now }: { warp: CalendarWarp; now: Date }) {
  const featured = warp.items.filter((item) => item.rarity === 5);
  const headline = featured.length > 0 ? featured : warp.items;
  const others = warp.items.filter((item) => !headline.includes(item));
  const names = (items: WarpItem[]) => items.map((item) => item.name ?? "?").join("、");
  const elapsed = elapsedPercent(warp.startsAt, warp.endsAt, now.getTime());
  const lightCone = warp.kind === "lightCone";
  return (
    <li className="card-row flex items-center gap-4">
      {headline[0] && <PoolArt item={headline[0]} lightCone={lightCone} />}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 flex-col">
            <span className="sr-kicker">{lightCone ? "光錐躍遷" : "角色躍遷"}</span>
            <span className="truncate text-lg font-bold text-ink">{headline.length > 0 ? names(headline) : (warp.name ?? "躍遷")}</span>
          </p>
          <Remaining endsAt={warp.endsAt} now={now} />
        </div>
        {others.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="sr-only">四星：{names(others)}</span>
            {others.map((item, i) => (
              <WarpIcon key={item.id ?? i} item={item} lightCone={lightCone} />
            ))}
          </span>
        )}
        {/* 進度條會撐滿剩下的寬度 外面要包一層左右排的 不然高度會被壓成 0 */}
        {elapsed !== null && (
          <span className="flex">
            <Meter percent={elapsed} />
          </span>
        )}
      </div>
    </li>
  );
}

/** 五星的大圖 角色是頭像 光錐是直的卡面露出上半部 底色是五星的金色 */
function PoolArt({ item, lightCone }: { item: WarpItem; lightCone: boolean }) {
  return (
    <span aria-hidden className={`sr-pool-art ${rarityClass(item.rarity)}`}>
      <ExternalImage
        src={externalAssetUrl(item.icon)}
        alt=""
        fill
        className={lightCone ? "object-cover object-top" : "object-cover"}
        fallback={<span className="absolute inset-0 grid place-items-center text-2xl font-bold text-white">{Array.from(item.name ?? "?")[0]}</span>}
      />
    </span>
  );
}

/** 四星的小頭像 角色是圓形 光錐是直的卡面 只露出上半部 */
function WarpIcon({ item, lightCone }: { item: WarpItem; lightCone: boolean }) {
  const src = externalAssetUrl(item.icon);
  if (!lightCone) return <Avatar src={src} name={item.name ?? "?"} size="sm" className="ring-2 ring-[var(--sr-avatar-ring)]" />;
  return (
    <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-[var(--sr-avatar-bg)] ring-2 ring-[var(--sr-avatar-ring)]">
      <ExternalImage
        src={src}
        alt=""
        fill
        className="object-cover object-top"
        fallback={
          <span className="absolute inset-0 grid place-items-center text-ink">
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
