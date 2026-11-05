import "server-only";
import { reportService } from "@/core/status";

/** 交通只有頁面與輪詢會讀 TDX 快取函式裡不能寫資料庫 所以由輪詢的 Route Handler 回報 */
export const reportTdx = (problem: string | null) => reportService("transit:tdx", problem);
