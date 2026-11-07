"use client";

import type { CSSProperties, ReactNode } from "react";
import { formatTaipeiHourMinute } from "@/core/time";
import { Icon } from "@/core/ui/icon";
import { useClockStep } from "@/core/ui/live-clock";
import { TICK_MS, countdownText, countdownUnits, upcoming } from "../../lib/countdown";
import { plateInk } from "../../lib/lines";
import type { Departure, Station } from "../../lib/timetable";
import { legSchedule, type LegTimes } from "../../lib/travel-time";
import { fareText } from "../transit-view";

/** 下一班之後再列幾班 */
const LATER_SHOWN = 2;

export type BoardLeg = { line: string; color: string; from: Station; to: Station; towardName: string; stops: number; seconds: number | null };
/** board 是文湖線這種沒有站別時刻表的 只能看月台的看板 */
export type BoardState = "ok" | "failed" | "board";

const lineStyle = (color: string) => ({ "--trn-line": color, "--trn-plate-ink": plateInk(color) }) as CSSProperties;
const clock = (at: number) => formatTaipeiHourMinute(new Date(at));

/** 站牌的代碼用路線色 字色由 --trn-plate-ink 帶進來 */
function StationPlate({ station }: { station: Station }) {
  return (
    <span className="trn-plate">
      <span className="trn-plate-code">{station.id}</span>
      {station.name}
    </span>
  );
}

function BigCount({ ms }: { ms: number }) {
  const units = countdownUnits(ms);
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

/** 有時刻表卻沒有下一班 是今天的車都開走了 */
const EMPTY_TEXT: Record<BoardState, string> = { ok: "今天沒有班次了", board: "到站看看板", failed: "時刻表暫時無法讀取" };

type NextProps = { next: Departure | undefined; later: Departure[]; now: number; empty: string; arrives: number | null; destination: string };

/** 使用者要的 最大的字是下一班還有幾分幾秒 旁邊小一點是後兩班 中途折返的車寫出開往哪裡 */
function NextTrain({ next, later, now, empty, arrives, destination }: NextProps) {
  if (!next) return <p className="trn-next-empty">{empty}</p>;
  return (
    <>
      <p className="trn-next-head">
        下一班
        {next.toward && <span className="trn-toward">{`往${next.toward}`}</span>}
      </p>
      <BigCount ms={next.at - now} />
      <p className="trn-next-clock">
        <span>
          <b>{clock(next.at)}</b> 開
        </span>
        {arrives !== null && (
          <span>
            約 <b>{clock(arrives)}</b> {`到${destination}`}
          </span>
        )}
      </p>
      {later.length > 0 && (
        <div className="trn-next-later">
          <span className="font-semibold">之後</span>
          <ul aria-label="之後的班次" className="flex flex-wrap gap-2">
            {later.map((departure) => (
              <li key={departure.at} className="trn-pill">
                {countdownText(departure.at - now)}
                {departure.toward !== next.toward && departure.toward && <span>{`往${departure.toward}`}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** 時間是照下一班推的 推不出來時只留轉乘兩個字 */
function RouteStop({ station, color, verb, at }: { station: Station; color: string; verb: "開" | "轉乘" | "到"; at: number | null }) {
  return (
    <li className="trn-route-stop" style={lineStyle(color)}>
      <StationPlate station={station} />
      {(at !== null || verb === "轉乘") && (
        <span className="trn-route-time">
          {at !== null && <b>{verb === "開" ? clock(at) : `約 ${clock(at)}`}</b>}
          {verb}
        </span>
      )}
    </li>
  );
}

function RouteRide({ leg }: { leg: BoardLeg }) {
  return (
    <li className="trn-route-ride" style={lineStyle(leg.color)}>
      <span className="font-semibold">{leg.line}</span>
      <span>{`往${leg.towardName}`}</span>
      <span className="tabular-nums">
        {leg.stops} 站{leg.seconds !== null && ` 約 ${Math.max(1, Math.round(leg.seconds / 60))} 分`}
      </span>
    </li>
  );
}

/** 每一段一條路線色的直線 站名牌接著站名牌 轉乘站的時間是上一段到站的時間 */
function RouteTimeline({ legs, times }: { legs: BoardLeg[]; times: LegTimes[] }) {
  const last = legs.at(-1)!;
  return (
    <ol aria-label="怎麼搭" className="trn-route">
      {legs.flatMap((leg, index) => [
        <RouteStop key={`stop-${leg.from.id}`} station={leg.from} color={leg.color} verb={index === 0 ? "開" : "轉乘"} at={index === 0 ? (times[0]?.departs ?? null) : (times[index - 1]?.arrives ?? null)} />,
        <RouteRide key={`ride-${leg.from.id}`} leg={leg} />,
      ])}
      <RouteStop station={last.to} color={last.color} verb="到" at={times.at(-1)?.arrives ?? null} />
    </ol>
  );
}

type MetroBoardProps = { legs: BoardLeg[]; departures: Departure[]; state: BoardState; now: number; minutes: number | null; fare: number | null; action: ReactNode };

/** 秒數跟常用路線一樣 5 秒更新一次 只用時刻表算 不多問 TDX 伺服器先用自己的時間畫好 */
export function MetroBoard({ legs, departures, state, now, minutes, fare, action }: MetroBoardProps) {
  const tick = useClockStep(TICK_MS) ?? now;
  const [next, ...rest] = state === "ok" ? upcoming(departures, tick) : [];
  const times = next ? legSchedule(next.at, legs.map((leg) => leg.seconds)) : [];
  const transfers = legs.length - 1;
  return (
    <div className="trn-metro" style={lineStyle(legs[0].color)}>
      <section aria-label="下一班" className="trn-next">
        <NextTrain next={next} later={rest.slice(0, LATER_SHOWN)} now={tick} empty={EMPTY_TEXT[state]} arrives={times.at(-1)?.arrives ?? null} destination={legs.at(-1)!.to.name} />
        <ul aria-label="這趟路" className="trn-facts">
          {minutes !== null && (
            <li>
              <Icon name="timer" className="size-5 shrink-0" />約 {minutes} 分鐘
            </li>
          )}
          {fare !== null && (
            <li>
              <Icon name="banknote" className="size-5 shrink-0" />票價 {fareText(fare)}
            </li>
          )}
          <li>
            <Icon name="repeat" className="size-5 shrink-0" />
            {transfers === 0 ? "不用轉乘" : `轉乘 ${transfers} 次`}
          </li>
        </ul>
        {action && <div className="trn-next-action">{action}</div>}
      </section>
      <RouteTimeline legs={legs} times={times} />
    </div>
  );
}
