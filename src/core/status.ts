import "server-only";
import { db } from "./db";
import { coreCronStatus, coreServiceStatus } from "./db/schema";
import { errorKind, logError } from "./errors";

// 系統狀態頁的資料 排程與外部服務各一列 只更新不新增 資料量不會長大
// 這是附帶的紀錄 寫不進去只記 log 不能讓排程或使用者的操作跟著失敗
// 快取函式裡不能寫資料庫 只有打開頁面才讀的資料記不到

export type CronRun = { task: string; startedAt: Date; durationMs: number; ok: boolean; summary: string };
export type CronStatusRow = typeof coreCronStatus.$inferSelect;
export type ServiceStatusRow = typeof coreServiceStatus.$inferSelect;

export async function recordCronRun({ task, startedAt, durationMs, ok, summary }: CronRun): Promise<void> {
  const values = { lastRunAt: startedAt, durationMs, ok, summary };
  try {
    await db()
      .insert(coreCronStatus)
      .values({ task, ...values })
      .onConflictDoUpdate({ target: coreCronStatus.task, set: values });
  } catch (error) {
    logError("status", "記不下排程結果", error, task);
  }
}

/**
 * service 是模組 id 開頭 要在模組的 info.ts 宣告 problem 是 null 代表這次正常
 * problem 會顯示給站長看 只放摘要 不放憑證與回應原文
 * 使用者自己的 cookie 失效不算服務有問題 不用回報
 */
export async function reportService(service: string, problem: string | null, now = new Date()): Promise<void> {
  const values = problem === null ? { lastOkAt: now } : { lastErrorAt: now, lastError: problem };
  try {
    await db()
      .insert(coreServiceStatus)
      .values({ service, ...values })
      .onConflictDoUpdate({ target: coreServiceStatus.service, set: values });
  } catch (error) {
    logError("status", "記不下服務狀態", error, service);
  }
}

/** 整段做完算正常 丟錯時記下錯誤種類再照樣丟出去 錯誤訊息可能夾帶憑證 所以不記原文 */
export async function trackService<T>(service: string, work: () => Promise<T>): Promise<T> {
  try {
    const result = await work();
    await reportService(service, null);
    return result;
  } catch (error) {
    await reportService(service, `失敗：${errorKind(error)}`);
    throw error;
  }
}

export async function listStatus(): Promise<{ cron: CronStatusRow[]; services: ServiceStatusRow[] }> {
  const [cron, services] = await Promise.all([db().select().from(coreCronStatus), db().select().from(coreServiceStatus)]);
  return { cron, services };
}
