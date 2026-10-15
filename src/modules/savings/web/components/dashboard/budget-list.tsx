import { StatusChip } from "@/core/ui/status-chip";
import type { BudgetRow, BudgetStatus } from "../../../lib/ledger";
import { formatTwd } from "../../../lib/money";
import { formatPercent } from "../../dashboard-view";
import { ColorDot } from "../color-dot";
import { ProgressBar, type ProgressTone } from "./progress-bar";

const TONES: Record<BudgetStatus, ProgressTone> = { ok: "accent", warning: "warning", over: "danger" };

/** 快用完與超支用有圖示和文字的標籤 不只靠進度條的顏色 */
export function BudgetList({ rows }: { rows: BudgetRow[] }) {
  return (
    <ul aria-label="各分類的預算" className="grid gap-x-8 gap-y-5 @2xl:grid-cols-2">
      {rows.map((row, i) => (
        <li key={row.categoryId} className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ColorDot color={row.color} />
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{row.name}</span>
            {row.status === "warning" && <StatusChip badge={{ label: "快用完了", tone: "warning" }} />}
            {row.status === "over" && <StatusChip badge={{ label: `超支 ${formatTwd(row.spent - row.budget)}`, tone: "danger" }} />}
            <span className="text-sm text-ink-soft tabular-nums">
              <span className="font-semibold text-ink">{formatTwd(row.spent)}</span>／{formatTwd(row.budget)}
            </span>
          </div>
          <ProgressBar percent={row.percent} tone={TONES[row.status]} index={i} />
          <p className="flex justify-between gap-3 text-sm text-ink-soft">
            {/* 超支的金額已經寫在標籤上 這裡不重複 */}
            <span>{row.status === "over" ? "" : `還剩 ${formatTwd(row.remaining)}`}</span>
            <span className="tabular-nums">{formatPercent(row.percent)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
