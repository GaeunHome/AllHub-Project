import "server-only";
import { jsonResponse, withSession } from "@/core/api-route";
import { isRealDateKey, taipeiDateKey } from "@/core/time";
import { rateDay } from "../../lib/rates";
import { cachedRates } from "../../service/cached";

// 記帳視窗換貨幣或日期時讀 用 Route Handler 不用 Server Action 同一個分頁的 Server Action 會排隊

export function GET(request: Request): Promise<Response> {
  return withSession({ scope: "travel", failure: "匯率暫時無法讀取", module: "travel" }, async () => {
    // 日期會成為快取的 key 只收真的日期
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!isRealDateKey(date)) return jsonResponse({ error: "日期不正確" }, 400);
    const table = await cachedRates(rateDay(date, taipeiDateKey(new Date())));
    return table ? jsonResponse(table) : jsonResponse({ error: "匯率暫時無法讀取" }, 503);
  });
}
