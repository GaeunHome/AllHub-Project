import { requireSession } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { heldShares } from "../../lib/dividends";
import { accountBalances } from "../../lib/ledger";
import { quoteSymbols } from "../../lib/quotes";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedDividends, cachedHoldings, cachedQuotes, cachedRecurring } from "../../service/cached";
import { BrokerageList } from "../components/investments/brokerage-list";
import { DividendsCard } from "../components/investments/dividends-card";
import { SummaryCard } from "../components/investments/summary-card";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { RegularBuyList } from "../components/recurring/regular-buy-list";
import { depositOptions } from "../dashboard-view";
import { dividendsView } from "../dividends-view";
import { investmentsView } from "../investments-view";
import { recurringPageView } from "../recurring-view";

/**
 * 摘要 除權息與證券帳戶 定期定額放在後面 超寬螢幕時證券帳戶以外的在右邊一欄
 * 沒有持股時不查股價與除權息預告
 */
export async function InvestmentsSection({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const today = taipeiToday(new Date());
  const [accounts, flows, holdings, rules, categories, params] = await Promise.all([
    cachedAccounts(user.id),
    cachedAccountFlows(user.id),
    cachedHoldings(user.id),
    cachedRecurring(user.id),
    cachedCategories(user.id),
    searchParams,
  ]);
  const symbols = quoteSymbols(holdings.map((holding) => holding.symbol));
  // 除權息只看啟用中的證券帳戶 跟排程寄通知的一樣
  const held = heldShares(accounts, holdings);
  const heldSymbols = quoteSymbols(held.map((holding) => holding.symbol));
  const [quotes, events] = await Promise.all([symbols.length > 0 ? cachedQuotes(symbols) : null, heldSymbols.length > 0 ? cachedDividends(heldSymbols) : null]);
  const dividends = dividendsView(held, events, today);
  const view = investmentsView({ accounts, flows, holdings, quotes, rules, today });
  const regular = recurringPageView({ accounts, rules, categories, holdings, quotes, balances: accountBalances(accounts, flows), today });
  const deposits = accounts.filter((account) => account.kind === "deposit").map(({ id, name, active }) => ({ id, name, active }));
  const list = <BrokerageList view={view} depositAccounts={depositOptions(accounts)} payFromAccounts={deposits} today={today} openAdd={params.add === "investment"} />;
  const regularBuys = <RegularBuyList items={regular.regularBuys} form={regular.form} linkToInvestments={false} />;

  if (view.brokerages.length === 0) {
    return (
      <div className="page-stack">
        {list}
        {regular.regularBuys.length > 0 && regularBuys}
      </div>
    );
  }
  // 右邊一欄的最後一列是 1fr 證券帳戶比右邊高時多的高度都給它 右邊的卡片才不會被拉開
  return (
    <div className={`page-stack 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:items-start ${dividends ? "2xl:grid-rows-[auto_auto_1fr]" : "2xl:grid-rows-[auto_1fr]"}`}>
      <div className="2xl:col-start-2 2xl:row-start-1">
        <SummaryCard summary={view.summary} />
      </div>
      {dividends && (
        <div className="2xl:col-start-2 2xl:row-start-2">
          <DividendsCard view={dividends} />
        </div>
      )}
      <div className={`2xl:col-start-1 2xl:row-start-1 ${dividends ? "2xl:row-span-3" : "2xl:row-span-2"}`}>{list}</div>
      <div className={`2xl:col-start-2 ${dividends ? "2xl:row-start-3" : "2xl:row-start-2"}`}>{regularBuys}</div>
    </div>
  );
}

/**
 * 跟載入完的版面排得一樣 串流進來時才不會跳
 * 除權息只在快到除息日時出現 骨架照平常沒有它的樣子
 */
function InvestmentsSkeleton() {
  return (
    <LoadingState label="載入投資…" className="page-stack 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:grid-rows-[auto_1fr] 2xl:items-start">
      <div className="card flex flex-col gap-2 2xl:col-start-2 2xl:row-start-1">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="card stack 2xl:col-start-1 2xl:row-span-2 2xl:row-start-1">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-40" />
        {[0, 1].map((i) => (
          <div key={i} className="flex min-h-14 items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function InvestmentsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="investments">
      <StreamSection fallback={<InvestmentsSkeleton />}>
        <InvestmentsSection searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}
