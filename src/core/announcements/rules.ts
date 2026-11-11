import type { AnnouncementKind } from "../db/schema";
import { fail, ok, type Parsed } from "../parsed";
import { charLength } from "../text";
import { DAY_MS, formatTaipeiHourMinute, formatTaipeiMonthDay, isRealDateKey, taipeiDateKey } from "../time";

// 公告的規則 瀏覽器的表單也用 不碰資料庫

export const ANNOUNCEMENT_KIND_LABELS: Record<AnnouncementKind, string> = { outage: "停止服務", maintenance: "不停機維護", general: "一般公告" };
export const ANNOUNCEMENT_TITLE_MAX = 60;
export const ANNOUNCEMENT_BODY_MAX = 2000;

export type AnnouncementFields = Record<"kind" | "title" | "body" | "startsAt" | "endsAt" | "pinned", string>;
export type AnnouncementInput = { kind: AnnouncementKind; title: string; body: string; startsAt: Date | null; endsAt: Date | null; pinned: boolean };
/** 表單的日期時間沒有時區 一律當台北時間 */
function parseTaipeiTime(raw: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d$/.exec(raw);
  return match && isRealDateKey(match[1]) ? new Date(`${raw}:00+08:00`) : null;
}

export function parseAnnouncement(fields: AnnouncementFields): Parsed<AnnouncementInput> {
  if (!Object.hasOwn(ANNOUNCEMENT_KIND_LABELS, fields.kind)) return fail("請選擇公告的種類");
  const title = fields.title.trim();
  if (title === "") return fail("請填標題");
  if (charLength(title) > ANNOUNCEMENT_TITLE_MAX) return fail(`標題最多 ${ANNOUNCEMENT_TITLE_MAX} 字`);
  const body = fields.body.trim();
  if (charLength(body) > ANNOUNCEMENT_BODY_MAX) return fail(`內文最多 ${ANNOUNCEMENT_BODY_MAX} 字`);
  const startsAt = fields.startsAt === "" ? null : parseTaipeiTime(fields.startsAt);
  if (startsAt === null && fields.startsAt !== "") return fail("開始時間不正確");
  const endsAt = fields.endsAt === "" ? null : parseTaipeiTime(fields.endsAt);
  if (endsAt === null && fields.endsAt !== "") return fail("結束時間不正確");
  if (startsAt && endsAt && endsAt <= startsAt) return fail("結束時間要晚於開始時間");
  return ok({ kind: fields.kind as AnnouncementKind, title, body, startsAt, endsAt, pinned: fields.pinned === "true" });
}

/** 快取裡是全部的公告 過期與否要用這次請求的時間算 */
export const isAnnouncementShown = ({ endsAt }: { endsAt: Date | null }, now: Date): boolean => endsAt === null || endsAt > now;

/** 停止服務與維護開始前幾天就放到跑馬燈 */
const TICKER_LEAD_MS = 3 * DAY_MS;

/**
 * 使用者要的 停止服務與維護開始前 3 天到結束 站長置頂的到結束
 * 沒寫開始時間的當成已經開始
 */
export function inTicker(row: { kind: AnnouncementKind; pinned: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (!isAnnouncementShown(row, now)) return false;
  if (row.pinned) return true;
  return row.kind !== "general" && (row.startsAt === null || row.startsAt.getTime() - now.getTime() <= TICKER_LEAD_MS);
}

const KIND_ORDER: Record<AnnouncementKind, number> = { outage: 0, maintenance: 1, general: 2 };

/** 停止服務最影響使用 排最前面 同一種維持原本的順序 */
export const importantFirst = <Row extends { kind: AnnouncementKind }>(rows: readonly Row[]): Row[] => rows.toSorted((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

const dayAndTime = (date: Date) => `${formatTaipeiMonthDay(date)} ${formatTaipeiHourMinute(date)}`;

/** 列上的時間 同一天的開始與結束只寫一次日期 */
export function announcementWhen({ startsAt, endsAt, createdAt }: { startsAt: Date | null; endsAt: Date | null; createdAt: Date }): string {
  if (startsAt && endsAt) {
    const sameDay = taipeiDateKey(startsAt) === taipeiDateKey(endsAt);
    return `${dayAndTime(startsAt)}–${sameDay ? formatTaipeiHourMinute(endsAt) : dayAndTime(endsAt)}`;
  }
  if (startsAt) return `${dayAndTime(startsAt)} 起`;
  if (endsAt) return `到 ${dayAndTime(endsAt)}`;
  return `${formatTaipeiMonthDay(createdAt)} 發布`;
}

/** 一則一頁 使用者要的 首頁的公告點進去是一個頁面 */
export const announcementHref = (id: number): string => `/announcements/${id}`;

/** datetime-local 欄位的值 */
export const dateTimeInputValue = (date: Date): string => `${taipeiDateKey(date)}T${formatTaipeiHourMinute(date)}`;
