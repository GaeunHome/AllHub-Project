import { dateKeyOf } from "@/core/time";
import { scheduleDay, type ScheduledItem } from "../lib/schedule";
import type { TripItem } from "../service/trips";
import { itemsOfDay } from "./board-model";

// 當天模式 伺服器只有台北時間 人在日本會差一小時 現在幾點一律用手機自己的時鐘

export type StopState = "done" | "here" | "next" | "later";
export type TodayStop = { item: TripItem; slot: ScheduledItem; state: StopState };
export type TodayView = { stops: TodayStop[]; here: TodayStop | null; next: TodayStop | null };

export function deviceClock(now: Date): { date: string; minutes: number } {
  return { date: dateKeyOf(now.getFullYear(), now.getMonth() + 1, now.getDate()), minutes: now.getHours() * 60 + now.getMinutes() };
}

export function todayView(items: readonly TripItem[], date: string, minutes: number): TodayView {
  const list = itemsOfDay(items, date);
  const schedule = scheduleDay(list);
  let nextFound = false;
  const stops = list.map((item, index): TodayStop => {
    const slot = schedule[index];
    if (slot.leave <= minutes) return { item, slot, state: "done" };
    if (slot.arrive <= minutes) return { item, slot, state: "here" };
    const state = nextFound ? "later" : "next";
    nextFound = true;
    return { item, slot, state };
  });
  return { stops, here: stops.find((stop) => stop.state === "here") ?? null, next: stops.find((stop) => stop.state === "next") ?? null };
}
