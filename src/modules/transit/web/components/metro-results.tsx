import type { CSSProperties, ReactNode } from "react";
import { formatTaipeiHourMinute } from "@/core/time";
import { upcoming } from "../../lib/countdown";
import type { MetroLeg } from "../../lib/metro-route";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import type { SearchQuery } from "../search-query";
import { AddRoute, CloseResults, stationName } from "./result-parts";

/** 下一班列幾班 再多就是時刻表了 */
const NEXT_SHOWN = 3;

function ResultCard({ query, stations, action, children }: { query: SearchQuery; stations: Station[]; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label="查詢結果" className="card p-0">
      <header className="card-row flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-semibold text-ink">
          {stationName(stations, query.from)} → {stationName(stations, query.to)}
        </h2>
        <span className="ml-auto flex items-center gap-2">
          {action}
          <CloseResults query={query} />
        </span>
      </header>
      {children}
    </section>
  );
}

function LegRow({ leg, transfer }: { leg: MetroLeg; transfer: boolean }) {
  return (
    <li className="trn-leg" style={{ "--trn-line": leg.color } as CSSProperties}>
      <p className="flex flex-wrap items-center gap-x-2 text-ink">
        <span aria-hidden="true" className="trn-dot" />
        <span className="font-semibold">{leg.line}</span>
        <span>往{leg.towardName}</span>
        <span className="tabular-nums">{leg.stops} 站</span>
      </p>
      <p className="trn-leg-path">
        <span className="trn-leg-stop">{leg.from.name}</span>
        <span aria-hidden="true" className="trn-leg-rail" />
        <span className="trn-leg-stop">{leg.to.name}</span>
        {transfer && <span className="chip text-ink">轉乘</span>}
      </p>
    </li>
  );
}

/** 文湖線沒有站別時刻表 回應是空的 路線本身還是有用 */
function NextDepartures({ departures, failed, now }: { departures: Departure[]; failed: boolean; now: Date }) {
  const next = upcoming(departures, now.getTime()).slice(0, NEXT_SHOWN);
  return (
    <p className="card-row trn-leg-next">
      <span className="font-semibold">下一班</span>
      {failed
        ? "時刻表暫時讀不到，稍後再試"
        : departures.length === 0
          ? "到站看看板"
          : next.length === 0
          ? "今天沒有班次了"
          : next.map(({ at }) => (
              <time key={at} className="text-lg font-bold">
                {formatTaipeiHourMinute(new Date(at))}
              </time>
            ))}
    </p>
  );
}

type MetroResultsProps = { legs: MetroLeg[] | null; departures: Read<Departure[]> | null; query: SearchQuery; stations: Station[]; now: Date; canAdd: boolean; saved: boolean };

/** 存成常用路線的是第一段 沒有時刻表就查不到方向 新增會被拒絕 所以不放按鈕 */
export function MetroResults({ legs, departures, query, stations, now, canAdd, saved }: MetroResultsProps) {
  if (!legs || legs.length === 0) {
    return (
      <ResultCard query={query} stations={stations}>
        <p className="card-row text-ink">{legs ? "起站跟迄站是同一站，不用搭車" : "查不到這段路線"}</p>
      </ResultCard>
    );
  }
  const [first] = legs;
  const timetable = departures?.ok ? departures.data : [];
  const canSave = canAdd && timetable.length > 0;
  const action = saved ? <span className="text-sm font-semibold text-ink">已在常用</span> : canSave ? <AddRoute fields={{ mode: "metro", system: first.system, line: "", originId: first.from.id, destinationId: first.towardId }} /> : null;
  return (
    <ResultCard query={query} stations={stations} action={action}>
      <ol className="trn-legs">
        {legs.map((leg, index) => (
          <LegRow key={leg.from.id} leg={leg} transfer={index < legs.length - 1} />
        ))}
      </ol>
      <NextDepartures departures={timetable} failed={departures?.ok === false} now={now} />
    </ResultCard>
  );
}
