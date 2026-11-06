import Link from "next/link";
import { Suspense } from "react";
import { requireOwner } from "../auth";
import { coreCronLabels } from "../cron";
import type { ModuleInfo } from "../module";
import { listStatus } from "../status";
import { formatTaipeiDateTime } from "../time";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { PageBanner } from "../ui/page-banner";
import { SectionTitle } from "../ui/page-header";
import { ListSkeleton } from "../ui/skeleton";
import { cronViews, serviceViews, statusSummary, type CronView, type ServiceView } from "./status-view";

type StatusPageProps = { modules: ModuleInfo[]; tasks: string[]; cronLabels?: Record<string, string> };

// 使用者要的 正常是綠色圓圈 異常是紅色圓圈 旁邊一定有字 不能只靠顏色
type Light = { label: string; dot: "success" | "danger" | "idle" };

const SERVICE_LIGHTS: Record<ServiceView["state"], Light> = {
  problem: { label: "異常", dot: "danger" },
  ok: { label: "正常", dot: "success" },
  none: { label: "還沒有紀錄", dot: "idle" },
};

const CRON_LIGHTS: Record<CronView["state"], Light> = {
  failed: { label: "失敗", dot: "danger" },
  warning: { label: "部分失敗", dot: "danger" },
  ok: { label: "正常", dot: "success" },
  none: { label: "還沒有紀錄", dot: "idle" },
};

function StatusLight({ dot, large = false }: { dot: Light["dot"]; large?: boolean }) {
  return <span aria-hidden="true" className={`status-dot ${large ? "status-dot-lg" : "status-dot-md"} ${dot === "idle" ? "" : `status-dot-${dot}`}`} />;
}

/** 導覽列沒有入口 從管理頁進來 讀資料前一樣用 requireOwner 再確認 */
export function StatusPage(props: StatusPageProps) {
  return (
    <div className="page-stack">
      <PageBanner
        image="/images/scenes/banner-admin.svg"
        icon={<Icon name="heart-pulse" />}
        title={
          <span className="inline-flex items-center gap-1">
            系統狀態
            <InfoTip label="系統狀態的說明">排程與外部服務最後一次的結果，打開頁面才讀的不算</InfoTip>
          </span>
        }
        actions={
          <Link href="/admin" className="scene-button">
            回管理頁
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton rows={6} label="載入系統狀態…" />}>
        <StatusSections {...props} />
      </Suspense>
    </div>
  );
}

export async function StatusSections({ modules, tasks, cronLabels = {} }: StatusPageProps) {
  await requireOwner();
  const { cron, services } = await listStatus();
  const serviceList = serviceViews(modules, services);
  const cronList = cronViews([...tasks, ...Object.keys(coreCronLabels)], cron, { ...cronLabels, ...coreCronLabels });
  return (
    <>
      <Summary {...statusSummary(serviceList, cronList)} />
      <ServiceSection views={serviceList} />
      <CronSection views={cronList} />
    </>
  );
}

function Summary({ problems, services, crons }: ReturnType<typeof statusSummary>) {
  return (
    <section aria-label="總覽" className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <p className="flex items-center gap-3 text-xl font-semibold text-ink">
        <StatusLight large dot={problems > 0 ? "danger" : "success"} />
        {problems > 0 ? `${problems} 個異常` : "全部正常"}
      </p>
      <p className="text-ink tabular-nums">
        外部服務 {services} 個，排程 {crons} 個
      </p>
    </section>
  );
}

function ServiceSection({ views }: { views: ServiceView[] }) {
  return (
    <section aria-labelledby="status-services" className="stack">
      <SectionTitle id="status-services">外部服務</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {views.map(({ id, label, state, at, error }) => (
          <li key={id} className="panel flex flex-col gap-1">
            <p className="flex items-center gap-2 font-medium text-ink">
              <StatusLight dot={SERVICE_LIGHTS[state].dot} />
              {label}
            </p>
            <p className="text-ink">{error ?? SERVICE_LIGHTS[state].label}</p>
            {at && <p className="text-sm text-ink-soft tabular-nums">{formatTaipeiDateTime(at)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CronSection({ views }: { views: CronView[] }) {
  return (
    <section aria-labelledby="status-cron" className="stack">
      <SectionTitle id="status-cron">排程</SectionTitle>
      <div className="card p-0">
        <table className="status-table">
          <thead>
            <tr>
              <th scope="col">名稱</th>
              <th scope="col">上次執行</th>
              <th scope="col">花多久</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            {views.map(({ task, label, state, at, durationMs, summary }) => (
              <tr key={task}>
                <th scope="row">
                  <span className="block font-medium text-ink">{label}</span>
                  <code className="text-sm text-ink-soft">{task}</code>
                </th>
                <td className="tabular-nums">{at ? formatTaipeiDateTime(at) : "—"}</td>
                <td className="tabular-nums">{durationMs === null ? "—" : `${(durationMs / 1000).toFixed(1)} 秒`}</td>
                <td>
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <StatusLight dot={CRON_LIGHTS[state].dot} />
                    {CRON_LIGHTS[state].label}
                  </span>
                  {summary && <span className="block break-words text-ink">{summary}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
