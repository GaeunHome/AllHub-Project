"use client";

import { Icon } from "@/core/ui/icon";
import { useCurrentMinute } from "@/core/ui/live-clock";
import { CardHeader } from "@/core/ui/page-header";
import { Skeleton } from "@/core/ui/skeleton";
import { navigateUrl } from "../../lib/maps";
import { formatClock } from "../../lib/schedule";
import type { TripItem } from "../../service/trips";
import { deviceClock, todayView, type StopState, type TodayStop, type TodayView } from "../today-view";
import type { DayView } from "../trip-view";

type TodayCardProps = {
  days: DayView[];
  items: TripItem[];
  destination: string | null;
  /** 伺服器照台北日期判斷今天在旅途中 先留好位置 接手後才不會把看板往下推 */
  expected: boolean;
};

const STATE_TEXT: Record<StopState, string> = { done: "已過", here: "現在", next: "下一站", later: "" };

/** 旅途中才出現 哪一天 幾點都看手機的時鐘 */
export function TodayCard({ days, items, destination, expected }: TodayCardProps) {
  const minute = useCurrentMinute();
  if (minute === null) return expected ? <Skeleton className="h-72 rounded-2xl" /> : null;
  const { date, minutes } = deviceClock(new Date(minute));
  const day = days.find((candidate) => candidate.date === date);
  if (!day) return null;
  const view = todayView(items, date, minutes);

  return (
    <section aria-labelledby="trv-today" className="card stack">
      <CardHeader id="trv-today" icon={<Icon name="calendar-clock" />}>
        今天 {day.short}
      </CardHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Focus view={view} destination={destination} />
        {view.stops.length > 0 && <Timeline stops={view.stops} />}
      </div>
    </section>
  );
}

function Focus({ view: { stops, here, next }, destination }: { view: TodayView; destination: string | null }) {
  if (stops.length === 0) return <p className="text-ink">今天還沒排行程</p>;
  if (!here && !next) return <p className="text-ink">今天的行程都走完了</p>;
  if (!next) return <Headline label="今天最後一站" title={here!.item.title} detail={`停留到 ${formatClock(here!.slot.leave)}`} />;
  const { item, slot } = next;
  return (
    <div className="stack">
      {here && (
        <p className="text-ink">
          現在在 {here.item.title}，停留到 <span className="tabular-nums">{formatClock(here.slot.leave)}</span>
        </p>
      )}
      <Headline label="下一站" title={item.title} detail={`${formatClock(slot.arrive)} 到${item.stayMinutes > 0 ? `，停留 ${item.stayMinutes} 分鐘` : ""}`} />
      <a href={navigateUrl(item, destination)} target="_blank" rel="noreferrer" className="btn-primary sm:w-fit">
        <Icon name="map-pin" className="size-4" />
        開導航
      </a>
    </div>
  );
}

function Headline({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="font-medium text-ink-soft">{label}</p>
      <p className="text-2xl font-bold break-words text-ink">{title}</p>
      <p className="text-ink tabular-nums">{detail}</p>
    </div>
  );
}

function Timeline({ stops }: { stops: TodayStop[] }) {
  return (
    <ol aria-label="今天的行程" className="trv-today-list">
      {stops.map(({ item, slot, state }) => (
        <li key={item.id} data-state={state} className="trv-today-stop">
          <span className="tabular-nums">{formatClock(slot.arrive)}</span>
          <span className="min-w-0 break-words">{item.title}</span>
          {STATE_TEXT[state] && <span className="sr-only">{STATE_TEXT[state]}</span>}
        </li>
      ))}
    </ol>
  );
}
