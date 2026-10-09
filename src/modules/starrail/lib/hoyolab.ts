import "server-only";
import { randomUUID } from "node:crypto";
import { logError } from "@/core/errors";
import { externalFetch } from "@/core/external-url";
import { interpretCharacters, type CharacterList } from "./characters";
import { generateDs } from "./ds";
import { ENDGAME_ENDPOINTS, interpretEndgame, type EndgameMode, type EndgameResult, type EndgameSchedule } from "./endgame";
import { interpretLedger, type LedgerResult } from "./ledger";
import { interpretRedeem, type RedeemOutcome } from "./redeem";
import {
  interpretResponse,
  interpretSign,
  parseCheckinInfo,
  parseDailyNote,
  parseExpeditions,
  parseGameRoles,
  type CheckinInfo,
  type CheckinOutcome,
  type DailyNote,
  type Expedition,
  type GameRole,
  type HoyolabResult,
} from "./responses";

// HoYoLAB 國際服的非官方介面（依 genshin.py 整理、尚未用真實帳號驗證），改版就可能失效，呼叫端都要能處理失敗

const ROLES_URL = "https://api-account-os.hoyolab.com/account/binding/api/getUserGameRolesByCookie?game_biz=hkrpg_global";
const NOTE_URL = "https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/note";
const RECORD_BASE = "https://bbs-api-os.hoyolab.com/game_record/hkrpg/api";
const CHARACTERS_URL = `${RECORD_BASE}/avatar/info`;
const LEDGER_URL = "https://sg-public-api.hoyolab.com/event/srledger/month_info";
const REDEEM_URL = "https://public-operation-hkrpg.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk";
const GIFT_PAGE = "https://hsr.hoyoverse.com";
const CHECKIN_BASE = "https://sg-public-api.hoyolab.com/event/luna/os";
const CHECKIN_ACT_ID = "e202303301540311";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function headers(cookie: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Cookie: cookie,
    "User-Agent": USER_AGENT,
    Origin: "https://act.hoyolab.com",
    Referer: "https://act.hoyolab.com/",
    "x-rpc-app_version": "1.5.0",
    "x-rpc-client_type": "5",
    "x-rpc-language": "zh-tw",
    ...extra,
  };
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  let text: string;
  try {
    response = await externalFetch(url, { ...init, cache: "no-store" });
    text = await response.text();
  } catch (error) {
    // 錯誤訊息可能含 header 原文（cookie），只記錯誤種類
    logError("starrail", "呼叫 HoYoLAB 失敗", error, new URL(url).pathname);
    return { localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { retcode: null, message: `HTTP ${response.status}`, body: text.slice(0, 300) };
  }
}

function mapResult<T>(json: unknown, parse: (data: unknown) => T): HoyolabResult<T> {
  const result = interpretResponse(json);
  return result.ok ? { ok: true, data: parse(result.data), raw: json } : result;
}

export async function fetchGameRoles(cookie: string): Promise<HoyolabResult<GameRole[]>> {
  return mapResult(await call(ROLES_URL, { headers: headers(cookie) }), parseGameRoles);
}

/** 便箋的數字給排程判斷開拓力；委託（角色圖、剩餘時間）只有頁面用 */
export type NoteWithExpeditions = DailyNote & { expeditions: Expedition[] };

export async function fetchDailyNote(cookie: string, uid: string, region: string): Promise<HoyolabResult<NoteWithExpeditions>> {
  const url = `${NOTE_URL}?server=${encodeURIComponent(region)}&role_id=${encodeURIComponent(uid)}`;
  return mapResult(await call(url, { headers: headers(cookie, { ds: generateDs() }) }), (data) => ({ ...parseDailyNote(data), expeditions: parseExpeditions(data) }));
}

/** 角色詳情（光錐、遺器、面板、星魂、行跡）；need_wiki 跟 genshin.py 一樣帶上 */
export async function fetchCharacters(cookie: string, uid: string, region: string): Promise<HoyolabResult<CharacterList>> {
  const url = `${CHARACTERS_URL}?need_wiki=true&role_id=${encodeURIComponent(uid)}&server=${encodeURIComponent(region)}`;
  return interpretCharacters(await call(url, { headers: headers(cookie, { ds: generateDs() }) }));
}

/** 開拓月曆：month 是 YYYYMM；genshin.py 的 ledger 請求不帶 DS */
export async function fetchLedger(cookie: string, uid: string, region: string, month: string): Promise<HoyolabResult<LedgerResult>> {
  const query = new URLSearchParams({ uid, region, month, lang: "zh-tw" });
  return interpretLedger(await call(`${LEDGER_URL}?${query}`, { headers: headers(cookie) }), month);
}

/** 終局戰績：混沌回憶、虛構敘事、末日幻影；schedule_type 1 是本期、2 是上期 */
export async function fetchEndgame(cookie: string, uid: string, region: string, mode: EndgameMode, schedule: EndgameSchedule): Promise<HoyolabResult<EndgameResult>> {
  const query = new URLSearchParams({ schedule_type: schedule === "current" ? "1" : "2", need_all: "true", role_id: uid, server: region });
  return interpretEndgame(await call(`${RECORD_BASE}/${ENDGAME_ENDPOINTS[mode]}?${query}`, { headers: headers(cookie, { ds: generateDs() }) }), mode);
}

/** 兌換碼：照 genshin.py 用 POST JSON，Origin 是官方兌換頁；code 已經整理過（大寫英數字） */
export async function redeemCode(cookie: string, uid: string, region: string, code: string): Promise<RedeemOutcome> {
  const body = { cdkey: code, device_uuid: randomUUID(), game_biz: "hkrpg_global", lang: "zh-tw", platform: "4", region, t: Math.floor(Date.now() / 1000), uid };
  const json = await call(REDEEM_URL, {
    method: "POST",
    headers: headers(cookie, { Origin: GIFT_PAGE, Referer: `${GIFT_PAGE}/`, "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return interpretRedeem(json);
}

const checkinHeaders = (cookie: string) => headers(cookie, { "x-rpc-signgame": "hkrpg" });

export async function fetchCheckinInfo(cookie: string): Promise<HoyolabResult<CheckinInfo>> {
  const url = `${CHECKIN_BASE}/info?lang=zh-tw&act_id=${CHECKIN_ACT_ID}`;
  return mapResult(await call(url, { headers: checkinHeaders(cookie) }), parseCheckinInfo);
}

export async function signIn(cookie: string): Promise<CheckinOutcome & { raw: unknown }> {
  const json = await call(`${CHECKIN_BASE}/sign`, {
    method: "POST",
    headers: { ...checkinHeaders(cookie), "Content-Type": "application/json" },
    body: JSON.stringify({ act_id: CHECKIN_ACT_ID, lang: "zh-tw" }),
  });
  return { ...interpretSign(json), raw: json };
}
