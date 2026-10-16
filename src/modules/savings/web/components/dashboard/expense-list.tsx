import Link from "next/link";
import type { UiIconName } from "@/core/ui/icon";
import { formatTwd } from "../../../lib/money";
import type { ExpenseRow } from "../../dashboard-view";
import { IconTile } from "../visuals";
import { Meter } from "./meter";

type ExpenseListProps = {
  /** icon 是分類的圖示 沒給就不畫 */
  rows: (ExpenseRow & { icon?: UiIconName })[];
  /** 紀錄頁的側欄給 點了在頁面裡篩選 不必再問伺服器 */
  onSelect?: (category: string) => void;
  /** 紀錄頁正在篩選的分類 */
  selected?: string;
};

const ROW = "card-row flex w-full items-center gap-3 text-left transition-colors hover:bg-surface-muted focus-visible:-outline-offset-2";

/** 已用與預算寫成一個數字 超支才另外寫超過多少 長條只畫有預算的 */
export function ExpenseList({ rows, onSelect, selected }: ExpenseListProps) {
  return (
    <ul className="card-list">
      {rows.map((row) => {
        const content = (
          <>
            {row.icon && <IconTile name={row.icon} size="sm" />}
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="font-medium break-words text-ink">{row.name}</span>
                  {row.over > 0 && <span className="text-sm font-medium text-ink">超過 {formatTwd(row.over)}</span>}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="font-medium text-ink">{formatTwd(row.spent)}</span>
                  {row.budget !== null && <span className="text-ink-soft"> / {formatTwd(row.budget)}</span>}
                </span>
              </span>
              {row.barPercent !== null && <Meter percent={row.barPercent} />}
            </span>
          </>
        );
        return (
          <li key={row.key}>
            {onSelect ? (
              <button type="button" aria-pressed={selected === row.category} onClick={() => onSelect(row.category)} className={`${ROW} cursor-pointer aria-pressed:bg-surface-muted`}>
                {content}
              </button>
            ) : (
              <Link href={row.href} className={ROW}>
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
