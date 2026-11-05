import Link from "next/link";
import type { CSSProperties } from "react";
import { formatTaipeiHourMinute } from "@/core/time";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { BUS_CITIES, isBusCity, type BusDirection, type BusEta, type BusSchedule } from "../../lib/bus";
import { countdownText } from "../../lib/countdown";
import { routeColor } from "../../lib/lines";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import { addRouteAction } from "../actions";
import { closedHref, searchHref, trainsAfter, type SearchQuery } from "../search-query";
import { rideText } from "../transit-view";

/** 查詢結果先列這麼多班 其他收起來 高鐵一天有上百班 */
const SHOWN_RESULTS = 20;

function AddRoute({ fields, label = "加到常用路線" }: { fields: Record<string, string>; label?: string }) {
  return (
    <ActionButton action={addRouteAction} fields={fields} className="btn-secondary btn-sm">
      <Icon name="plus" className="size-4" />
      {label}
    </ActionButton>
  );
}

function CloseResults({ query }: { query: SearchQuery }) {
  return (
    <Link href={closedHref(query)} scroll={false} aria-label="關閉查詢結果" className="icon-button shrink-0">
      <Icon name="x" className="size-4" />
    </Link>
  );
}

/** 出發與抵達最大 中間是一小段路線圖 */
function TrainTimes({ departure }: { departure: Departure }) {
  const { at, arrivesAt } = departure;
  return (
    <p className="trn-times">
      <time className="trn-clock">{formatTaipeiHourMinute(new Date(at))}</time>
      {arrivesAt && (
        <>
          <span className="trn-ride">
            <span className="trn-ride-text">{rideText(Math.round((arrivesAt - at) / 60_000))}</span>
          </span>
          <time className="trn-clock">{formatTaipeiHourMinute(new Date(arrivesAt))}</time>
        </>
      )}
    </p>
  );
}

type AddTrain = { fields: Record<string, string>; saved: boolean } | null;

function TrainRow({ departure, add }: { departure: Departure; add: AddTrain }) {
  return (
    <li className="trn-result">
      <TrainTimes departure={departure} />
      <div className="trn-result-info">
        {departure.kind && <span className="chip">{departure.kind}</span>}
        <span className="text-ink tabular-nums">{departure.trainNo ? `${departure.trainNo} 車次` : departure.toward && `往${departure.toward}`}</span>
        <span className="ml-auto shrink-0">{add?.saved ? <span className="text-sm font-semibold text-ink-soft">已在常用</span> : add && <AddRoute fields={add.fields} label="加到常用" />}</span>
      </div>
    </li>
  );
}

const nameOf = (list: readonly Station[], id: string) => list.find((station) => station.id === id)?.name ?? id;

// 網址的日期是 YYYY-MM-DD 標題寫月與日就夠
const shortDate = (date: string) => date.slice(5).replace("-", "/");

type TrainResultsProps = { results: Read<Departure[]>; query: SearchQuery; stations: Station[]; directions: Station[]; now: Date; canAdd: boolean; saved: readonly string[] };

