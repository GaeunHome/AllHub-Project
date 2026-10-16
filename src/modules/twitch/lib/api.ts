import "server-only";
import { twitchEnv } from "@/core/env";
import { externalFetch } from "@/core/external-url";
import type { EventSubSubscription } from "./eventsub";

const HELIX = "https://api.twitch.tv/helix";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** 頭像與直播狀態只是附加資訊 Helix 慢的時候不等滿 15 秒 */
const DISPLAY_TIMEOUT_MS = 5_000;
/** Helix 一次最多查 100 個 id */
const HELIX_BATCH = 100;

export type StreamEventType = "stream.online" | "stream.offline";

export type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  /** 沒設定離線橫幅時是空字串 */
  offline_image_url?: string;
};

export type TwitchStream = {
  user_id: string;
  title: string;
  game_name: string;
  started_at: string;
  game_id?: string;
  viewer_count?: number;
  /** 網址裡有 {width}x{height} 樣板 */
  thumbnail_url?: string;
};

export type TwitchGame = {
  id: string;
  name: string;
  /** 網址裡有 {width}x{height} 樣板 */
  box_art_url: string;
};

export class TwitchApiError extends Error {
  name = "TwitchApiError";

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 換 token 被拒時看得出是哪個值填錯的回應 key 是狀態碼加 Twitch 的 message
 * Client ID 不存在回 400 Client ID 對但 Secret 錯回 403
 */
const TOKEN_REJECTIONS: Record<string, string> = {
  "400 invalid client": "Twitch 的 Client ID 不對：請到 Twitch 開發者後台複製應用程式的用戶端 ID，貼到 Vercel 的 TWITCH_CLIENT_ID（前後不要有空白），改完重新部署",
  "403 invalid client secret": "Twitch 的 Client Secret 不對：請在 Twitch 開發者後台按「新密碼」，貼到 Vercel 的 TWITCH_CLIENT_SECRET，改完重新部署",
};

let token: { value: string; expiresAt: number } | undefined;
// 頁面會同時查頭像與直播狀態 還沒有 token 時共用同一個請求
let pendingToken: Promise<string> | undefined;

async function appToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - REFRESH_MARGIN_MS) return token.value;
  pendingToken ??= requestToken().finally(() => {
    pendingToken = undefined;
  });
  return pendingToken;
}

async function requestToken(): Promise<string> {
  const env = twitchEnv();
  const response = await externalFetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) throw await toError(response, "取得 App Access Token", TOKEN_REJECTIONS);

  const data = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function helix<T>(method: string, path: string, body?: object, { timeoutMs }: { timeoutMs?: number } = {}): Promise<T> {
  const send = async () =>
    externalFetch(
      HELIX + path,
      {
        method,
        headers: {
          "Client-Id": twitchEnv().TWITCH_CLIENT_ID,
          Authorization: `Bearer ${await appToken()}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      { timeoutMs },
    );

  let response = await send();
  if (response.status === 401) {
    // token 可能被 Twitch 提前作廢 丟掉快取重拿一次
    token = undefined;
    response = await send();
  }
  if (!response.ok) throw await toError(response, `${method} ${path.split("?")[0]}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** known 把認得的回應換成給使用者看的說明 */
async function toError(response: Response, step: string, known: Record<string, string> = {}): Promise<TwitchApiError> {
  const text = await response.text();
  let message = text;
  try {
    message = (JSON.parse(text) as { message?: string }).message ?? text;
  } catch {
    // 不是 JSON 就用原文
  }
  return new TwitchApiError(response.status, known[`${response.status} ${message}`] ?? `${step}失敗（${response.status}）：${message}`);
}

export async function getUsersByLogin(logins: string[]): Promise<TwitchUser[]> {
  const query = new URLSearchParams(logins.map((login) => ["login", login]));
  return (await helix<{ data: TwitchUser[] }>("GET", `/users?${query}`)).data;
}

export async function getStreams(userIds: string[]): Promise<TwitchStream[]> {
  const query = new URLSearchParams(userIds.map((id) => ["user_id", id]));
  return (await helix<{ data: TwitchStream[] }>("GET", `/streams?${query}`)).data;
}

/** 重複的 id 只查一次 超過 100 個分批 沒有 id 就不發請求 */
async function inBatches<T>(ids: string[], fetchBatch: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const unique = [...new Set(ids)];
  const batches: Promise<T[]>[] = [];
  for (let i = 0; i < unique.length; i += HELIX_BATCH) batches.push(fetchBatch(unique.slice(i, i + HELIX_BATCH)));
  return (await Promise.all(batches)).flat();
}

const displayGet = async <T>(path: string, params: [string, string][]): Promise<T[]> =>
  (await helix<{ data: T[] }>("GET", `${path}?${new URLSearchParams(params)}`, undefined, { timeoutMs: DISPLAY_TIMEOUT_MS })).data;

/** 頭像與離線橫幅 */
export async function getUsersById(ids: string[]): Promise<TwitchUser[]> {
  return inBatches(ids, (batch) => displayGet<TwitchUser>("/users", batch.map((id) => ["id", id])));
}

/** 只回傳正在直播的 預設只回 20 筆 要用 first 指定 */
export async function getLiveStreams(userIds: string[]): Promise<TwitchStream[]> {
  return inBatches(userIds, (batch) => displayGet<TwitchStream>("/streams", [...batch.map((id): [string, string] => ["user_id", id]), ["first", String(HELIX_BATCH)]]));
}

/** 遊戲封面 */
export async function getGames(ids: string[]): Promise<TwitchGame[]> {
  return inBatches(ids, (batch) => displayGet<TwitchGame>("/games", batch.map((id) => ["id", id])));
}

export function eventSubCallbackUrl(): string {
  return new URL("/api/twitch/eventsub", twitchEnv().PUBLIC_BASE_URL).toString();
}

export async function createSubscription(type: StreamEventType, broadcasterId: string): Promise<EventSubSubscription> {
  const env = twitchEnv();
  const result = await helix<{ data: EventSubSubscription[] }>("POST", "/eventsub/subscriptions", {
    type,
    version: "1",
    condition: { broadcaster_user_id: broadcasterId },
    transport: {
      method: "webhook",
      callback: eventSubCallbackUrl(),
      secret: env.TWITCH_EVENTSUB_SECRET,
    },
  });
  return result.data[0];
}

export async function deleteSubscription(id: string): Promise<void> {
  await helix<void>("DELETE", `/eventsub/subscriptions?id=${encodeURIComponent(id)}`);
}

export async function listSubscriptions(): Promise<EventSubSubscription[]> {
  const all: EventSubSubscription[] = [];
  let cursor: string | undefined;
  do {
    const query = cursor ? `?after=${encodeURIComponent(cursor)}` : "";
    const page = await helix<{ data: EventSubSubscription[]; pagination?: { cursor?: string } }>("GET", `/eventsub/subscriptions${query}`);
    all.push(...page.data);
    cursor = page.pagination?.cursor;
  } while (cursor);
  return all;
}
