import type { ReactNode } from "react";
import type { MetroLeg } from "../../lib/metro-route";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import type { SearchQuery } from "../search-query";
import { MetroBoard, type BoardState } from "./metro-board";
import { AddRoute, stationName } from "./result-parts";
import { ResultScene } from "./result-scene";

function ResultCard({ query, stations, children }: { query: SearchQuery; stations: Station[]; children: ReactNode }) {
  return (
    <section aria-label="查詢結果" className="card p-0 trn-results">
      <ResultScene mode="metro" from={stationName(stations, query.from)} to={stationName(stations, query.to)} query={query} />
      {children}
    </section>
  );
}

/** 文湖線沒有站別時刻表 回應是空的 路線本身還是有用 */
function stateOf(departures: Read<Departure[]> | null): BoardState {
  if (departures?.ok === false) return "failed";
  return departures?.ok && departures.data.length > 0 ? "ok" : "board";
}

type MetroResultsProps = { legs: MetroLeg[] | null; departures: Read<Departure[]> | null; legSeconds: (number | null)[]; minutes: number | null; fare: number | null; query: SearchQuery; stations: Station[]; now: Date; canAdd: boolean; saved: boolean };

/** 存成常用路線的是第一段 沒有時刻表就查不到方向 新增會被拒絕 所以不放按鈕 */
export function MetroResults({ legs, departures, legSeconds, minutes, fare, query, stations, now, canAdd, saved }: MetroResultsProps) {
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
  const boardLegs = legs.map(({ line, color, from, to, towardName, stops }, index) => ({ line, color, from, to, towardName, stops, seconds: legSeconds[index] ?? null }));
  return (
    <ResultCard query={query} stations={stations}>
      <MetroBoard legs={boardLegs} departures={timetable} state={stateOf(departures)} now={now.getTime()} minutes={minutes} fare={fare} action={action} />
    </ResultCard>
  );
}
