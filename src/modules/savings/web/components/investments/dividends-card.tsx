import type { ReactNode } from "react";
import { EmptyState } from "@/core/ui/empty-state";
import { perShareText } from "../../../lib/dividends";
import { formatTwd } from "../../../lib/money";
import type { DividendRowView, DividendsView } from "../../dividends-view";
import { dividendDateLines } from "../../format";
import { CARD_GRID } from "../dashboard/layout";
import { SectionHeading } from "../section-heading";
import { Lines, Ticker } from "../visuals";

/** 估計的金額在上面 只有除權的看不出會配多少 右邊不寫 */
function amountOf(row: DividendRowView): ReactNode {
  if (row.kind === "stock") return undefined;
  if (row.cashPerShare === null || row.estimate === null) return <span className="text-ink">金額還沒公布</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="font-semibold text-ink">估計 {formatTwd(row.estimate)}</span>
      <span className="text-sm text-ink-soft">{perShareText(row.cashPerShare)}</span>
    </span>
  );
}

/** 預告表只列之後兩三週 估計照目前的股數 沒有扣匯費與二代健保 */
export function DividendsCard({ view }: { view: DividendsView }) {
  return (
    <section aria-labelledby="savings-dividends" className="stack min-w-0">
      <SectionHeading id="savings-dividends" title="除權息" />
      {view.status === "unavailable" ? (
        <EmptyState compact icon="calendar-clock" title="除權息預告暫時讀不到，稍後再看" />
      ) : (
        <ul className={CARD_GRID}>
          {view.rows.map((row) => (
            <li key={`${row.symbol}-${row.exDate}`} className="card flex min-w-0 items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <Ticker symbol={row.symbol} />
                  <span className="min-w-0 font-medium break-words text-ink">{row.name}</span>
                </span>
                <span className="text-sm text-ink-soft">
                  <Lines lines={dividendDateLines(row)} />
                </span>
              </div>
              <span className="shrink-0 text-right tabular-nums">{amountOf(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
