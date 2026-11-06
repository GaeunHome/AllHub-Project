import Link from "next/link";
import type { CSSProperties } from "react";
import { BUS_CITIES, isBusCity, type BusDirection, type BusEta, type BusSchedule } from "../../lib/bus";
import { countdownText } from "../../lib/countdown";
import { MODE_COLORS } from "../../lib/lines";
import type { Read } from "../../service/timetable";
import { searchHref, type SearchQuery } from "../search-query";
import { AddRoute, CloseResults } from "./result-parts";
import { EditSearchButton } from "./search-shell";

function scheduleText(schedule: BusSchedule | null): string | null {
  if (!schedule) return null;
  if (schedule.headway) return `現在約 ${schedule.headway.min}–${schedule.headway.max} 分鐘一班`;
  return schedule.departures.length > 0 ? `接下來發車：${schedule.departures.slice(0, 4).join("、")}` : null;
}

const etaText = (eta: BusEta | undefined) => (eta?.seconds != null ? countdownText(eta.seconds * 1000) : (eta?.status ?? "沒有資料"));

type BusResultsProps = { route: Read<BusDirection[]>; eta: Read<Record<string, BusEta>> | null; schedule: BusSchedule | null; query: SearchQuery; canAdd: boolean };

/** 上面是儲值卡的樣子 使用者要的 下面像公車 App 一樣列出每一站還有多久 想追蹤哪一站就加哪一站 */
export function BusResults({ route, eta, schedule, query, canAdd }: BusResultsProps) {
  if (!route.ok) return <p className="text-ink">路線資料暫時讀不到，稍後再試</p>;
  if (route.data.length === 0) return <p className="text-ink">找不到這條路線，確認一下縣市與路線名稱</p>;
  const selected = route.data.find((direction) => direction.direction === query.direction) ?? route.data[0];
  const note = scheduleText(schedule);
  const city = isBusCity(query.system) ? BUS_CITIES[query.system] : query.system;
  return (
    <section aria-label="查詢結果" className="trn-bus" style={{ "--trn-line": MODE_COLORS.bus } as CSSProperties}>
      <header className="trn-bus-card">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{city}公車</p>
          <span className="flex shrink-0 items-center gap-1">
            <EditSearchButton className="trn-bus-direction trn-bus-edit" />
            <CloseResults query={query} className="trn-bus-close" />
          </span>
        </div>
        <h2 className="trn-bus-line">{query.line}</h2>
        {note && <p className="tabular-nums">{note}</p>}
        <nav aria-label="方向" className="flex flex-wrap gap-2">
          {route.data.map((direction) => (
            <Link key={direction.direction} href={searchHref({ ...query, direction: direction.direction })} scroll={false} aria-current={direction.direction === selected.direction ? "true" : undefined} className="trn-bus-direction">
              往{direction.name}
            </Link>
          ))}
        </nav>
      </header>
      <div className="stack min-w-0">
        {eta && !eta.ok && <p className="text-ink">到站時間暫時讀不到，稍後再試</p>}
        <ol className="card p-0 py-2">
          {selected.stops.map((stop) => (
            <li key={stop.id} className="trn-bus-stop">
              <span className="min-w-0 flex-1 font-medium text-ink">{stop.name}</span>
              {eta?.ok && <span className="font-bold text-ink tabular-nums">{etaText(eta.data[stop.id])}</span>}
              {canAdd && <AddRoute fields={{ mode: "bus", system: query.system, line: query.line, originId: stop.id, destinationId: String(selected.direction) }} label="加入" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
