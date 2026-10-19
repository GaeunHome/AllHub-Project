// 活動日曆依 genshin.py 的 HSREventCalendar 整理 還沒用真實帳號驗證
// 讀不到的欄位給 null 並記下路徑 時間是 Unix 秒數的字串 0 代表沒有排定

import { asRecord, createMissing, numberOf, text } from "@/core/json";
import { image } from "./image";
import { interpretWith, type HoyolabResult } from "./responses";

/** 混沌回憶 虛構敘事 末日幻影 異相仲裁 跟終局戰績的名稱一樣 */
type ChallengeKind = "chaos" | "fiction" | "shadow" | "peak";

const CHALLENGE_KINDS: Record<string, ChallengeKind> = {
  ChallengeTypeChasm: "chaos",
  ChallengeTypeStory: "fiction",
  ChallengeTypeBoss: "shadow",
  ChallengeTypePeak: "peak",
};
const CHALLENGE_LABELS: Record<ChallengeKind, string> = { chaos: "混沌回憶", fiction: "虛構敘事", shadow: "末日幻影", peak: "異相仲裁" };

/** 開始與結束是毫秒 沒有排定的是 null */
export type Timed = { startsAt: number | null; endsAt: number | null };

/** unopened 是還沒開放 finished 是這一期已經拿滿 */
export type CalendarChallenge = Timed & {
  id: number | null;
  kind: ChallengeKind | null;
  name: string | null;
  status: "unopened" | "ongoing" | "finished" | null;
  current: number | null;
  total: number | null;
};

/** double 是雙倍獎勵 例如花藏繁生 sign 是登入簽到 */
export type CalendarEvent = Timed & {
  id: number | null;
  kind: "double" | "sign" | "other";
  name: string | null;
  current: number | null;
  total: number | null;
};

export type WarpItem = { id: string | null; name: string | null; icon: string | null; rarity: number | null };

export type CalendarWarp = Timed & { id: string | null; kind: "character" | "lightCone"; name: string | null; items: WarpItem[] };

export type ActCalendar = { version: string | null; challenges: CalendarChallenge[]; events: CalendarEvent[]; warps: CalendarWarp[] };

export type ActCalendarResult = { calendar: ActCalendar; missing: string[] };

export function interpretActCalendar(json: unknown): HoyolabResult<ActCalendarResult> {
  return interpretWith(json, parseActCalendar);
}

/** 終局戰績的三種模式也用這個名稱 */
export function challengeLabel(kind: ChallengeKind): string;
export function challengeLabel(kind: ChallengeKind | null): string | null;
export function challengeLabel(kind: ChallengeKind | null): string | null {
  return kind ? CHALLENGE_LABELS[kind] : null;
}

