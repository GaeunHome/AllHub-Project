import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "@/core/crypto";
import { coreEnv } from "@/core/env";

/**
 * 不存連結 用密鑰算出來 建立的人隨時可以再複製一次
 * 撤銷時 generation 加一 算出來的就不一樣 舊的連結跟著失效
 */
export function joinToken(tripId: number, generation: number, secret: string = coreEnv().SESSION_SECRET): string {
  const key = createHmac("sha256", secret).update("allhub:travel:join").digest();
  return createHmac("sha256", key).update(`${tripId}:${generation}`).digest("base64url");
}

export const joinPath = (tripId: number, generation: number) => `/travel/join/${tripId}/${joinToken(tripId, generation)}`;

export function isJoinToken(tripId: number, generation: number, token: string): boolean {
  return safeEqual(token, joinToken(tripId, generation));
}
