import "server-only";
import { z } from "zod";
import { currentSession, type SessionUser } from "../auth";
import { logError } from "../errors";
import { MODULE_ID_PATTERN } from "../ids";
import { isSameOrigin } from "../same-origin";
import { isPushEndpoint, isPushKeys } from "./rules";
import { removeSubscription, saveSubscription, setPushMute } from "./service";

// 不用 Server Action 才不跟觀看頁的翻譯排隊
// 使用者 id 來自 session 表單只決定是哪一支手機

const NO_STORE = { "Cache-Control": "private, no-store" };

const endpoint = z.string().refine(isPushEndpoint);
const subscribeRequest = z.object({ endpoint, keys: z.object({ p256dh: z.string(), auth: z.string() }).refine(isPushKeys) });
const muteRequest = z.object({ endpoint, moduleId: z.string().regex(MODULE_ID_PATTERN), muted: z.boolean() });
const removeRequest = z.object({ endpoint });

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const noContent = () => new Response(null, { status: 204, headers: NO_STORE });

async function handle<T>(request: Request, schema: z.ZodType<T>, work: (user: SessionUser, body: T) => Promise<Response>): Promise<Response> {
  // cookie 是 SameSite=Lax 再加上同源與 JSON 檢查 別的網站無法替使用者送出
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "請用 JSON" }, 415);
  try {
    const user = await currentSession();
    if (!user) return json({ error: "unauthorized" }, 401);
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return json({ error: "內容格式不正確" }, 400);
    return await work(user, parsed.data);
  } catch (error) {
    logError("push", "API 失敗", error);
    return json({ error: "暫時無法設定手機通知" }, 500);
  }
}

/** 打開通知頁時也會送一次 回傳這支手機關掉的模組 */
export const POST = (request: Request) => handle(request, subscribeRequest, async (user, { endpoint: url, keys }) => json(await saveSubscription(user.id, { endpoint: url, ...keys })));

export const PATCH = (request: Request) =>
  handle(request, muteRequest, async (user, { endpoint: url, moduleId, muted }) => ((await setPushMute(user.id, url, moduleId, muted)) ? noContent() : json({ error: "找不到這支手機" }, 404)));

export const DELETE = (request: Request) =>
  handle(request, removeRequest, async (user, { endpoint: url }) => {
    await removeSubscription(user.id, url);
    return noContent();
  });
