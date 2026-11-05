import "server-only";
import { auditCron } from "./audit-cron";
import { safeEqual } from "./crypto";
import { coreEnv } from "./env";
import { errorKind, logError } from "./errors";
import type { CronTask } from "./module";
import { notificationsCron } from "./notifications/cron";
import { recordCronRun } from "./status";

// core 的放後面 模組不小心用了同名排程也蓋不掉
const CORE_TASKS: Record<string, CronTask> = { ...notificationsCron, ...auditCron };

/** core 自己的排程 系統狀態頁跟模組的排程一起列出 */
export const coreCronNames = Object.keys(CORE_TASKS);

/**
 * core 不能依賴模組 所以模組的排程由 src/app 的 route 傳進來
 * 密鑰叫 CRON_SECRET 是因為 Vercel Cron 會自動帶上同名環境變數
 */
export async function runCron(request: Request, task: string, moduleTasks: Record<string, CronTask>): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${coreEnv().CRON_SECRET}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const cronTasks: Record<string, CronTask> = { ...moduleTasks, ...CORE_TASKS };
  // 名稱來自網址 只認自己登記的
  // constructor 這類名稱直接查會拿到 Object 原型上的函式
  if (!Object.hasOwn(cronTasks, task)) {
    return Response.json({ error: `未知的排程：${task}`, tasks: Object.keys(cronTasks) }, { status: 404 });
  }

  const startedAt = new Date();
  const finish = async (ok: boolean, summary: string, shown = summary) => {
    await recordCronRun({ task, startedAt, durationMs: Date.now() - startedAt.getTime(), ok, summary });
    return Response.json({ results: { [task]: shown } });
  };
  try {
    return await finish(true, await cronTasks[task]());
  } catch (error) {
    // 錯誤訊息可能夾帶憑證 回應只放摘要 log 也只記錯誤種類
    logError("cron", `${task} 失敗`, error);
    return finish(false, `失敗：${errorKind(error)}`, "失敗（詳見伺服器 log）");
  }
}
