import "server-only";
import { randomUUID } from "node:crypto";
import { logError } from "@/core/errors";
import { externalFetch } from "@/core/external-url";
import { interpretActCalendar, type ActCalendarResult } from "./calendar";
import { interpretCharacters, type CharacterList } from "./characters";
import { cookieKeys, withAccountIds } from "./cookie";
import { generateDs } from "./ds";
import { ENDGAME_ENDPOINTS, interpretEndgame, type EndgameMode, type EndgameResult, type EndgameSchedule } from "./endgame";
import { explainLedgerLogin, interpretLedger, type LedgerResult } from "./ledger";
import { interpretRedeem, type RedeemOutcome } from "./redeem";
import {
  interpretSign,
  interpretWith,
  parseCheckinInfo,
  parseDailyNote,
  parseExpeditions,
  parseGameRoles,
  parseProfile,
  type CheckinInfo,
  type CheckinOutcome,
  type DailyNote,
  type Expedition,
  type GameRole,
  type HoyolabResult,
  type Profile,
} from "./responses";
import { CHECKIN_ACT_ID } from "./urls";
import { WARP_PAGE_SIZE, interpretWarpPage, parseAuthkey, type WarpKey, type WarpPage } from "./warps";

// HoYoLAB 國際服的非官方介面 還沒用真實帳號驗證
// 改版就可能失效 呼叫端都要能處理失敗

const ROLES_URL = "https://api-account-os.hoyolab.com/account/binding/api/getUserGameRolesByCookie?game_biz=hkrpg_global";
const RECORD_BASE = "https://bbs-api-os.hoyolab.com/game_record/hkrpg/api";
const LEDGER_URL = "https://sg-public-api.hoyolab.com/event/srledger/month_info";
const REDEEM_URL = "https://public-operation-hkrpg.hoyoverse.com/common/apicdkey/api/webExchangeCdkeyRisk";
const GIFT_PAGE = "https://hsr.hoyoverse.com";
const CHECKIN_BASE = "https://sg-public-api.hoyolab.com/event/luna/os";
const AUTHKEY_URL = "https://api-account-os.hoyoverse.com/binding/api/genAuthKeyByCookieToken";
const WARP_BASE = "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api";
const GAME_BIZ = "hkrpg_global";
/** 聯動卡池走另一個端點 */
const COLLAB_BANNERS: readonly number[] = [21, 22];
const WARP_AUTH_APPID = "webview_gacha";

/** 自動兌換的排程要在 60 秒內跑完 兌換的請求最多等 10 秒 */
const REDEEM_TIMEOUT_MS = 10_000;

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

async function call(url: string, init: RequestInit, timeoutMs?: number): Promise<unknown> {
  let response: Response;
  let text: string;
  try {
    response = await externalFetch(url, { ...init, cache: "no-store" }, { timeoutMs });
    text = await response.text();
  } catch (error) {
    // 錯誤訊息可能帶著 header 裡的 cookie 只記錯誤種類
    logError("starrail", "呼叫 HoYoLAB 失敗", error, new URL(url).pathname);
    return { localError: "連不上 HoYoLAB（逾時或網路錯誤），請稍後再試" };
  }
  try {
    return JSON.parse(text);
  } catch {
    // 被擋或維護時回的是網頁 內容可能帶有帳號資料 只記狀態碼 畫面照樣說格式不同
    console.error("[starrail] HoYoLAB 的回應不是 JSON", new URL(url).pathname, `HTTP ${response.status}`);
    return null;
  }
}

/** 戰績類的介面都是 GET 而且帶 DS */
function recordGet(cookie: string, path: string, query: Record<string, string>): Promise<unknown> {
  return call(`${RECORD_BASE}/${path}?${new URLSearchParams(query)}`, { headers: headers(cookie, { ds: generateDs() }) });
}

export async function fetchGameRoles(cookie: string): Promise<HoyolabResult<GameRole[]>> {
  return interpretWith(await call(ROLES_URL, { headers: headers(cookie) }), parseGameRoles);
}

/** 便箋的數字給排程判斷開拓力 委託只有頁面用 */
type NoteWithExpeditions = DailyNote & { expeditions: Expedition[] };

export async function fetchDailyNote(cookie: string, uid: string, region: string): Promise<HoyolabResult<NoteWithExpeditions>> {
  const json = await recordGet(cookie, "note", { server: region, role_id: uid });
  return interpretWith(json, (data) => ({ ...parseDailyNote(data), expeditions: parseExpeditions(data) }));
}

/** 角色詳情 need_wiki 跟 genshin.py 一樣帶上 */
export async function fetchCharacters(cookie: string, uid: string, region: string): Promise<HoyolabResult<CharacterList>> {
  return interpretCharacters(await recordGet(cookie, "avatar/info", { need_wiki: "true", role_id: uid, server: region }));
}

/** 戰績首頁 只取遊戲頭像 */
export async function fetchProfile(cookie: string, uid: string, region: string): Promise<HoyolabResult<Profile>> {
  return interpretWith(await recordGet(cookie, "index", { role_id: uid, server: region }), parseProfile);
}

