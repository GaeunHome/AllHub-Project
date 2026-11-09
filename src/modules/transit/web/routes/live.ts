import "server-only";
import { after } from "next/server";
import { jsonResponse, withSession } from "@/core/api-route";
import { busLineOf } from "../../lib/modes";
import { cachedLive, cachedRoutes } from "../../service/cached";
import { reportTdx } from "../../service/health";

// 倒數卡片每分鐘輪詢 用 Route Handler 不用 Server Action 同一個分頁的 Server Action 會排隊

export function GET(request: Request): Promise<Response> {
  return withSession({ scope: "transit", failure: "即時資料暫時無法讀取", module: "transit" }, async (user) => {
    // 只從自己的路線裡找 別人的 id 當作不存在
    const id = Number(new URL(request.url).searchParams.get("route"));
    const route = (await cachedRoutes(user.id)).find((candidate) => candidate.id === id);
    if (!route) return jsonResponse({ error: "not found" }, 404);

    // 火車不帶車次 同一段路共用一份即時資料才不會多用額度
    const live = await cachedLive(route.mode, route.system, busLineOf(route), route.originId, route.destinationId);
    after(() => reportTdx(live.ok ? null : live.problem));
    return jsonResponse(live.ok ? live.data : { kind: "none" });
  });
}
