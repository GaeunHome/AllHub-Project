import "server-only";
import { z } from "zod";
import { currentSession, type SessionUser } from "../auth";
import { expireTags } from "../cache";
import { logError } from "../errors";
import { MODULE_ID_PATTERN } from "../ids";
import { notificationsTag } from "./cache-tags";
import { cachedFeed } from "./cached";
import { markAllNotificationsRead, markNotificationsRead } from "./service";

// 用 Route Handler 不用 Server Action 因為每個分頁一次只送一個 Server Action
// 觀看頁翻譯一批要幾十秒 輪詢不能排在它後面

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_IDS = 100;

const markRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), ids: z.array(z.number().int().positive()).min(1).max(MAX_IDS) }),
  z.object({ action: z.literal("read-all"), module: z.string().regex(MODULE_ID_PATTERN).optional() }),
]);

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** session 失效時回 401 例如在別的裝置改了密碼 前端就停止輪詢 */
export async function GET(): Promise<Response> {
  return withSession(async (user) => json(await cachedFeed(user.id)));
}

export async function POST(request: Request): Promise<Response> {
  // cookie 是 SameSite=Lax 再加上同源與 JSON 檢查 別的網站無法替使用者送出
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "請用 JSON" }, 415);

  return withSession(async (user) => {
    const parsed = markRequest.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return json({ error: "內容格式不正確" }, 400);
    // 只改登入者自己的通知 送來別人的 id 不會有效果
    if (parsed.data.action === "read") await markNotificationsRead(user.id, parsed.data.ids);
    else await markAllNotificationsRead(user.id, parsed.data.module);
    // 同一請求裡失效過的 tag 會讓下面直接讀新資料 回傳的未讀數就是標完之後的
    expireTags(notificationsTag);
    return json(await cachedFeed(user.id));
  });
}

async function withSession(handle: (user: SessionUser) => Promise<Response>): Promise<Response> {
  try {
    const user = await currentSession();
    if (!user) return json({ error: "unauthorized" }, 401);
    return await handle(user);
  } catch (error) {
    // 資料庫錯誤可能夾帶 SQL 或連線資訊 回應只給摘要 log 只記錯誤種類
    logError("notifications", "API 失敗", error);
    return json({ error: "暫時無法讀取通知" }, 500);
  }
}

/** 跟 Server Action 一樣比對 Origin 與 Host 這個標頭由瀏覽器帶上 網頁的 JavaScript 改不了 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
