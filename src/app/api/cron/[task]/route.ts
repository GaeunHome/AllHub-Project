import { runCron } from "@/core/cron";
import { cronTasks } from "@/modules/cron";

/**
 * 排程一律用 /api/cron/starrail:checkin 這種網址
 * Vercel Cron 的 path 不依賴 query 字串
 */
export async function GET(request: Request, { params }: { params: Promise<{ task: string }> }) {
  return runCron(request, (await params).task, cronTasks);
}
