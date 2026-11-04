import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { heldShares } from "../../lib/dividends";
import { accountBalances } from "../../lib/ledger";
import { quoteSymbols } from "../../lib/quotes";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedDividends, cachedHoldings, cachedQuotes, cachedRecurring } from "../../service/cached";
import { CARD_GRID } from "../components/dashboard/layout";
import { FactsSkeleton, HeroSkeleton } from "../components/dashboard/skeletons";
import { BrokerageList } from "../components/investments/brokerage-list";
import { DividendsCard } from "../components/investments/dividends-card";
import { SummaryCard } from "../components/investments/summary-card";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { RegularBuyList } from "../components/recurring/regular-buy-list";
import { dividendsView } from "../dividends-view";
import { depositOptions } from "../form-options";
import { investmentsView } from "../investments-view";
import { recurringPageView } from "../recurring-view";

/**
 * 總市值在橫幅裡 下面是除權息 證券帳戶 定期定額
 * 沒有持股時不查股價與除權息預告
 */
/** 橫幅的總市值與下面的清單各自串流 讀到的是同一份快取 */
async function readBase(userId: string) {
  const [accounts, flows, holdings, rules] = await Promise.all([cachedAccounts(userId), cachedAccountFlows(userId), cachedHoldings(userId), cachedRecurring(userId)]);
  return { accounts, flows, holdings, rules };
}

function quotesOf(holdings: readonly { symbol: string }[]) {
  const symbols = quoteSymbols(holdings.map((holding) => holding.symbol));
  return symbols.length > 0 ? cachedQuotes(symbols) : null;
}

/** 還沒有證券帳戶時沒有數字可以寫 */
export async function InvestmentsHero() {
  const user = await requireModule("savings");
  const base = await readBase(user.id);
  const view = investmentsView({ ...base, quotes: await quotesOf(base.holdings), today: taipeiToday(new Date()) });
  return view.brokerages.length > 0 ? <SummaryCard summary={view.summary} /> : null;
}

export async function InvestmentsSection({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("savings");
  const today = taipeiToday(new Date());
  const [base, categories, params] = await Promise.all([readBase(user.id), cachedCategories(user.id), searchParams]);
  const { accounts, flows, holdings, rules } = base;
  // 除權息只看啟用中的證券帳戶 跟排程寄通知的一樣
  const held = heldShares(accounts, holdings);
  const heldSymbols = quoteSymbols(held.map((holding) => holding.symbol));
  const [quotes, events] = await Promise.all([quotesOf(holdings), heldSymbols.length > 0 ? cachedDividends(heldSymbols) : null]);
  const dividends = dividendsView(held, events, today);
  const view = investmentsView({ ...base, quotes, today });
  const regular = recurringPageView({ accounts, rules, categories, holdings, quotes, balances: accountBalances(accounts, flows), today });
  const deposits = accounts.filter((account) => account.kind === "deposit").map(({ id, name, active }) => ({ id, name, active }));

  return (
    <div className="page-stack">
      {dividends && <DividendsCard view={dividends} />}
      <BrokerageList view={view} depositAccounts={depositOptions(accounts)} payFromAccounts={deposits} today={today} openAdd={params.add === "investment"} />
      {(view.brokerages.length > 0 || regular.regularBuys.length > 0) && <RegularBuyList items={regular.regularBuys} form={regular.form} linkToInvestments={false} />}
    </div>
  );
}

/**
 * 跟載入完的版面排得一樣 串流進來時才不會跳
 * 除權息只在快到除息日時出現 骨架照平常沒有它的樣子
 */
function InvestmentsSkeleton() {
  return (
    <LoadingState label="載入投資…" className="stack">
      <Skeleton className="h-7 w-32" />
      <div className={CARD_GRID}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card stack">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-40" />
            <FactsSkeleton widths={["w-24", "w-16", "w-16", "w-16"]} />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function InvestmentsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <SavingsPageFrame
      info={info}
      current="investments"
      hero={
        <StreamSection fallback={<HeroSkeleton label="載入總市值…" />}>
          <InvestmentsHero />
        </StreamSection>
      }
    >
      <StreamSection fallback={<InvestmentsSkeleton />}>
        <InvestmentsSection searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}