export function TrainResults({ results, query, stations, directions, now, canAdd, saved }: TrainResultsProps) {
  if (!results.ok) return <p className="text-ink">時刻表暫時讀不到，稍後再試</p>;
  const metro = query.mode === "metro";
  const trains = trainsAfter(results.data, { date: query.date, time: query.time, now: now.getTime() });
  const title = `${nameOf(stations, query.from)} → ${metro ? `往${nameOf(directions, query.to)}` : nameOf(stations, query.to)}`;
  const route = { mode: query.mode, system: metro ? query.system : "", originId: query.from, destinationId: query.to };
  // 高鐵與台鐵存的是某一班車 使用者要的 捷運沒有車次 存整段路
  const addOf = ({ trainNo }: Departure): AddTrain => {
    if (metro || !trainNo) return null;
    const isSaved = saved.includes(trainNo);
    return isSaved || canAdd ? { fields: { ...route, line: trainNo }, saved: isSaved } : null;
  };
  const row = (departure: Departure) => <TrainRow key={`${departure.at}-${departure.trainNo}`} departure={departure} add={addOf(departure)} />;
  return (
    <section aria-label="查詢結果" className="card p-0 trn-results" style={{ "--trn-line": routeColor(query.mode, query.system, query.from) } as CSSProperties}>
      <header className="card-row flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-semibold text-ink">{title}</h2>
        {!metro && <span className="text-sm text-ink-soft tabular-nums">{shortDate(query.date)}</span>}
        <span className="text-sm text-ink-soft tabular-nums">共 {trains.length} 班</span>
        <span className="ml-auto flex items-center gap-2">
          {metro && canAdd && <AddRoute fields={{ ...route, line: "" }} />}
          <CloseResults query={query} />
        </span>
      </header>
      {trains.length === 0 ? (
        <p className="card-row text-ink">{query.time ? "這個時間之後沒有班次了" : "這一天沒有班次了"}</p>
      ) : (
        <ul className="trn-result-list">{trains.slice(0, SHOWN_RESULTS).map(row)}</ul>
      )}
      {trains.length > SHOWN_RESULTS && (
        <details className="disclosure card-row">
          <summary>其他 {trains.length - SHOWN_RESULTS} 班</summary>
          <ul className="trn-result-list">{trains.slice(SHOWN_RESULTS).map(row)}</ul>
        </details>
      )}
    </section>
  );
}

function scheduleText(schedule: BusSchedule | null): string | null {
  if (!schedule) return null;
  if (schedule.headway) return `現在約 ${schedule.headway.min}–${schedule.headway.max} 分鐘一班`;
  return schedule.departures.length > 0 ? `接下來發車：${schedule.departures.slice(0, 4).join("、")}` : null;
}

const etaText = (eta: BusEta | undefined) => (eta?.seconds != null ? countdownText(eta.seconds * 1000) : (eta?.status ?? "沒有資料"));

type BusResultsProps = { route: Read<BusDirection[]>; eta: Read<Record<string, BusEta>> | null; schedule: BusSchedule | null; query: SearchQuery; canAdd: boolean };

/** 像公車 App 一樣列出每一站還有多久 班距寫在標題下面 想追蹤哪一站就加哪一站 */
export function BusResults({ route, eta, schedule, query, canAdd }: BusResultsProps) {
  if (!route.ok) return <p className="text-ink">路線資料暫時讀不到，稍後再試</p>;
  if (route.data.length === 0) return <p className="text-ink">找不到這條路線，確認一下縣市與路線名稱</p>;
  const selected = route.data.find((direction) => direction.direction === query.direction) ?? route.data[0];
  const note = scheduleText(schedule);
  const city = isBusCity(query.system) ? BUS_CITIES[query.system] : query.system;
  return (
    <section aria-label="查詢結果" className="card p-0">
      <header className="card-row flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">
            {city} {query.line}
          </h2>
          <CloseResults query={query} />
        </div>
        {note && <p className="text-ink tabular-nums">{note}</p>}
        <nav aria-label="方向" className="flex flex-wrap gap-2">
          {route.data.map((direction) => (
            <Link key={direction.direction} href={searchHref({ ...query, direction: direction.direction })} scroll={false} aria-current={direction.direction === selected.direction ? "true" : undefined} className="btn-secondary btn-sm aria-[current]:border-accent">
              往{direction.name}
            </Link>
          ))}
        </nav>
      </header>
      {eta && !eta.ok && <p className="card-row text-ink">到站時間暫時讀不到，稍後再試</p>}
      <ul className="trn-result-list">
        {selected.stops.map((stop) => (
          <li key={stop.id} className="card-row flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 font-medium text-ink">{stop.name}</span>
            {eta?.ok && <span className="font-semibold text-ink tabular-nums">{etaText(eta.data[stop.id])}</span>}
            {canAdd && <AddRoute fields={{ mode: "bus", system: query.system, line: query.line, originId: stop.id, destinationId: String(selected.direction) }} label="加入" />}
          </li>
        ))}
      </ul>
    </section>
  );
}
