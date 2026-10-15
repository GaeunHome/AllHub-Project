"use client";

import { useSyncExternalStore } from "react";
import { formatTaipeiHourMinuteSecond } from "../time";
import { Icon } from "./icon";

const SECOND_MS = 1000;

const listeners = new Set<() => void>();
// 只在計時器裡更新 getSnapshot 讀到存好的數字 同一次算繪裡才不會變
let second: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  const now = Date.now();
  // 每次排到下一個整秒 不用 setInterval 計時器晚到時誤差才不會累積
  timer = setTimeout(tick, SECOND_MS - (now % SECOND_MS));
  const next = now - (now % SECOND_MS);
  if (next === second) return;
  second = next;
  for (const listener of listeners) listener();
}

// 背景分頁的計時器會被節流 回到前景時立刻對一次 不等下一次計時器
function resyncWhenVisible() {
  if (document.visibilityState !== "visible") return;
  clearTimeout(timer);
  tick();
}

/** 所有時鐘共用一個計時器 第一個掛上時開始 最後一個離開時停掉 */
export function subscribeSecond(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", resyncWhenVisible);
    tick();
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    clearTimeout(timer);
    timer = undefined;
    document.removeEventListener("visibilitychange", resyncWhenVisible);
    second = null;
  };
}

/** 現在這一秒的毫秒時間戳 時鐘沒在走時是 null */
export function currentSecond(): number | null {
  return second;
}

// 預先算繪的 HTML 之後隨時可能被拿去用 伺服器一律只放預留的位置
const serverSecond = () => null;

const CLOCK_CLASS = "inline-flex items-center gap-1.5 self-stretch text-[0.8125rem] font-medium whitespace-nowrap text-ink-soft tabular-nums sm:text-sm";

/** 導覽列右上角的台北時間 每秒更新 */
export function LiveClock() {
  const now = useSyncExternalStore(subscribeSecond, currentSecond, serverSecond);
  // 平板上把圖示的寬度留給模組名稱
  const icon = <Icon name="clock" className="hidden size-4 lg:inline-block" />;

  // 還沒開始走時放看不見的 00:00:00 數字等寬 換上時間時旁邊才不會跳
  if (now === null) {
    return (
      <span aria-hidden className={`invisible ${CLOCK_CLASS}`}>
        {icon}00:00:00
      </span>
    );
  }

  const date = new Date(now);
  return (
    // 不是 live region 報讀器才不會每秒念一次 移到這裡時才念
    <time dateTime={date.toISOString()} title="台北時間" className={CLOCK_CLASS}>
      {icon}
      <span className="sr-only">台北時間 </span>
      {formatTaipeiHourMinuteSecond(date)}
    </time>
  );
}
