import "server-only";
import { after } from "next/server";
import { canUseModule, currentSession } from "@/core/auth";
import { cachedLive, cachedRoutes } from "../../service/cached";
import { reportTdx } from "../../service/health";

// 倒數卡片每分鐘輪詢 用 Route Handler 不用 Server Action 同一個分頁的 Server Action 會排隊

const NO_STORE = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function GET(request: Request): Promise<Response> {
  const user = await currentSession();
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!(await canUseModule(user, "transit"))) return json({ error: "forbidden" }, 403);

  // 只從自己的路線裡找 別人的 id 當作不存在
  const id = Number(new URL(request.url).searchParams.get("route"));
  const route = (await cachedRoutes(user.id)).find((candidate) => candidate.id === id);
  if (!route) return json({ error: "not found" }, 404);

  const live = await cachedLive(route.mode, route.system, route.line, route.originId, route.destinationId);
  after(() => reportTdx(live.ok ? null : live.problem));
  return json(live.ok ? live.data : { kind: "none" });
}
