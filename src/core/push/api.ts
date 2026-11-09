import "server-only";
import { z } from "zod";
import { jsonResponse, noContent, withJsonBody, type RouteGuard } from "../api-route";
import { MODULE_ID_PATTERN } from "../ids";
import { isPushEndpoint, isPushKeys } from "./rules";
import { removeSubscription, saveSubscription, setPushMute } from "./service";

// 不用 Server Action 才不跟觀看頁的翻譯排隊
// 使用者 id 來自 session 表單只決定是哪一支手機

const GUARD: RouteGuard = { scope: "push", failure: "暫時無法設定手機通知" };

const endpoint = z.string().refine(isPushEndpoint);
const subscribeRequest = z.object({ endpoint, keys: z.object({ p256dh: z.string(), auth: z.string() }).refine(isPushKeys) });
const muteRequest = z.object({ endpoint, moduleId: z.string().regex(MODULE_ID_PATTERN), muted: z.boolean() });
const removeRequest = z.object({ endpoint });

/** 打開通知頁時也會送一次 回傳這支手機關掉的模組 */
export const POST = (request: Request) => withJsonBody(request, subscribeRequest, GUARD, async (user, { endpoint: url, keys }) => jsonResponse(await saveSubscription(user.id, { endpoint: url, ...keys })));

export const PATCH = (request: Request) =>
  withJsonBody(request, muteRequest, GUARD, async (user, { endpoint: url, moduleId, muted }) => ((await setPushMute(user.id, url, moduleId, muted)) ? noContent() : jsonResponse({ error: "找不到這支手機" }, 404)));

export const DELETE = (request: Request) =>
  withJsonBody(request, removeRequest, GUARD, async (user, { endpoint: url }) => {
    await removeSubscription(user.id, url);
    return noContent();
  });
