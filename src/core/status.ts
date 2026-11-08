import "server-only";
import { db } from "./db";
import { coreCronStatus, coreServiceStatus } from "./db/schema";
import { errorKind, logError } from "./errors";

// 附帶的紀錄 寫不進去只記 log 不能讓排程或操作失敗
// 快取函式裡不能寫 只有打開頁面才讀的資料記不到

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
 * service 要在 info.ts 宣告 problem 是 null 代表正常
 * problem 給站長看只放摘要 使用者的 cookie 失效不回報
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
