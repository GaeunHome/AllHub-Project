import { Fact } from "@/core/ui/fact-list";
import { formatSlashDate } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { profitText } from "../../format";
import type { InvestmentSummary } from "../../investments-view";
import { BannerFigure } from "../dashboard/banner-figure";

/** 放在橫幅裡 一個大數字 旁邊是成本與損益 讀不到股價時不寫損益 */
export function SummaryCard({ summary }: { summary: InvestmentSummary }) {
  return (
    <BannerFigure
      id="savings-investment-summary"
      label={summary.accounts > 1 ? `${summary.accounts} 個證券帳戶的總市值` : "總市值"}
      amount={summary.value}
      facts={
        <>
          <Fact label="成本">{formatTwd(summary.cost)}</Fact>
          {summary.priced ? <Fact label="損益">{profitText(summary.profit, summary.profitPercent)}</Fact> : <Fact label="股價">暫時無法讀取</Fact>}
          {summary.priced && summary.quoteDate && <Fact label="收盤日">{formatSlashDate(summary.quoteDate)}</Fact>}
        </>
      }
    />
  );
}
