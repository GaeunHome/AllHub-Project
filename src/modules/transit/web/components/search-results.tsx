import type { CSSProperties } from "react";
import { formatTaipeiHourMinute, taipeiDateKey } from "@/core/time";
import { routeColor } from "../../lib/lines";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import { trainsAfter, type SearchQuery } from "../search-query";
import { fastestTrain, groupByDayPart, rideOf } from "../train-groups";
import { kindChipClass, rideText } from "../transit-view";
import { AddRoute, CloseResults, stationName } from "./result-parts";

/** 查詢結果先列這麼多班 其他收起來 高鐵一天有上百班 */
const SHOWN_RESULTS = 20;

const BADGE_CHIPS: Record<string, string> = { 下一班: "chip chip-success", 最快: "chip chip-accent" };

const rideLabel = (departure: Departure) => rideText(Math.round((rideOf(departure) ?? 0) / 60_000));

type AddTrain = { fields: Record<string, string>; saved: boolean } | null;
type TrainProps = { departure: Departure; add: AddTrain; badges: string[]; from: string; to: string };

function TrainBadges({ badges }: { badges: string[] }) {
  return badges.map((badge) => (
    <span key={badge} className={BADGE_CHIPS[badge]}>
      {badge}
    </span>
  ));
}

function TrainName({ departure: { trainNo, toward } }: { departure: Departure }) {
  return (
    <span className="min-w-0 text-ink tabular-nums">
      {trainNo && `${trainNo} 車次 `}
      {toward && `往${toward}`}
    </span>
  );
}

function AddTrainButton({ add }: { add: NonNullable<AddTrain> }) {
  return add.saved ? <span className="text-sm font-semibold text-ink">已在常用</span> : <AddRoute fields={add.fields} label="加到常用" />;
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
            <span className="trn-ride-text">{rideLabel(departure)}</span>
          </span>
          <time className="trn-clock">{formatTaipeiHourMinute(new Date(arrivesAt))}</time>
        </>
      )}
    </p>
  );
}

/** 台鐵的時刻表列 */
function TrainRow({ departure, add, badges }: TrainProps) {
  return (
    <li className="trn-result">
      <TrainTimes departure={departure} />
      <div className="trn-result-info">
        {departure.kind && <span className={kindChipClass(departure.kind)}>{departure.kind}</span>}
        <TrainName departure={departure} />
        <TrainBadges badges={badges} />
        {add && (
          <span className="ml-auto shrink-0">
            <AddTrainButton add={add} />
          </span>
        )}
      </div>
    </li>
  );
}

function TicketStop({ at, name }: { at: number; name: string }) {
  return (
    <span className="trn-ticket-stop">
      <time className="trn-clock">{formatTaipeiHourMinute(new Date(at))}</time>
      <span className="font-semibold text-ink">{name}</span>
    </span>
  );
}

/** 高鐵的車票 使用者看過的樣子 左邊一條路線色 虛線撕開資訊與動作 */
function TrainTicket({ departure, add, badges, from, to }: TrainProps) {
  const { at, arrivesAt } = departure;
  return (
    <li className="trn-ticket">
      <div className="trn-ticket-head">
        <TrainName departure={departure} />
        <TrainBadges badges={badges} />
      </div>
      <div className="trn-ticket-route">
        <TicketStop at={at} name={from} />
        {arrivesAt && (
          <>
            <span className="trn-ticket-ride">
              <span aria-hidden="true" className="trn-ticket-arrow" />
              <span className="text-sm font-semibold text-ink tabular-nums">{rideLabel(departure)}</span>
            </span>
            <TicketStop at={arrivesAt} name={to} />
          </>
        )}
      </div>
      {add && (
        <div className="trn-ticket-action">
          <AddTrainButton add={add} />
        </div>
      )}
    </li>
  );
}

// 網址的日期是 YYYY-MM-DD 標題寫月與日就夠
const shortDate = (date: string) => date.slice(5).replace("-", "/");

type TrainResultsProps = { results: Read<Departure[]>; query: SearchQuery; stations: Station[]; now: Date; canAdd: boolean; saved: readonly string[] };

/** 高鐵與台鐵共用分組與標籤 只有每一班的樣子不同 */
export function TrainResults({ results, query, stations, now, canAdd, saved }: TrainResultsProps) {
  if (!results.ok) return <p className="text-ink">時刻表暫時讀不到，稍後再試</p>;
  const trains = trainsAfter(results.data, { date: query.date, time: query.time, now: now.getTime() });
  const from = stationName(stations, query.from);
  const to = stationName(stations, query.to);
  const ticket = query.mode === "thsr";
  const Train = ticket ? TrainTicket : TrainRow;
  const route = { mode: query.mode, system: "", originId: query.from, destinationId: query.to };
  // 選了出發時間時第一班不一定是真正的下一班
  const soonest = trainsAfter(results.data, { date: query.date, time: "", now: now.getTime() })[0];
  const next = query.date === taipeiDateKey(now) && trains[0]?.at === soonest?.at ? trains[0] : undefined;
  const fastest = fastestTrain(trains);
  const badgesOf = (departure: Departure) => [...(departure === next ? ["下一班"] : []), ...(departure === fastest ? ["最快"] : [])];
  // 存的是某一班車 使用者要的
  const addOf = ({ trainNo }: Departure): AddTrain => {
    if (!trainNo) return null;
    const isSaved = saved.includes(trainNo);
    return isSaved || canAdd ? { fields: { ...route, line: trainNo }, saved: isSaved } : null;
  };
  const listed = (list: Departure[]) => (
    <div className="trn-parts">
      {groupByDayPart(list).map((group) => (
        <div key={group.trains[0].at}>
          <h3 className="trn-part-title">{group.part}</h3>
          <ul className={ticket ? "trn-tickets" : "trn-result-list"}>
            {group.trains.map((departure) => (
              <Train key={`${departure.at}-${departure.trainNo}`} departure={departure} add={addOf(departure)} badges={badgesOf(departure)} from={from} to={to} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
  return (
    <section aria-label="查詢結果" className="card p-0 trn-results" style={{ "--trn-line": routeColor(query.mode, "", query.from) } as CSSProperties}>
      <header className="card-row flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-semibold text-ink">
          {from} → {to}
        </h2>
        <span className="text-sm text-ink tabular-nums">{shortDate(query.date)}</span>
        <span className="text-sm text-ink tabular-nums">共 {trains.length} 班</span>
        <span className="ml-auto flex items-center gap-2">
          <CloseResults query={query} />
        </span>
      </header>
      {trains.length === 0 ? <p className="card-row text-ink">{query.time ? "這個時間之後沒有班次了" : "這一天沒有班次了"}</p> : listed(trains.slice(0, SHOWN_RESULTS))}
      {trains.length > SHOWN_RESULTS && (
        <details className="disclosure card-row">
          <summary>其他 {trains.length - SHOWN_RESULTS} 班</summary>
          {listed(trains.slice(SHOWN_RESULTS))}
        </details>
      )}
    </section>
  );
}
