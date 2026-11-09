import "server-only";
import { z } from "zod";
import { jsonResponse, withJsonBody, withSession, type RouteGuard } from "../api-route";
import { deniedModules, type SessionUser } from "../auth";
import { expireTags } from "../cache";
import { MODULE_ID_PATTERN } from "../ids";
import { notificationsTag } from "./cache-tags";
import { cachedFeed } from "./cached";
import { markAllNotificationsRead, markNotificationsRead } from "./service";
import { withoutModules } from "./visible";

// 不用 Server Action 每個分頁一次只送一個
// 輪詢不能排在觀看頁翻譯的後面

const GUARD: RouteGuard = { scope: "notifications", failure: "暫時無法讀取通知" };
const MAX_IDS = 100;

const markRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), ids: z.array(z.number().int().positive()).min(1).max(MAX_IDS) }),
  z.object({ action: z.literal("read-all"), module: z.string().regex(MODULE_ID_PATTERN).optional() }),
]);

/** 權限每次讀最新 快取的通知不分模組 回應前才濾掉 */
const feedOf = async (user: SessionUser) => jsonResponse(withoutModules(await cachedFeed(user.id), await deniedModules(user)));

/** session 失效時回 401 例如在別的裝置改了密碼 前端就停止輪詢 */
export async function GET(): Promise<Response> {
  return withSession(GUARD, feedOf);
}

export async function POST(request: Request): Promise<Response> {
  return withJsonBody(request, markRequest, GUARD, async (user, body) => {
    // 只改登入者自己的通知 送來別人的 id 不會有效果
    if (body.action === "read") await markNotificationsRead(user.id, body.ids);
    else await markAllNotificationsRead(user.id, { module: body.module, hidden: await deniedModules(user) });
    // 同一請求裡失效過的 tag 會讓下面直接讀新資料 回傳的未讀數就是標完之後的
    expireTags(notificationsTag);
    return feedOf(user);
  });
}
