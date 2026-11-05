import type { CSSProperties, ReactNode } from "react";
import { formatTaipeiHourMinute } from "@/core/time";
import { Icon } from "@/core/ui/icon";
import { upcoming } from "../../lib/countdown";
import { plateInk } from "../../lib/lines";
import type { MetroLeg } from "../../lib/metro-route";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import type { SearchQuery } from "../search-query";
import { fareText } from "../transit-view";
import { AddRoute, stationName } from "./result-parts";
import { ResultScene } from "./result-scene";

/** 下一班列幾班 再多就是時刻表了 */
const NEXT_SHOWN = 3;

function ResultCard({ query, stations, children }: { query: SearchQuery; stations: Station[]; children: ReactNode }) {
  return (
    <section aria-label="查詢結果" className="card p-0 trn-results">
      <ResultScene mode="metro" from={stationName(stations, query.from)} to={stationName(stations, query.to)} query={query} />
      {children}
    </section>
  );
}

/** 站牌的代碼用路線色 字色由 --trn-plate-ink 帶進來 */
function StationPlate({ station }: { station: Station }) {
  return (
    <span className="trn-plate">
      <span className="trn-plate-code">{station.id}</span>
      {station.name}
    </span>
  );
}

function LegRow({ leg, transfer }: { leg: MetroLeg; transfer: boolean }) {
  return (
    <li className="trn-leg" style={{ "--trn-line": leg.color, "--trn-plate-ink": plateInk(leg.color) } as CSSProperties}>
      <p className="flex flex-wrap items-center gap-x-2 text-ink">
        <span aria-hidden="true" className="trn-dot" />
        <span className="font-semibold">{leg.line}</span>
        <span>往{leg.towardName}</span>
        <span className="tabular-nums">{leg.stops} 站</span>
      </p>
      <p className="trn-leg-path">
        <StationPlate station={leg.from} />
        <span aria-hidden="true" className="trn-leg-rail" />
        <StationPlate station={leg.to} />
        {transfer && (
          <span className="chip text-ink">
            <Icon name="repeat" className="size-3.5 shrink-0" />
            轉乘
          </span>
        )}
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

/** 總時間是估的 票價只有同一個系統裡才有 沒有就不寫 */
function MetroSummary({ minutes, fare, action }: { minutes: number | null; fare: number | null; action: ReactNode }) {
  if (minutes === null && fare === null && !action) return null;
  return (
    <div className="card-row trn-summary">
      {minutes !== null && (
        <span className="trn-summary-fact">
          <Icon name="timer" className="size-5 shrink-0" />約 {minutes} 分鐘
        </span>
      )}
      {fare !== null && (
        <span className="trn-summary-fact">
          <Icon name="banknote" className="size-5 shrink-0" />票價 {fareText(fare)}
        </span>
      )}
      {action && <span className="ml-auto shrink-0">{action}</span>}
    </div>
  );
}

type MetroResultsProps = { legs: MetroLeg[] | null; departures: Read<Departure[]> | null; minutes: number | null; fare: number | null; query: SearchQuery; stations: Station[]; now: Date; canAdd: boolean; saved: boolean };

/** 存成常用路線的是第一段 沒有時刻表就查不到方向 新增會被拒絕 所以不放按鈕 */
export function MetroResults({ legs, departures, minutes, fare, query, stations, now, canAdd, saved }: MetroResultsProps) {
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
    <ResultCard query={query} stations={stations}>
      <MetroSummary minutes={minutes} fare={fare} action={action} />
      <ol className="trn-legs">
        {legs.map((leg, index) => (
          <LegRow key={leg.from.id} leg={leg} transfer={index < legs.length - 1} />
        ))}
      </ol>
      <NextDepartures departures={timetable} failed={departures?.ok === false} now={now} />
    </ResultCard>
  );
}
