import { StatusPage } from "@/core/admin/status-page";
import { modules } from "@/modules";
import { cronTasks } from "@/modules/cron";

export default function Page() {
  return <StatusPage modules={modules} tasks={Object.keys(cronTasks)} cronLabels={Object.fromEntries(modules.flatMap((module) => (module.crons ?? []).map(({ id, label }) => [id, label])))} />;
}
