import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { accountBalances } from "../../lib/ledger";
import { quoteSymbols } from "../../lib/quotes";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedHoldings, cachedQuotes, cachedRecurring } from "../../service/cached";
import { BrokerageList } from "../components/investments/brokerage-list";
import { SummaryCard } from "../components/investments/summary-card";
import type { SearchParams } from "../components/month-href";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { RegularBuyList } from "../components/recurring/regular-buy-list";
import { depositOptions } from "../dashboard-view";
import { investmentsView } from "../investments-view";
import { recurringPageView } from "../recurring-view";

/**
 * 摘要與證券帳戶 定期定額放在後面 超寬螢幕時摘要與定期定額在右邊一欄
 * 沒有持股時不查股價
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
  const quotes = symbols.length > 0 ? await cachedQuotes(symbols) : null;
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
  return (
    <div className="page-stack 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:items-start">
      <div className="2xl:col-start-2 2xl:row-start-1">
        <SummaryCard summary={view.summary} />
      </div>
      <div className="2xl:col-start-1 2xl:row-span-2 2xl:row-start-1">{list}</div>
      <div className="2xl:col-start-2 2xl:row-start-2">{regularBuys}</div>
    </div>
  );
}

/** 跟載入完的版面排得一樣 串流進來時才不會跳 */
function InvestmentsSkeleton() {
  return (
    <LoadingState label="載入投資…" className="page-stack">
      <div className="card flex flex-col gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="card stack">
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
