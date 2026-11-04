import { DAY_MS, isRealDateKey } from "@/core/time";
import { clockToMinutes } from "./schedule";
import { isMapsUrl } from "./maps";

export const ITEM_KINDS = ["place", "food", "transport", "stay", "other"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const TRIP_TITLE_MAX = 40;
export const ITEM_TITLE_MAX = 60;
export const NOTE_MAX = 300;
export const COMMENT_MAX = 200;
export const CHECK_MAX = 40;
export const MAX_TRIP_DAYS = 30;
export const MAX_MINUTES = 24 * 60;
export const DEFAULT_STAY_MINUTES = 60;

export const TRIP_LIMIT = 30;
export const MEMBER_LIMIT = 20;
export const ITEM_LIMIT = 300;
export const CHECK_LIMIT = 100;
export const COMMENT_LIMIT = 50;

/** 使用者要的 行程結束 7 天後自動刪除 */
export const RETENTION_DAYS = 7;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const clean = (input: string) => input.normalize("NFC").replace(/\s+/g, " ").trim();
const lengthOf = (text: string) => [...text].length;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function tripDays(startDate: string, endDate: string): string[] {
  return Array.from({ length: dayNumber(endDate) - dayNumber(startDate) + 1 }, (_, i) => addDays(startDate, i));
}

export type TripValues = { title: string; destination: string | null; startDate: string; endDate: string };

export function parseTrip(input: { title: string; destination: string; startDate: string; endDate: string }): Parsed<TripValues> {
  const title = clean(input.title);
  const destination = clean(input.destination);
  if (!title) return fail("請填旅程名稱");
  if (lengthOf(title) > TRIP_TITLE_MAX) return fail(`旅程名稱最多 ${TRIP_TITLE_MAX} 字`);
  if (lengthOf(destination) > TRIP_TITLE_MAX) return fail(`目的地最多 ${TRIP_TITLE_MAX} 字`);
  if (!isRealDateKey(input.startDate) || !isRealDateKey(input.endDate)) return fail("請選出發與回程的日期");
  if (input.endDate < input.startDate) return fail("回程不能早於出發");
  if (tripDays(input.startDate, input.endDate).length > MAX_TRIP_DAYS) return fail(`一趟最多 ${MAX_TRIP_DAYS} 天`);
  return { ok: true, value: { title, destination: destination || null, startDate: input.startDate, endDate: input.endDate } };
}

export type ItemValues = { kind: ItemKind; title: string; mapsUrl: string | null; note: string | null; stayMinutes: number; travelMinutes: number; fixedTime: string | null };

const isKind = (value: string): value is ItemKind => (ITEM_KINDS as readonly string[]).includes(value);

function minutesOf(value: string): number | null {
  const minutes = Number(value || 0);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_MINUTES ? minutes : null;
}

export function parseItem(input: { kind: string; title: string; mapsUrl: string; note: string; stayMinutes: string; travelMinutes: string; fixedTime: string }): Parsed<ItemValues> {
  const title = clean(input.title);
  const note = input.note.normalize("NFC").trim();
  const mapsUrl = input.mapsUrl.trim();
  const stayMinutes = minutesOf(input.stayMinutes);
  const travelMinutes = minutesOf(input.travelMinutes);
  if (!isKind(input.kind)) return fail("請選種類");
  if (!title) return fail("請填名稱");
  if (lengthOf(title) > ITEM_TITLE_MAX) return fail(`名稱最多 ${ITEM_TITLE_MAX} 字`);
  if (lengthOf(note) > NOTE_MAX) return fail(`備註最多 ${NOTE_MAX} 字`);
  if (mapsUrl && !isMapsUrl(mapsUrl)) return fail("請貼 Google Maps 的連結");
  if (stayMinutes === null || travelMinutes === null) return fail("時間請填 0 到 1440 分鐘");
  if (input.fixedTime && clockToMinutes(input.fixedTime) === null) return fail("固定時間的格式不對");
  return { ok: true, value: { kind: input.kind, title, mapsUrl: mapsUrl || null, note: note || null, stayMinutes, travelMinutes, fixedTime: input.fixedTime || null } };
}

export function parseShortText(input: string, label: string, max: number): Parsed<string> {
  const text = clean(input);
  if (!text) return fail(`請填${label}`);
  if (lengthOf(text) > max) return fail(`${label}最多 ${max} 字`);
  return { ok: true, value: text };
}

/** 回程那天過後第幾天刪 回程日加保留天數 當天還在 */
export const deleteDateOf = (endDate: string) => addDays(endDate, RETENTION_DAYS);
