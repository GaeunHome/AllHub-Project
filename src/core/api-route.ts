import "server-only";
import type { z } from "zod";
import { canUseModule, currentSession, type SessionUser } from "./auth";
import { logError } from "./errors";
import { isSameOrigin } from "./same-origin";

// Route Handler 共用的骨架 回應都帶著使用者的資料 一律不快取
// 未處理的錯誤 Next 會連 message 一起印出 可能夾帶 SQL 參數 所以一律接住

export const NO_STORE = { "Cache-Control": "private, no-store" };

export const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export const noContent = () => new Response(null, { status: 204, headers: NO_STORE });

/** scope 是 log 的前綴 failure 是 500 時給畫面的摘要 module 是模組的 Route Handler 沒權限回 403 */
export type RouteGuard = { scope: string; failure: string; module?: string };

/** 沒登入回 401 session 失效時前端靠它停下輪詢 出錯回 500 log 只記錯誤種類 */
export async function withSession(guard: RouteGuard, work: (user: SessionUser) => Promise<Response>): Promise<Response> {
  try {
    const user = await currentSession();
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);
    if (guard.module !== undefined && !(await canUseModule(user, guard.module))) return jsonResponse({ error: "forbidden" }, 403);
    return await work(user);
  } catch (error) {
    logError(guard.scope, "API 失敗", error);
    return jsonResponse({ error: guard.failure }, 500);
  }
}

/**
 * 寫入用的 cookie 是 SameSite=Lax 再加上同源與 JSON 檢查 別的網站無法替使用者送出
 * 這兩項先擋 不用查資料庫 登入後才解析內容
 */
export async function withJsonBody<T>(request: Request, schema: z.ZodType<T>, guard: RouteGuard, work: (user: SessionUser, body: T) => Promise<Response>): Promise<Response> {
  if (!isSameOrigin(request)) return jsonResponse({ error: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return jsonResponse({ error: "請用 JSON" }, 415);
  return withSession(guard, async (user) => {
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return jsonResponse({ error: "內容格式不正確" }, 400);
    return work(user, parsed.data);
  });
}
