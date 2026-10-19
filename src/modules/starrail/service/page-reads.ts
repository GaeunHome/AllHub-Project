import "server-only";
import type { ActCalendar } from "../lib/calendar";
import type { StarrailCharacter } from "../lib/characters";
import type { Endgame, EndgameMode, EndgameSchedule } from "../lib/endgame";
import { fetchActCalendar, fetchCharacters, fetchDailyNote, fetchEndgame, fetchLedger, fetchProfile } from "../lib/hoyolab";
import type { Ledger } from "../lib/ledger";
import type { DailyNote, Expedition, HoyolabResult } from "../lib/responses";
import type { StarrailAccount } from "../data/schema";
import { pageAccount } from "./accounts";

// 頁面向 HoYoLAB 讀的資料 只讀不寫 cached.ts 包上快取 失效標記由頁面在回應後寫回

/** 讀不到時只在那一塊寫原因 */
export type PageFailure = { ok: false; message: string };

/**
 * fetchedAt 是向 HoYoLAB 查詢的時間 快取最多 5 分鐘 回滿時間要從這裡算
 * 帳號的 cookie 失效標記只看即時便箋 所以只有它回報 cookieInvalid
 */
export type DailyNoteFetch =
  | { ok: true; note: DailyNote; expeditions: Expedition[]; fetchedAt: Date; cookieInvalid: false }
  | (PageFailure & { cookieInvalid: boolean });

export async function dailyNoteFor(userId: string, accountId: number): Promise<DailyNoteFetch> {
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return target;
  const result = await fetchDailyNote(target.cookie, target.account.uid, target.account.region);
  const fetchedAt = new Date();
  if (!result.ok) return { ok: false, message: result.message, cookieInvalid: result.cookieInvalid };
  const { expeditions = [], ...note } = result.data;
  return { ok: true, note, expeditions, fetchedAt, cookieInvalid: false };
}

/** 讀得到時帶查詢的時間 畫面寫幾點更新 */
type Fetched<T> = ({ ok: true; fetchedAt: Date } & T) | PageFailure;

/**
 * 戰績類資料共用的讀法
 * 回應原文可能帶有帳號資料 log 只記 retcode 與缺少的欄位名稱
 */
async function readRecord<T extends { missing: string[] }>(
  userId: string,
  accountId: number,
  what: string,
  request: (cookie: string, account: StarrailAccount) => Promise<HoyolabResult<T>>,
): Promise<Fetched<{ data: T }>> {
  const target = await pageAccount(userId, accountId);
  if (!target.ok) return { ok: false, message: target.message };
  const result = await request(target.cookie, target.account);
  const fetchedAt = new Date();
  if (!result.ok) {
    console.error(`[starrail] 讀取${what}失敗`, accountId, `retcode ${result.retcode}`);
    return { ok: false, message: result.message };
  }
  if (result.data.missing.length > 0) console.error(`[starrail] ${what}的格式和預期不同`, accountId, `缺少或看不懂：${result.data.missing.join("、")}`);
  return { ok: true, data: result.data, fetchedAt };
}

export type CharactersFetch = Fetched<{ characters: StarrailCharacter[] }>;

export async function charactersFor(userId: string, accountId: number): Promise<CharactersFetch> {
  const read = await readRecord(userId, accountId, "角色資料", (cookie, account) => fetchCharacters(cookie, account.uid, account.region));
  return read.ok ? { ok: true, characters: read.data.characters, fetchedAt: read.fetchedAt } : read;
}

export type LedgerFetch = Fetched<{ ledger: Ledger }>;

/** 開拓月曆 month 是 YYYYMM */
export async function ledgerFor(userId: string, accountId: number, month: string): Promise<LedgerFetch> {
  const read = await readRecord(userId, accountId, "開拓月曆", (cookie, account) => fetchLedger(cookie, account.uid, account.region, month));
  return read.ok ? { ok: true, ledger: read.data.ledger, fetchedAt: read.fetchedAt } : read;
}

/** 終局戰績的畫面不寫幾點更新 */
export type EndgameFetch = { ok: true; endgame: Endgame } | PageFailure;

export async function endgameFor(userId: string, accountId: number, mode: EndgameMode, schedule: EndgameSchedule): Promise<EndgameFetch> {
  const read = await readRecord(userId, accountId, "終局戰績", (cookie, account) => fetchEndgame(cookie, account.uid, account.region, mode, schedule));
  return read.ok ? { ok: true, endgame: read.data.endgame } : read;
}

export type ActCalendarFetch = Fetched<{ calendar: ActCalendar }>;

/** 活動日曆 終局挑戰 活動與躍遷 */
export async function actCalendarFor(userId: string, accountId: number): Promise<ActCalendarFetch> {
  const read = await readRecord(userId, accountId, "活動日曆", (cookie, account) => fetchActCalendar(cookie, account.uid, account.region));
  return read.ok ? { ok: true, calendar: read.data.calendar, fetchedAt: read.fetchedAt } : read;
}

/**
 * 戰績首頁的遊戲頭像 只回網址 讀不到或不是自己的帳號回 null
 * 帳號的 cookie 失效標記只看即時便箋與簽到 這裡不回報
 */
export async function profileFor(userId: string, accountId: number): Promise<string | null> {
  const read = await readRecord(userId, accountId, "遊戲頭像", (cookie, account) => fetchProfile(cookie, account.uid, account.region));
  return read.ok ? read.data.avatar : null;
}