/** Unix 秒數換成毫秒 0 或看不懂的是 null */
function timestamp(value: unknown): number | null {
  const seconds = numberOf(value);
  return seconds !== null && Number.isInteger(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** id 有時是數字有時是字串 一律轉成字串 */
function idText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function challengeStatus(value: unknown): CalendarChallenge["status"] {
  const status = text(value);
  if (status === "challengeStatusUnopened") return "unopened";
  if (status === "challengeStatusInProgress") return "ongoing";
  if (status === "challengeStatusFinish") return "finished";
  return null;
}

function eventKind(value: unknown): CalendarEvent["kind"] {
  const type = text(value);
  if (type === "ActivityTypeDouble") return "double";
  if (type === "ActivityTypeSign") return "sign";
  return "other";
}

export function parseActCalendar(data: unknown): ActCalendarResult {
  const missing = createMissing();
  const root = asRecord(data);

  // 常駐活動沒有排定 start_ts 與 end_ts 都是 0
  // 這不算格式不同 只有整個 time_info 不見才記下
  const timed = (item: Record<string, unknown>, at: string): Timed => {
    const time = asRecord(item.time_info);
    if (!time) missing.add(`${at}.time_info`);
    return { startsAt: timestamp(time?.start_ts), endsAt: timestamp(time?.end_ts) };
  };

  const challenges = missing.list(root, "challenge_list", "challenge_list").flatMap((value): CalendarChallenge[] => {
    const item = asRecord(value);
    if (!item) return [];
    const at = (key: string) => `challenge_list[].${key}`;
    const type = text(item.challenge_type);
    if (type === null) missing.add(at("challenge_type"));
    return [
      {
        ...timed(item, "challenge_list[]"),
        id: numberOf(item.group_id),
        kind: type === null ? null : (CHALLENGE_KINDS[type] ?? null),
        name: missing.need(text(item.name_mi18n), at("name_mi18n")),
        status: missing.need(challengeStatus(item.status), at("status")),
        current: missing.need(numberOf(item.current_progress), at("current_progress")),
        total: missing.need(numberOf(item.total_progress), at("total_progress")),
      },
    ];
  });

  const events = missing.list(root, "act_list", "act_list").flatMap((value): CalendarEvent[] => {
    const item = asRecord(value);
    if (!item) return [];
    return [
      {
        ...timed(item, "act_list[]"),
        id: numberOf(item.id),
        kind: eventKind(item.act_type),
        name: missing.need(text(item.name)?.replace(/\\n/g, " ") ?? null, "act_list[].name"),
        current: numberOf(item.current_progress),
        total: numberOf(item.total_progress),
      },
    ];
  });

  const warps = (key: "avatar_card_pool_list" | "equip_card_pool_list", kind: CalendarWarp["kind"]) =>
    missing.list(root, key, key).flatMap((value): CalendarWarp[] => {
      const pool = asRecord(value);
      if (!pool) return [];
      // 角色的頭像在 icon_url 光錐的圖在 item_url
      const listKey = kind === "character" ? "avatar_list" : "equip_list";
      const iconKey = kind === "character" ? "icon_url" : "item_url";
      const at = (field: string) => `${key}[].${listKey}[].${field}`;
      const items = missing.list(pool, listKey, `${key}[].${listKey}`).flatMap((entry): WarpItem[] => {
        const item = asRecord(entry);
        if (!item) return [];
        return [
          {
            id: idText(item.item_id),
            name: missing.need(text(item.item_name), at("item_name")),
            icon: missing.need(image(item[iconKey]), at(iconKey)),
            rarity: missing.need(numberOf(item.rarity), at("rarity")),
          },
        ];
      });
      return [{ ...timed(pool, `${key}[]`), id: idText(pool.id), kind, name: text(pool.name), items }];
    });

  return {
    calendar: {
      version: missing.need(text(root?.cur_game_version), "cur_game_version"),
      challenges,
      events,
      warps: [...warps("avatar_card_pool_list", "character"), ...warps("equip_card_pool_list", "lightCone")],
    },
    missing: missing.sorted(),
  };
}

/** 已經開始還沒結束 沒有結束時間的常駐活動不算 */
export function isOngoing(item: Timed, now: Date): boolean {
  const at = now.getTime();
  return item.endsAt !== null && item.endsAt > at && (item.startsAt === null || item.startsAt <= at);
}

function byEndTime(a: Timed, b: Timed): number {
  return (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity);
}

/** 正在進行的 依結束時間排好 畫面與提醒共用 */
export function ongoingCalendar(calendar: ActCalendar, now: Date): Omit<ActCalendar, "version"> {
  const pick = <T extends Timed>(items: T[]) => items.filter((item) => isOngoing(item, now)).sort(byEndTime);
  return { challenges: pick(calendar.challenges), events: pick(calendar.events), warps: pick(calendar.warps) };
}

/** 進度拿滿了沒 總數讀不到或是 0 時判斷不了 回 null */
export function progressFull(item: { current: number | null; total: number | null }): boolean | null {
  if (item.current === null || item.total === null || item.total <= 0) return null;
  return item.current >= item.total;
}
