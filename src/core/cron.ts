import "server-only";
import { safeEqual } from "./crypto";
import { coreEnv } from "./env";
import { logError } from "./errors";
import type { CronTask } from "./module";
import { notificationsCron } from "./notifications/cron";

/** GET /api/cron/<排程>；模組的排程由 src/app 的 route 傳進來（core 不能依賴模組），密鑰取名 CRON_SECRET 是因為 Vercel Cron 會自動帶上同名環境變數 */
export async function runCron(request: Request, task: string, moduleTasks: Record<string, CronTask>): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${coreEnv().CRON_SECRET}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // core 的放後面：模組不小心用了同名排程也蓋不掉
  const cronTasks: Record<string, CronTask> = { ...moduleTasks, ...notificationsCron };
  // 名稱來自網址，只認自己登記的：constructor、toString 這類名稱用 cronTasks[task] 會查到 Object 原型上的函式
  if (!Object.hasOwn(cronTasks, task)) {
    return Response.json({ error: `未知的排程：${task}`, tasks: Object.keys(cronTasks) }, { status: 404 });
  }

  try {
    return Response.json({ results: { [task]: await cronTasks[task]() } });
  } catch (error) {
    // 錯誤訊息可能夾帶憑證（例如 header 原文），回應只放摘要，log 也只記錯誤種類
    logError("cron", `${task} 失敗`, error);
    return Response.json({ results: { [task]: "失敗（詳見伺服器 log）" } });
  }
}
