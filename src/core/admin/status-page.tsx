import Link from "next/link";
import { Suspense } from "react";
import { requireOwner } from "../auth";
import { coreCronNames } from "../cron";
import type { ModuleInfo } from "../module";
import { listStatus } from "../status";
import { formatTaipeiDateTime } from "../time";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { PageBanner } from "../ui/page-banner";
import { CardHeader } from "../ui/page-header";
import { ListSkeleton } from "../ui/skeleton";
import { StatusChip, type StatusBadge } from "../ui/status-chip";
import { cronViews, serviceViews, type CronView, type ServiceView } from "./status-view";

type StatusPageProps = { modules: ModuleInfo[]; tasks: string[] };

const SERVICE_BADGES: Record<ServiceView["state"], Pick<StatusBadge, "label" | "tone"> | null> = {
  problem: { label: "有問題", tone: "danger" },
  ok: { label: "正常", tone: "success" },
  none: null,
};

const CRON_BADGES: Record<CronView["state"], Pick<StatusBadge, "label" | "tone"> | null> = {
  failed: { label: "失敗", tone: "danger" },
  warning: { label: "要注意", tone: "warning" },
  ok: { label: "正常", tone: "success" },
  none: null,
};

/** 導覽列沒有入口 從管理頁進來 讀資料前一樣用 requireOwner 再確認 */
export function StatusPage({ modules, tasks }: StatusPageProps) {
  return (
    <div className="page-stack">
      <PageBanner
        image="/images/scenes/banner-admin.svg"
        icon={<Icon name="heart-pulse" />}
        title={
          <span className="inline-flex items-center gap-1">
            系統狀態
            <InfoTip label="系統狀態的說明">每個排程與外部服務最後一次的結果。錯誤來自排程與按鈕操作，只有打開頁面才讀的資料（例如開拓月曆、收盤價、空氣品質）不會記在這裡。</InfoTip>
          </span>
        }
        actions={
          <Link href="/admin" className="scene-button">
            回管理頁
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton rows={6} label="載入系統狀態…" />}>
        <StatusSections modules={modules} tasks={tasks} />
      </Suspense>
    </div>
  );
}

export async function StatusSections({ modules, tasks }: StatusPageProps) {
  await requireOwner();
  const { cron, services } = await listStatus();
  return (
    <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
      <ServiceSection views={serviceViews(modules, services)} />
      <CronSection views={cronViews([...tasks, ...coreCronNames], cron)} />
    </div>
  );
}

const timeOf = (at: Date | null) => (at ? formatTaipeiDateTime(at) : "還沒有紀錄");

function ServiceSection({ views }: { views: ServiceView[] }) {
  return (
    <section aria-labelledby="status-services" className="card stack">
      <CardHeader id="status-services" icon={<Icon name="link" />}>
        外部服務
      </CardHeader>
      <ul className="card-list">
        {views.map(({ id, label, state, at, error }) => (
          <li key={id} className="card-row flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-ink">{label}</span>
              {SERVICE_BADGES[state] && <StatusChip badge={SERVICE_BADGES[state]} />}
            </div>
            {error && <p className="break-words text-ink">{error}</p>}
            <p className="text-sm text-ink-soft tabular-nums">{timeOf(at)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CronSection({ views }: { views: CronView[] }) {
  return (
    <section aria-labelledby="status-cron" className="card stack">
      <CardHeader id="status-cron" icon={<Icon name="clock" />}>
        排程
      </CardHeader>
      <ul className="card-list">
        {views.map(({ task, state, at, durationMs, summary }) => (
          <li key={task} className="card-row flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="font-mono text-sm break-all text-ink">{task}</span>
              {CRON_BADGES[state] && <StatusChip badge={CRON_BADGES[state]} />}
            </div>
            {summary && <p className="break-words text-ink">{summary}</p>}
            <p className="text-sm text-ink-soft tabular-nums">
              {timeOf(at)}
              {durationMs !== null && `，花了 ${(durationMs / 1000).toFixed(1)} 秒`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
