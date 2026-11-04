import Link from "next/link";
import { Suspense } from "react";
import { requireOwner } from "../auth";
import type { ModuleInfo, SearchParams } from "../module";
import { AUDIT_RETENTION_DAYS } from "../retention";
import { formatTaipeiDateTime } from "../time";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { InfoTip } from "../ui/info-tip";
import { PageBanner } from "../ui/page-banner";
import { ListSkeleton } from "../ui/skeleton";
import { AUDIT_PAGE_SIZE, auditHref, parseAuditQuery, type AuditQuery } from "./audit-query";
import { listAuditActors, listAuditLogs, type AuditLogRow } from "./service";

type AuditPageProps = { modules: ModuleInfo[]; searchParams: SearchParams };

/** 導覽列沒有入口 從管理頁進來 讀資料前一樣用 requireOwner 再確認 */
export function AuditLogPage({ modules, searchParams }: AuditPageProps) {
  return (
    <div className="page-stack">
      <PageBanner
        image="/images/scenes/banner-admin.svg"
        icon={<Icon name="list" />}
        title={
          <span className="inline-flex items-center gap-1">
            操作紀錄
            <InfoTip label="操作紀錄的說明">所有人的登入與操作，保留 {AUDIT_RETENTION_DAYS} 天。不記密碼、cookie、API Key 與記帳的金額。登入失敗同一小時同一個 IP 併成一列；續翻每批不記。</InfoTip>
          </span>
        }
        actions={
          <Link href="/admin" className="scene-button">
            回管理頁
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton rows={6} label="載入操作紀錄…" />}>
        <AuditLogSection modules={modules} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const FIXED_MODULES: Record<string, string> = { auth: "帳號", admin: "管理" };

export async function AuditLogSection({ modules, searchParams }: AuditPageProps) {
  await requireOwner();
  const query = parseAuditQuery(await searchParams);
  const [{ rows, total }, actors] = await Promise.all([listAuditLogs(query), listAuditActors()]);
  const names = new Map([...Object.entries(FIXED_MODULES), ...modules.map((module) => [module.id, module.name] as const)]);
  return (
    <>
      <AuditFilters query={query} actors={actors} names={names} />
      {rows.length === 0 ? <EmptyState icon="list" title="沒有符合的紀錄" /> : <AuditTable rows={rows} query={query} names={names} />}
      <AuditPager query={query} total={total} />
    </>
  );
}

function AuditFilters({ query, actors, names }: { query: AuditQuery; actors: string[]; names: Map<string, string> }) {
  return (
    <form method="get" action="/admin/logs" className="card grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end">
      <label className="field">
        <span className="field-label">使用者</span>
        <select name="actor" defaultValue={query.actor ?? ""} className="input">
          <option value="">全部</option>
          {actors.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">功能</span>
        <select name="module" defaultValue={query.module ?? ""} className="input">
          <option value="">全部</option>
          {[...names].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">結果</span>
        <select name="outcome" defaultValue={query.outcome ?? ""} className="input">
          <option value="">全部</option>
          <option value="success">成功</option>
          <option value="failure">失敗</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">IP 位址</span>
        <input name="ip" defaultValue={query.ip ?? ""} className="input" />
      </label>
      {query.batch && <input type="hidden" name="batch" value={query.batch} />}
      <div className="button-row">
        <button className="btn-primary">篩選</button>
        <Link href="/admin/logs" className="btn-ghost">
          清除
        </Link>
      </div>
    </form>
  );
}

/** 手機放不下時表格自己橫向捲動 */
function AuditTable({ rows, query, names }: { rows: AuditLogRow[]; query: AuditQuery; names: Map<string, string> }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            {["時間", "使用者", "IP 位址", "功能", "操作", "結果", "批次"].map((label) => (
              <th key={label} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <AuditRow key={row.id} row={row} query={query} names={names} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 細節裡的模組 id 換成中文名稱 寫進資料庫時 core 不知道模組叫什麼 */
const readableDetail = (detail: string | null, names: Map<string, string>) => detail?.replace(/[a-z][a-z0-9-]*/g, (word) => names.get(word) ?? word) ?? null;

function AuditRow({ row, query, names }: { row: AuditLogRow; query: AuditQuery; names: Map<string, string> }) {
  const failed = row.outcome === "failure";
  const notes = [row.target, readableDetail(row.detail, names)].filter(Boolean).join("，");
  return (
    <tr>
      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatTaipeiDateTime(row.createdAt)}</td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <Link href={auditHref(query, { actor: row.actorName })} className="link">
          {row.actorName}
        </Link>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
        <Link href={auditHref(query, { ip: row.ip })} className="link">
          {row.ip}
        </Link>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">{names.get(row.module) ?? row.module}</td>
      <td className="min-w-48 px-4 py-2.5">
        <span className="font-medium text-ink">{row.action}</span>
        {row.attempts > 1 && <span className="tabular-nums"> ×{row.attempts}</span>}
        {notes && <span className="block break-words text-ink-soft">{notes}</span>}
      </td>
      <td className="px-4 py-2.5">
        <span className={failed ? "chip chip-danger" : "chip chip-success"}>{failed ? "失敗" : "成功"}</span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <Link href={auditHref(query, { batch: row.batchId })} title={row.batchId} className="link font-mono text-xs">
          {row.batchId.slice(0, 8)}
        </Link>
      </td>
    </tr>
  );
}

function AuditPager({ query, total }: { query: AuditQuery; total: number }) {
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  return (
    <nav aria-label="操作紀錄的分頁" className="flex items-center justify-between gap-3">
      <p className="text-ink-soft tabular-nums">
        共 {total} 筆，第 {query.page} / {pages} 頁
      </p>
      <div className="button-row">
        {query.page > 1 && (
          <Link href={auditHref(query, { page: query.page - 1 })} className="btn-secondary btn-sm">
            上一頁
          </Link>
        )}
        {query.page < pages && (
          <Link href={auditHref(query, { page: query.page + 1 })} className="btn-secondary btn-sm">
            下一頁
          </Link>
        )}
      </div>
    </nav>
  );
}
