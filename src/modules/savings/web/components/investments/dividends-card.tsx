import type { ReactNode } from "react";
import { EmptyState } from "@/core/ui/empty-state";
import { CardHeader } from "@/core/ui/page-header";
import { perShareText } from "../../../lib/dividends";
import { formatTwd } from "../../../lib/money";
import type { DividendRowView, DividendsView } from "../../dividends-view";
import { dividendDateLines } from "../../format";
import { ListRow } from "../row-controls";
import { Lines, Ticker } from "../visuals";

/** 估計的金額在上面 只有除權的看不出會配多少 右邊不寫 */
function amountOf(row: DividendRowView): ReactNode {
  if (row.kind === "stock") return undefined;
  if (row.cashPerShare === null || row.estimate === null) return <span className="font-normal">金額還沒公布</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span>估計 {formatTwd(row.estimate)}</span>
      <span className="text-sm font-normal">{perShareText(row.cashPerShare)}</span>
    </span>
  );
}

/** 預告表只列之後兩三週 估計照目前的股數 沒有扣匯費與二代健保 */
export function DividendsCard({ view }: { view: DividendsView }) {
  return (
    <section aria-labelledby="savings-dividends" className="card stack overflow-hidden">
      <CardHeader id="savings-dividends">除權息</CardHeader>
      {view.status === "unavailable" ? (
        <EmptyState compact icon="calendar-clock" title="除權息預告暫時讀不到，稍後再看" />
      ) : (
        <ul className="card-list">
          {view.rows.map((row) => (
            <ListRow
              key={`${row.symbol}-${row.exDate}`}
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <Ticker symbol={row.symbol} />
                  <span className="min-w-0">{row.name}</span>
                </span>
              }
              detail={<Lines lines={dividendDateLines(row)} />}
              amount={amountOf(row)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
