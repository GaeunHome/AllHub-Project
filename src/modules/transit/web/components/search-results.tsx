import Link from "next/link";
import { formatTaipeiHourMinute } from "@/core/time";
import { ActionButton } from "@/core/ui/action-button";
import { Icon } from "@/core/ui/icon";
import { BUS_CITIES, isBusCity, type BusDirection, type BusEta, type BusSchedule } from "../../lib/bus";
import { countdownText } from "../../lib/countdown";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import { addRouteAction } from "../actions";
import { searchHref, type SearchQuery } from "../search-query";

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

function ResultRow({ departure }: { departure: Departure }) {
  const minutes = departure.arrivesAt ? Math.round((departure.arrivesAt - departure.at) / 60_000) : null;
  return (
    <li className="card-row flex flex-wrap items-center gap-x-4 gap-y-0.5">
      <span className="font-semibold text-ink tabular-nums">
        {formatTaipeiHourMinute(new Date(departure.at))}
        {departure.arrivesAt ? ` → ${formatTaipeiHourMinute(new Date(departure.arrivesAt))}` : ""}
      </span>
      <span className="min-w-0 flex-1 text-ink">{[departure.trainNo && `${departure.trainNo} 車次`, departure.kind, !departure.trainNo && departure.toward && `往${departure.toward}`].filter(Boolean).join("，")}</span>
      {minutes !== null && <span className="text-sm text-ink-soft tabular-nums">{minutes} 分鐘</span>}
    </li>
  );
}

const nameOf = (list: readonly Station[], id: string) => list.find((station) => station.id === id)?.name ?? id;

type TrainResultsProps = { results: Read<Departure[]>; query: SearchQuery; stations: Station[]; directions: Station[]; now: Date; canAdd: boolean };

export function TrainResults({ results, query, stations, directions, now, canAdd }: TrainResultsProps) {
  if (!results.ok) return <p className="text-ink">時刻表暫時讀不到，稍後再試</p>;
  const metro = query.mode === "metro";
  // 查今天時開走的不列 查別天全部列
  const trains = results.data.filter((departure) => departure.at > now.getTime());
  const title = `${nameOf(stations, query.from)} → ${metro ? `往${nameOf(directions, query.to)}` : nameOf(stations, query.to)}`;
  return (
    <section aria-label="查詢結果" className="card p-0">
      <header className="card-row flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {canAdd && <AddRoute fields={{ mode: query.mode, system: metro ? query.system : "", line: "", originId: query.from, destinationId: query.to }} />}
      </header>
      {trains.length === 0 ? (
        <p className="card-row text-ink">這一天沒有班次了</p>
      ) : (
        <ul className="card-list">
          {trains.slice(0, SHOWN_RESULTS).map((departure) => (
            <ResultRow key={`${departure.at}-${departure.trainNo}`} departure={departure} />
          ))}
        </ul>
      )}
      {trains.length > SHOWN_RESULTS && (
        <details className="disclosure card-row">
          <summary>其他 {trains.length - SHOWN_RESULTS} 班</summary>
          <ul className="card-list">
            {trains.slice(SHOWN_RESULTS).map((departure) => (
              <ResultRow key={`${departure.at}-${departure.trainNo}`} departure={departure} />
            ))}
          </ul>
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
        <h2 className="font-semibold text-ink">
          {city} {query.line}
        </h2>
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
      <ul className="card-list">
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
