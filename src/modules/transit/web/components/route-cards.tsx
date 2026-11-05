"use client";

import { useRouter } from "next/navigation";
import { useEffect, type CSSProperties } from "react";
import { formatTaipeiHourMinute, taipeiDateKey } from "@/core/time";
import { ActionButton } from "@/core/ui/action-button";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Icon } from "@/core/ui/icon";
import { useClockStep } from "@/core/ui/live-clock";
import { MoreMenu } from "@/core/ui/more-menu";
import { TICK_MS, countdownText, countdownUnits, delayMinutes, liveAnchor, shouldReadLive, upcoming, withLive, type LiveReading } from "../../lib/countdown";
import { MODE_LABELS, trainNoOf } from "../../lib/modes";
import type { Departure } from "../../lib/timetable";
import type { TransitRoute } from "../../data/schema";
import { deleteRouteAction, setTrackedAction } from "../actions";
import { destinationLabel, lineColor, routeLabel } from "../transit-view";
import { useLiveReading } from "../use-live-reading";

type RouteCardProps = { route: TransitRoute; departures: Departure[]; problem: string | null; status: string | null };

const lineStyle = (route: TransitRoute) => ({ "--trn-line": lineColor(route) }) as CSSProperties;

/** 明天的班次寫出明天 才不會以為今天還有車 */
function clockOf(at: number, now: number): string {
  const clock = formatTaipeiHourMinute(new Date(at));
  return taipeiDateKey(new Date(at)) === taipeiDateKey(new Date(now)) ? clock : `明天 ${clock}`;
}

/** 頁面開著跨過最後一班時 重讀一次才有明天的班次 */
function useRefreshWhenFinished(finished: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);
}

function RouteMenu({ route }: { route: TransitRoute }) {
  return (
    <MoreMenu label={`${routeLabel(route)}的選項`}>
      <DeleteMenuItem action={deleteRouteAction} fields={{ id: route.id }} confirmMessage={`確定刪除常用路線「${routeLabel(route)}」？`} label="刪除路線" deletedMessage="已刪除路線" />
    </MoreMenu>
  );
}

function TrackButton({ route }: { route: TransitRoute }) {
  return (
    <ActionButton action={setTrackedAction} fields={{ id: route.id, tracked: route.tracked ? "false" : "true" }} aria-pressed={route.tracked} className={route.tracked ? "trn-track" : "btn-ghost btn-sm"}>
      <Icon name="star" className="size-4" />
      {route.tracked ? "追蹤中" : "追蹤"}
    </ActionButton>
  );
}

function TrainTitle({ route, next }: { route: TransitRoute; next: Departure | undefined }) {
  const trainNo = trainNoOf(route) || next?.trainNo;
  const train = trainNo ? `${trainNo} 車次` : route.line || (next?.toward ?? destinationLabel(route));
  return (
    <p className="trn-train">
      <span aria-hidden className="trn-dot" />
      {MODE_LABELS[route.mode]} {next?.kind ?? ""} {train}
    </p>
  );
}

function BigCountdown({ next, now, empty }: { next: Departure | undefined; now: number; empty: string }) {
  if (!next) return <p className="trn-count">{empty}</p>;
  const units = countdownUnits(next.at - now);
  return (
    <p role="timer" className="trn-count">
      {units.length === 0
        ? "進站中"
        : units.map(({ value, unit }) => (
            <span key={unit}>
              {value}
              <small>{unit}</small>
            </span>
          ))}
    </p>
  );
}

/** 光點每 5 秒從起站跑到迄站 跑完秒數就更新 key 讓動畫跟著重來 */
function RouteLine({ route, tick }: { route: TransitRoute; tick: number | null }) {
  return (
    <div className="trn-line">
      <span className="trn-stop" data-end="start" />
      {tick !== null && <span key={tick} aria-hidden className="trn-pulse" />}
      <span className="trn-stop" data-end="end" />
      <span className="trn-name" data-end="start">
        {route.originName}
      </span>
      <span className="trn-name" data-end="end">
        {destinationLabel(route)}
      </span>
    </div>
  );
}

/** 公車沒有班次表 沒有車時寫看板給的原因 */
function emptyText(route: TransitRoute, live: LiveReading, status: string | null, hasDepartures: boolean): string {
  const current = live.kind === "estimate" ? live.status : null;
  if (trainNoOf(route)) return hasDepartures ? "這班車今天已開走" : "今明兩天沒有這班車";
  return current ?? status ?? (route.mode === "bus" ? "目前沒有車" : "今天沒有班次了");
}

function liveNote(route: TransitRoute, live: LiveReading, delay: number): string {
  if (delay > 0) return `誤點 ${delay} 分`;
  if (route.mode === "thsr") return "照時刻表";
  return live.kind === "none" ? "照時刻表" : "已校正";
}

/** 追蹤中的大卡 5 秒更新一次 開車前 30 分鐘內每分鐘向 TDX 校正 */
export function TrackedCard({ route, departures, problem, status }: RouteCardProps) {
  const tick = useClockStep(TICK_MS);
  const now = tick ?? 0;
  const scheduledNext = tick === null ? null : liveAnchor(departures, now, trainNoOf(route));
  const live = useLiveReading(route.id, tick !== null && shouldReadLive(route.mode, scheduledNext, now));
  const list = tick === null ? [] : withLive(departures, live, now);
  const [next, ...later] = list;
  useRefreshWhenFinished(tick !== null && departures.length > 0 && list.length === 0);

  return (
    <article className="card stack trn-card" style={lineStyle(route)}>
      <header className="flex items-center gap-2">
        <TrainTitle route={route} next={next} />
        <TrackButton route={route} />
        <RouteMenu route={route} />
      </header>
      {problem ? <p className="text-ink">資料暫時讀不到，稍後再試</p> : <BigCountdown next={next} now={now} empty={emptyText(route, live, status, departures.length > 0)} />}
      <RouteLine route={route} tick={tick} />
      {next && tick !== null && (
        <footer className="trn-foot">
          <span className="tabular-nums">
            <b>{clockOf(next.at, now)}</b> 開{next.arrivesAt ? <> <b>{formatTaipeiHourMinute(new Date(next.arrivesAt))}</b> 到</> : null}
          </span>
          <span className="trn-note">{liveNote(route, live, delayMinutes(next, departures))}</span>
          {later.slice(0, 2).map((departure, index) => (
            <span key={departure.at} className="trn-pill tabular-nums">
              {index === 0 && "接著 "}
              {clockOf(departure.at, now)}
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

/** 沒追蹤的小卡只照時刻表 不用額度 */
export function RouteCard({ route, departures, problem, status }: RouteCardProps) {
  const tick = useClockStep(TICK_MS);
  const next = tick === null ? undefined : upcoming(departures, tick)[0];
  useRefreshWhenFinished(tick !== null && departures.length > 0 && next === undefined);
  return (
    <article className="card trn-mini" style={lineStyle(route)}>
      <header className="flex items-start gap-1">
        <h3 className="min-w-0 flex-1 font-semibold break-words text-ink">{routeLabel(route)}</h3>
        <RouteMenu route={route} />
      </header>
      <span aria-hidden className="trn-mini-line" />
      <p className="trn-mini-count tabular-nums">{problem ? "資料讀不到" : next && tick !== null ? countdownText(next.at - tick) : tick === null ? "" : emptyText(route, { kind: "none" }, status, departures.length > 0)}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-soft tabular-nums">{next && tick !== null ? `${clockOf(next.at, tick)} 開` : MODE_LABELS[route.mode]}</span>
        <TrackButton route={route} />
      </div>
    </article>
  );
}