/** 活動日曆 參數照 genshin.py calender 是 HoYoLAB 原本的拼字 */
export async function fetchActCalendar(cookie: string, uid: string, region: string): Promise<HoyolabResult<ActCalendarResult>> {
  return interpretActCalendar(await recordGet(cookie, "get_act_calender", { role_id: uid, server: region }));
}

/**
 * 開拓月曆 month 是 YYYYMM 跟 genshin.py 一樣不帶 DS
 * 沒貼 account_ 開頭的鍵時用 lt 開頭的值補上
 */
export async function fetchLedger(cookie: string, uid: string, region: string, month: string): Promise<HoyolabResult<LedgerResult>> {
  const sent = withAccountIds(cookie);
  const query = new URLSearchParams({ uid, region, month, lang: "zh-tw" });
  const json = await call(`${LEDGER_URL}?${query}`, { headers: headers(sent) });
  return explainLedgerLogin(interpretLedger(json, month), json, cookieKeys(sent));
}

/**
 * 用 cookie 換讀躍遷紀錄的金鑰 不用碰遊戲檔案 雲端遊戲也能用
 * 要 cookie_token_v2 與 account_ 開頭的鍵 照 genshin.py 的 fetch_authkey
 */
export async function fetchWarpAuthkey(cookie: string, uid: string, region: string): Promise<HoyolabResult<WarpKey | null>> {
  const json = await call(AUTHKEY_URL, {
    method: "POST",
    headers: { Cookie: withAccountIds(cookie), "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: JSON.stringify({ game_uid: uid, region, game_biz: GAME_BIZ, auth_appid: WARP_AUTH_APPID }),
  });
  return interpretWith(json, (data) => parseAuthkey(data, region));
}

/** 不用 cookie 金鑰放在網址參數裡 call 的 log 只記路徑 end_id 是這一頁最舊那筆 0 是最新一頁 */
export async function fetchWarpPage({ authkey, authkeyVer, signType, region }: WarpKey, bannerType: number, endId: string): Promise<HoyolabResult<WarpPage>> {
  const endpoint = COLLAB_BANNERS.includes(bannerType) ? "getLdGachaLog" : "getGachaLog";
  const query = new URLSearchParams({
    authkey_ver: authkeyVer,
    sign_type: signType,
    auth_appid: WARP_AUTH_APPID,
    authkey,
    lang: "zh-tw",
    game_biz: GAME_BIZ,
    region,
    gacha_type: String(bannerType),
    real_gacha_type: String(bannerType),
    size: String(WARP_PAGE_SIZE),
    end_id: endId,
  });
  return interpretWarpPage(await call(`${WARP_BASE}/${endpoint}?${query}`, { headers: { "User-Agent": USER_AGENT } }), bannerType);
}

/** 混沌回憶 虛構敘事 末日幻影的戰績 schedule_type 1 是本期 2 是上期 */
export async function fetchEndgame(cookie: string, uid: string, region: string, mode: EndgameMode, schedule: EndgameSchedule): Promise<HoyolabResult<EndgameResult>> {
  const query = { schedule_type: schedule === "current" ? "1" : "2", need_all: "true", role_id: uid, server: region };
  return interpretEndgame(await recordGet(cookie, ENDGAME_ENDPOINTS[mode], query), mode);
}

/**
 * 兌換碼照 genshin.py 用 POST JSON Origin 是官方兌換頁 code 已整理成大寫英數字
 * 沒貼 account_ 開頭的鍵時跟開拓月曆一樣用 lt 開頭的值補上
 */
export async function redeemCode(cookie: string, uid: string, region: string, code: string): Promise<RedeemOutcome> {
  const body = { cdkey: code, device_uuid: randomUUID(), game_biz: "hkrpg_global", lang: "zh-tw", platform: "4", region, t: Math.floor(Date.now() / 1000), uid };
  const json = await call(
    REDEEM_URL,
    {
      method: "POST",
      headers: headers(withAccountIds(cookie), { Origin: GIFT_PAGE, Referer: `${GIFT_PAGE}/`, "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    },
    REDEEM_TIMEOUT_MS,
  );
  return interpretRedeem(json);
}

const checkinHeaders = (cookie: string) => headers(cookie, { "x-rpc-signgame": "hkrpg" });

export async function fetchCheckinInfo(cookie: string): Promise<HoyolabResult<CheckinInfo>> {
  const url = `${CHECKIN_BASE}/info?lang=zh-tw&act_id=${CHECKIN_ACT_ID}`;
  return interpretWith(await call(url, { headers: checkinHeaders(cookie) }), parseCheckinInfo);
}

export async function signIn(cookie: string): Promise<CheckinOutcome> {
  const json = await call(`${CHECKIN_BASE}/sign`, {
    method: "POST",
    headers: { ...checkinHeaders(cookie), "Content-Type": "application/json" },
    body: JSON.stringify({ act_id: CHECKIN_ACT_ID, lang: "zh-tw" }),
  });
  return interpretSign(json);
}
