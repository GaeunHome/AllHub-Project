import { transitEnv } from "@/core/env";
import { errorKind } from "@/core/errors";
import { HttpStatusError, externalFetch } from "@/core/external-url";
import type { Mode } from "./modes";

// 交通部 TDX 免費會員一個月 3 點 軌道 API 1 點 1,500 次 每把金鑰每分鐘只有 5 次
// 所以讀取都要放快取 不能每次打開就問

const BASE = "https://tdx.transportdata.tw/api/basic";
const TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
const REFRESH_MARGIN_MS = 60_000;
/** 下一分鐘就有新的次數 比這更久的是這個月的額度用完了 等不到 */
const MAX_WAIT_MS = 65_000;

/** 換 token 被拒絕 是金鑰不對 不是 TDX 暫時出問題 */
export class TdxKeyError extends HttpStatusError {
  name = "TdxKeyError";
}

let token: { value: string; expiresAt: number } | undefined;
// 頁面會同時查好幾條路線 還沒有 token 時共用同一個請求
let pendingToken: Promise<string> | undefined;
// 被擋時大家一起等 不用每個都再問一次
let blockedUntil = 0;

async function requestToken(): Promise<string> {
  const { TDX_CLIENT_ID, TDX_CLIENT_SECRET } = transitEnv();
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: TDX_CLIENT_ID ?? "", client_secret: TDX_CLIENT_SECRET ?? "" });
  const response = await externalFetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  if (response.status === 400 || response.status === 401) throw new TdxKeyError(response.status);
  if (!response.ok) throw new HttpStatusError(response.status);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - REFRESH_MARGIN_MS) return Promise.resolve(token.value);
  pendingToken ??= requestToken().finally(() => {
    pendingToken = undefined;
  });
  return pendingToken;
}

/** 測試之間清掉記在記憶體的 token 與等待 */
export function resetTdx(): void {
  token = undefined;
  blockedUntil = 0;
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** TDX 的上限是整分鐘算的 沒說要等多久就等到下一分鐘 */
function retryDelayMs(response: Response, now: number): number {
  const seconds = Number(response.headers.get("Retry-After"));
  return seconds > 0 ? seconds * 1000 : 60_000 - (now % 60_000);
}

async function request(path: string, query: Record<string, string>, maxWaitMs: number): Promise<unknown> {
  const url = `${BASE}${path}?${new URLSearchParams({ $format: "JSON", ...query })}`;
  const giveUpAt = Date.now() + maxWaitMs;
  for (;;) {
    const now = Date.now();
    if (blockedUntil > giveUpAt) throw new HttpStatusError(429);
    if (blockedUntil > now) await pause(blockedUntil - now);
    const response = await externalFetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" }, cache: "no-store" });
    // token 可能提早失效 下一次重新拿
    if (response.status === 401) token = undefined;
    if (response.status === 429) {
      blockedUntil = Date.now() + retryDelayMs(response, Date.now());
      continue;
    }
    if (!response.ok) throw new HttpStatusError(response.status);
    return response.json();
  }
}

/** 畫面少不了的資料 次數用完時等到下一分鐘 */
export const tdxGet = (path: string, query: Record<string, string> = {}): Promise<unknown> => request(path, query, MAX_WAIT_MS);

/** 票價 行車時間與即時校正是多的 次數用完時不等 不能卡住畫面 */
export const tdxGetNow = (path: string, query: Record<string, string> = {}): Promise<unknown> => request(path, query, 0);

/** 給站長看的摘要 不帶網址與 token */
export function tdxProblem(error: unknown): string {
  if (error instanceof TdxKeyError) return `TDX 拒絕金鑰（${error.status}）：請重新複製 Client Id 與 Client Secret，貼到 Vercel 的 TDX_CLIENT_ID、TDX_CLIENT_SECRET，改完重新部署`;
  if (error instanceof HttpStatusError) return error.status === 429 ? "TDX 回 429：這個月的額度或每分鐘的次數用完了" : `TDX 回 ${error.status}`;
  return `讀不到 TDX：${errorKind(error)}`;
}

export const stationsPath = (mode: Exclude<Mode, "bus">, system: string) => (mode === "thsr" ? "/v2/Rail/THSR/Station" : mode === "tra" ? "/v2/Rail/TRA/Station" : `/v2/Rail/Metro/Station/${system}`);

export const stationOfLinePath = (system: string) => `/v2/Rail/Metro/StationOfLine/${system}`;

export const dailyTimetablePath = (mode: "thsr" | "tra", originId: string, destinationId: string, date: string) => `/v2/Rail/${mode === "thsr" ? "THSR" : "TRA"}/DailyTimetable/OD/${originId}/to/${destinationId}/${date}`;

const busPath = (kind: string, city: string, line: string) => `/v2/Bus/${kind}/City/${city}/${encodeURIComponent(line)}`;

/** 路線名稱已經驗證過沒有引號 只要完全一樣的路線 不要 307 帶出 3070 */
const exactLine = (line: string) => ({ $filter: `RouteName/Zh_tw eq '${line}'` });

export const busRequest = (kind: "StopOfRoute" | "EstimatedTimeOfArrival" | "Schedule", city: string, line: string) => [busPath(kind, city, line), exactLine(line)] as const;

/** 車站代碼已經驗證過只有英數 不會改變查詢條件 */
export const stationFilter = (stationId: string) => ({ $filter: `StationID eq '${stationId}'` });

export const thsrFarePath = (originId: string, destinationId: string) => `/v2/Rail/THSR/ODFare/${originId}/to/${destinationId}`;

/** 台鐵要用 v3 v2 的票種是文字而且沒有車種 */
export const traFarePath = (originId: string, destinationId: string) => `/v3/Rail/TRA/ODFare/${originId}/to/${destinationId}`;

export const metroFareRequest = (system: string, originId: string, destinationId: string) => [`/v2/Rail/Metro/ODFare/${system}`, { $filter: `OriginStationID eq '${originId}' and DestinationStationID eq '${destinationId}'` }] as const;

export const travelTimePath = (system: string) => `/v2/Rail/Metro/S2STravelTime/${system}`;
