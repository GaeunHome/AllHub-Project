import { Fact, FactList } from "@/core/ui/fact-list";
import { formatSlashDate } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { profitText } from "../../format";
import type { InvestmentSummary } from "../../investments-view";
import { BIG_FIGURE, BIG_FIGURE_FACTS } from "../dashboard/layout";

/** 一個大數字 旁邊是成本與損益 讀不到股價時不寫損益 */
export function SummaryCard({ summary }: { summary: InvestmentSummary }) {
  return (
    <section aria-labelledby="savings-investment-summary" className={`card ${BIG_FIGURE}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="savings-investment-summary" className="text-ink-soft">
          {summary.accounts > 1 ? `${summary.accounts} 個證券帳戶的總市值` : "總市值"}
        </h2>
        <p className="text-4xl font-bold tracking-tight text-ink tabular-nums">{formatTwd(summary.value)}</p>
      </div>
      <FactList className={BIG_FIGURE_FACTS}>
        <Fact label="成本">{formatTwd(summary.cost)}</Fact>
        {summary.priced ? <Fact label="損益">{profitText(summary.profit, summary.profitPercent)}</Fact> : <Fact label="股價">暫時讀不到</Fact>}
        {summary.priced && summary.quoteDate && <Fact label="收盤日">{formatSlashDate(summary.quoteDate)}</Fact>}
      </FactList>
    </section>
  );
}
