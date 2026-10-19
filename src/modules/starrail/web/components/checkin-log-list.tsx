import { formatTaipeiDateTime } from "@/core/time";
import { splitRecentCheckins } from "../recent-checkins";

/** 只列用到的欄位 頁面傳進來的是 cachedRecentCheckins 讀到的紀錄 新的在前 */
type CheckinLogRow = { log: { id: number; result: string; message: string | null; totalSignDay: number | null; createdAt: Date } };

const RESULT_LABEL = { success: "簽到成功", already: "已簽過", failed: "簽到失敗" } as Record<string, string>;
const RESULT_CHIP = { success: "chip chip-success", already: "chip", failed: "chip chip-danger" } as Record<string, string>;

/**
 * 最近幾筆直接列出 更早的收進預設關著的 details 不用 JavaScript
 * 紀錄多時並排的兌換碼卡片才不會被撐高
 */
export function CheckinLogList({ logs }: { logs: CheckinLogRow[] }) {
  const { recent, earlier } = splitRecentCheckins(logs);
  return (
    <section className="stack">
      <h3 className="sr-title">簽到紀錄</h3>
      <div className="sr-panel">
        <CheckinRows logs={recent} />
        {earlier.length > 0 && (
          <details className="disclosure border-t border-line">
            {/* 整列都能點 卡片的切角會裁掉外面的焦點框 改畫在列裡面 */}
            <summary className="card-row flex text-sm focus-visible:-outline-offset-2">顯示更早的紀錄（{earlier.length} 筆）</summary>
            {/* 接著上面的列排下去 不要 disclosure 展開內容的上邊距 */}
            <CheckinRows logs={earlier} className="mt-0 border-t border-line" />
          </details>
        )}
      </div>
    </section>
  );
}

function CheckinRows({ logs, className = "" }: { logs: CheckinLogRow[]; className?: string }) {
  return (
    <ul className={`divide-y divide-line ${className}`}>
      {logs.map(({ log }) => (
        <li key={log.id} className="card-row flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`${RESULT_CHIP[log.result] ?? "chip"} shrink-0`}>{RESULT_LABEL[log.result] ?? log.result}</span>
          {log.totalSignDay !== null && (
            <span className="chip">
              累計 <span className="sr-num text-[0.8125rem] font-bold">{log.totalSignDay}</span> 天
            </span>
          )}
          {log.message && log.result === "failed" && <span className="min-w-0 text-sm text-danger">{log.message}</span>}
          <time dateTime={log.createdAt.toISOString()} className="sr-num ml-auto text-[0.9375rem] whitespace-nowrap text-ink-soft">
            {formatTaipeiDateTime(log.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
