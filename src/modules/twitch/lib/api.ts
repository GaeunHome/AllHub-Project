import "server-only";
import { twitchEnv } from "@/core/env";
import { externalFetch } from "@/core/external-url";
import type { EventSubSubscription } from "./eventsub";

const HELIX = "https://api.twitch.tv/helix";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type StreamEventType = "stream.online" | "stream.offline";

export type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
};

export type TwitchStream = {
  user_id: string;
  title: string;
  game_name: string;
  started_at: string;
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

let token: { value: string; expiresAt: number } | undefined;

async function appToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - REFRESH_MARGIN_MS) return token.value;

  const env = twitchEnv();
  const response = await externalFetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) throw await toError(response, "取得 App Access Token");

  const data = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function helix<T>(method: string, path: string, body?: object): Promise<T> {
  const send = async () =>
    externalFetch(HELIX + path, {
      method,
      headers: {
        "Client-Id": twitchEnv().TWITCH_CLIENT_ID,
        Authorization: `Bearer ${await appToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let response = await send();
  if (response.status === 401) {
    // token 可能被 Twitch 提前作廢，丟掉快取重拿一次
    token = undefined;
    response = await send();
  }
  if (!response.ok) throw await toError(response, `${method} ${path.split("?")[0]}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function toError(response: Response, step: string): Promise<TwitchApiError> {
  const text = await response.text();
  let message = text;
  try {
    message = (JSON.parse(text) as { message?: string }).message ?? text;
  } catch {
    // 不是 JSON 就用原文
  }
  return new TwitchApiError(response.status, `${step}失敗（${response.status}）：${message}`);
}

export async function getUsersByLogin(logins: string[]): Promise<TwitchUser[]> {
  const query = new URLSearchParams(logins.map((login) => ["login", login]));
  return (await helix<{ data: TwitchUser[] }>("GET", `/users?${query}`)).data;
}

export async function getStreams(userIds: string[]): Promise<TwitchStream[]> {
  const query = new URLSearchParams(userIds.map((id) => ["user_id", id]));
  return (await helix<{ data: TwitchStream[] }>("GET", `/streams?${query}`)).data;
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
