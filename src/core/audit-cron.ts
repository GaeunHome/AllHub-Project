import "server-only";
import { cleanupAudit } from "./audit";
import type { CronTask } from "./module";

/** core 自己的排程 名稱已帶前綴 runCron 會合併進模組的排程清單 只動紀錄 不用讓快取失效 */
export const auditCron: Record<string, CronTask> = {
  "audit:cleanup": () => cleanupAudit(),
};
