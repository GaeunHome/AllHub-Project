import "server-only";
import { logError } from "@/core/errors";
import { externalFetch } from "@/core/external-url";
import { generateDs } from "./ds";
import {
  interpretResponse,
  interpretSign,
  parseCheckinInfo,
  parseDailyNote,
  parseGameRoles,
  type CheckinInfo,
  type CheckinOutcome,
  type DailyNote,
  type GameRole,
  type HoyolabResult,
} from "./responses";

// HoYoLAB 國際服的非官方介面（依 genshin.py 整理、尚未用真實帳號驗證），改版就可能失效，呼叫端都要能處理失敗

const ROLES_URL = "https://api-account-os.hoyolab.com/account/binding/api/getUserGameRolesByCookie?game_biz=hkrpg_global";
const NOTE_URL = "https://bbs-api-os.hoyolab.com/game_record/hkrpg/api/note";
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

export async function fetchDailyNote(cookie: string, uid: string, region: string): Promise<HoyolabResult<DailyNote>> {
  const url = `${NOTE_URL}?server=${encodeURIComponent(region)}&role_id=${encodeURIComponent(uid)}`;
  return mapResult(await call(url, { headers: headers(cookie, { ds: generateDs() }) }), parseDailyNote);
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
