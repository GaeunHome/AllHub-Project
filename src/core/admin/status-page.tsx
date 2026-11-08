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

/** 名稱前面是燈號 異常的原因或排程的摘要接在結果下面 */
function NameCell({ dot, label, code }: { dot: Light["dot"]; label: string; code?: string }) {
  return (
    <th scope="row" className="status-name">
      <span className="flex items-center gap-2.5">
        <StatusLight dot={dot} />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink">{label}</span>
          {code && <span className="font-mono text-sm text-ink-soft">{code}</span>}
        </span>
      </span>
    </th>
  );
}

function ResultCell({ label, detail }: { label: string; detail: string | null }) {
  return (
    <td className="status-result">
      <span className="block font-medium text-ink">{label}</span>
      {detail && <span className="block break-words text-ink">{detail}</span>}
    </td>
  );
}

// 使用者選的 兩區都是白底清單 一列一個 欄位對齊 時間靠右
function ServiceSection({ views }: { views: ServiceView[] }) {
  return (
    <section aria-labelledby="status-services" className="stack">
      <SectionTitle id="status-services">外部服務</SectionTitle>
      <div className="card p-0">
        <table className="status-table" data-columns="3">
          <thead>
            <tr>
              <th scope="col">名稱</th>
              <th scope="col">結果</th>
              <th scope="col">時間</th>
            </tr>
          </thead>
          <tbody>
            {views.map(({ id, label, state, at, error }) => (
              <tr key={id}>
                <NameCell dot={SERVICE_LIGHTS[state].dot} label={label} />
                <ResultCell label={SERVICE_LIGHTS[state].label} detail={error} />
                <td className="status-when">{at && formatTaipeiDateTime(at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CronSection({ views }: { views: CronView[] }) {
  return (
    <section aria-labelledby="status-cron" className="stack">
      <SectionTitle id="status-cron">排程</SectionTitle>
      <div className="card p-0">
        <table className="status-table" data-columns="4">
          <thead>
            <tr>
              <th scope="col">名稱</th>
              <th scope="col">結果</th>
              <th scope="col">花多久</th>
              <th scope="col">上次執行</th>
            </tr>
          </thead>
          <tbody>
            {views.map(({ task, label, state, at, durationMs, summary }) => (
              <tr key={task}>
                <NameCell dot={CRON_LIGHTS[state].dot} label={label} code={task} />
                <ResultCell label={CRON_LIGHTS[state].label} detail={summary} />
                <td className="status-took">{durationMs !== null && `${(durationMs / 1000).toFixed(1)} 秒`}</td>
                <td className="status-when">{at && formatTaipeiDateTime(at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
