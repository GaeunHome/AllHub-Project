import type { CSSProperties } from "react";
import { formatTaipeiHourMinute, taipeiDateKey } from "@/core/time";
import { Icon } from "@/core/ui/icon";
import { lowestTraFare, traFareOf, type CabinFare, type TraFare } from "../../lib/fares";
import { routeColor } from "../../lib/lines";
import type { Departure, Station } from "../../lib/timetable";
import type { Read } from "../../service/timetable";
import { trainsAfter, type SearchQuery } from "../search-query";
import { fastestTrain, groupByDayPart, rideOf } from "../train-groups";
import { fareText, kindChipClass, rideText } from "../transit-view";
import { StarTrain, stationName } from "./result-parts";
import { ResultScene } from "./result-scene";

/** 使用者要的 先列接下來這麼多班 其他收起來 高鐵一天有上百班 */
const SHOWN_RESULTS = 8;

const BADGE_CHIPS: Record<string, string> = { 下一班: "chip chip-success", 最快: "chip chip-accent" };

const rideLabel = (departure: Departure) => rideText(Math.round((rideOf(departure) ?? 0) / 60_000));

type AddTrain = { fields: Record<string, string>; name: string; saved: boolean } | null;
type TrainProps = { departure: Departure; add: AddTrain; badges: string[]; from: string; to: string; fare: number | null };

function TrainBadges({ badges }: { badges: string[] }) {
  return badges.map((badge) => (
    <span key={badge} className={BADGE_CHIPS[badge]}>
      {badge}
    </span>
  ));
}

function TrainName({ departure: { trainNo, toward } }: { departure: Departure }) {
  return (
    <span className="trn-train-name">
      {trainNo && <Icon name="ticket" className="size-4 shrink-0" />}
      <span className="min-w-0">
        {trainNo && `${trainNo} 車次 `}
        {toward && `往${toward}`}
      </span>
    </span>
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
            <span className="trn-ride-text">{rideLabel(departure)}</span>
          </span>
          <time className="trn-clock">{formatTaipeiHourMinute(new Date(arrivesAt))}</time>
        </>
      )}
    </p>
  );
}

/** 台鐵的時刻表列 */
function TrainRow({ departure, add, badges, fare }: TrainProps) {
  return (
    <li className="trn-result">
      <TrainTimes departure={departure} />
      <div className="trn-result-info">
        {departure.kind && <span className={kindChipClass(departure.kind)}>{departure.kind}</span>}
        <TrainName departure={departure} />
        <TrainBadges badges={badges} />
        {fare !== null && (
          <span className="trn-fare">
            <Icon name="banknote" className="size-4 shrink-0" />
            {fareText(fare)}
          </span>
        )}
      </div>
      {add && (
        <span className="trn-result-add">
          <StarTrain {...add} />
        </span>
      )}
    </li>
  );
}

function TicketStop({ at, name, icon }: { at: number; name: string; icon: "circle-dot" | "map-pin" }) {
  return (
    <span className="trn-ticket-stop">
      <time className="trn-clock">{formatTaipeiHourMinute(new Date(at))}</time>
      <span className="trn-ticket-name">
        <Icon name={icon} className="size-3.5 shrink-0" />
        {name}
      </span>
    </span>
  );
}

/** 高鐵的車票 右邊的票根用虛線撕開 條碼只是裝飾 */
function TrainTicket({ departure, add, badges, from, to }: TrainProps) {
  const { at, arrivesAt } = departure;
  return (
    <li className="trn-ticket">
      <div className="trn-ticket-paper">
        <div className="trn-ticket-main">
          <div className="trn-ticket-head">
            <TrainName departure={departure} />
            <TrainBadges badges={badges} />
          </div>
          <div className="trn-ticket-route">
            <TicketStop at={at} name={from} icon="circle-dot" />
            {arrivesAt && (
              <>
                <span className="trn-ticket-ride">
                  <span aria-hidden="true" className="trn-ticket-arrow" />
                  <span className="trn-ticket-time">
                    <Icon name="timer" className="size-3.5 shrink-0" />
                    {rideLabel(departure)}
                  </span>
                </span>
                <TicketStop at={arrivesAt} name={to} icon="map-pin" />
              </>
            )}
          </div>
        </div>
        <div className="trn-ticket-stub">
          <span aria-hidden="true" className="trn-barcode" />
          {add && <StarTrain {...add} />}
        </div>
      </div>
    </li>
  );
}

// 網址的日期是 YYYY-MM-DD 標題寫月與日就夠
const shortDate = (date: string) => date.slice(5).replace("-", "/");

type TrainResultsProps = { results: Read<Departure[]>; cabins: CabinFare[]; traFares: TraFare[]; query: SearchQuery; stations: Station[]; now: Date; canAdd: boolean; saved: readonly string[] };

/** 高鐵與台鐵共用分組與標籤 只有每一班的樣子不同 */
export function TrainResults({ results, cabins, traFares, query, stations, now, canAdd, saved }: TrainResultsProps) {
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
    return isSaved || canAdd ? { fields: { ...route, line: trainNo }, name: `${trainNo} 車次`, saved: isSaved } : null;
  };
  // 有一班對不上票價時才寫起價 全部對得上時每一列都有價錢
  const startingFare = trains.some(({ fareKey }) => traFareOf(traFares, fareKey) === null) ? lowestTraFare(traFares, trains) : null;
  const listed = (list: Departure[]) => (
    <div className={ticket ? "trn-parts" : "trn-parts trn-board"}>
      {groupByDayPart(list).map((group) => (
        <div key={group.trains[0].at}>
          <h3 className="trn-part-title">{group.part}</h3>
          <ul className={ticket ? "trn-tickets" : "trn-result-list"}>
            {group.trains.map((departure) => (
              <Train key={`${departure.at}-${departure.trainNo}`} departure={departure} add={addOf(departure)} badges={badgesOf(departure)} from={from} to={to} fare={traFareOf(traFares, departure.fareKey)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
  return (
    <section aria-label="查詢結果" className="card p-0 trn-results" style={{ "--trn-line": routeColor(query.mode, "", query.from) } as CSSProperties}>
      <ResultScene mode={ticket ? "thsr" : "tra"} from={from} to={to} query={query}>
        <p className="trn-scene-facts">
          <span>{shortDate(query.date)}</span>
          <span>共 {trains.length} 班</span>
          {startingFare !== null && <span>{fareText(startingFare)}起</span>}
        </p>
        {cabins.length > 0 && (
          <ul aria-label="全票票價" className="trn-scene-facts">
            {cabins.map(({ cabin, price }) => (
              <li key={cabin}>
                {cabin} {fareText(price)}
              </li>
            ))}
          </ul>
        )}
      </ResultScene>
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
