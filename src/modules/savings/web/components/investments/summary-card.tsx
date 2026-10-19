import { formatSlashDate } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { profitText } from "../../format";
import type { InvestmentSummary } from "../../investments-view";

/** 一個大數字 下面一行寫成本與損益 讀不到股價時不寫損益 */
export function SummaryCard({ summary }: { summary: InvestmentSummary }) {
  const facts = [
    `成本 ${formatTwd(summary.cost)}`,
    summary.priced ? `損益 ${profitText(summary.profit, summary.profitPercent)}` : "股價暫時讀不到",
    summary.priced && summary.quoteDate && `${formatSlashDate(summary.quoteDate)} 收盤`,
  ].filter(Boolean);
  return (
    <section aria-labelledby="savings-investment-summary" className="card flex flex-col gap-1">
      <h2 id="savings-investment-summary" className="text-ink-soft">
        {summary.accounts > 1 ? `${summary.accounts} 個證券帳戶的總市值` : "總市值"}
      </h2>
      <p className="text-4xl font-bold tracking-tight text-ink tabular-nums">{formatTwd(summary.value)}</p>
      <p className="text-ink tabular-nums">{facts.join(" · ")}</p>
    </section>
  );
}
