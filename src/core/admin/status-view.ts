import type { ModuleInfo } from "../module";
import type { CronStatusRow, ServiceStatusRow } from "../status";

// 系統狀態頁要的形狀 有問題的排最前面 一打開就看得到

export type ServiceView = { id: string; label: string; state: "problem" | "ok" | "none"; at: Date | null; error: string | null };

const isProblem = ({ lastOkAt, lastErrorAt }: ServiceStatusRow) => lastErrorAt !== null && (lastOkAt === null || lastErrorAt > lastOkAt);

function serviceView(id: string, label: string, row: ServiceStatusRow | undefined): ServiceView {
  if (!row) return { id, label, state: "none", at: null, error: null };
  if (isProblem(row)) return { id, label, state: "problem", at: row.lastErrorAt, error: row.lastError };
  return { id, label, state: "ok", at: row.lastOkAt, error: null };
}

export function serviceViews(modules: readonly ModuleInfo[], rows: readonly ServiceStatusRow[]): ServiceView[] {
  const byId = new Map(rows.map((row) => [row.service, row]));
  const views = modules.flatMap((module) => (module.services ?? []).map(({ id, label }) => serviceView(id, label, byId.get(id))));
  return views.toSorted((a, b) => Number(b.state === "problem") - Number(a.state === "problem"));
}

export type CronView = { task: string; label: string; state: "failed" | "warning" | "ok" | "none"; at: Date | null; durationMs: number | null; summary: string | null };

// 排程跑完了但有一部分沒成功時 摘要才會出現這些字 全部成功的摘要不會有
const PARTIAL_FAILURE = /失敗|讀不到|寄不出去/;
const STATE_ORDER: readonly CronView["state"][] = ["failed", "warning", "ok", "none"];

function cronView(task: string, label: string, row: CronStatusRow | undefined): CronView {
  if (!row) return { task, label, state: "none", at: null, durationMs: null, summary: null };
  const state = !row.ok ? "failed" : PARTIAL_FAILURE.test(row.summary) ? "warning" : "ok";
  return { task, label, state, at: row.lastRunAt, durationMs: row.durationMs, summary: row.summary };
}

/** tasks 是現在登記的排程 沒紀錄的也列出來 才看得到它根本沒跑 */
export function cronViews(tasks: readonly string[], rows: readonly CronStatusRow[], labels: Readonly<Record<string, string>> = {}): CronView[] {
  const byTask = new Map(rows.map((row) => [row.task, row]));
  return tasks
    .map((task) => cronView(task, labels[task] ?? task, byTask.get(task)))
    .toSorted((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}

type Stated = { state: string };

const hasIssue = ({ state }: Stated) => state === "problem" || state === "failed" || state === "warning";

/** 最上面的總結 還沒有紀錄的不算異常 */
export function statusSummary(services: readonly Stated[], crons: readonly Stated[]) {
  return { problems: [...services, ...crons].filter(hasIssue).length, services: services.length, crons: crons.length };
}
