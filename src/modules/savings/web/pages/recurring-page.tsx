import Link from "next/link";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { accountBalances } from "../../lib/ledger";
import { quoteSymbols } from "../../lib/quotes";
import { parseRowId } from "../../lib/validation";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedHoldings, cachedQuotes, cachedRecurring } from "../../service/cached";
import { CARD_GRID } from "../components/dashboard/layout";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { OtherRecurringList } from "../components/recurring/other-recurring-list";
import { RegularBuyList } from "../components/recurring/regular-buy-list";
import { SalarySection } from "../components/recurring/salary-section";
import { SAVINGS_PATHS, type RecurringPreset } from "../paths";
import { recurringPageView } from "../recurring-view";

const PRESETS: readonly RecurringPreset[] = ["salary", "regular-buy", "other"];

/** 網址的 add 參數 認不得的不打開 */
function presetFrom(raw: string | string[] | undefined): RecurringPreset | null {
  return PRESETS.find((preset) => preset === raw) ?? null;
}

/**
 * 由上到下 薪水 定期定額 其他固定收支 每一條一張卡
 * 網址的 edit 只認自己的固定收支 別人的或不存在的不打開
 */
export async function RecurringSection({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("savings");
  const today = taipeiToday(new Date());
  const [accounts, flows, rules, categories, holdings, params] = await Promise.all([
    cachedAccounts(user.id),
    cachedAccountFlows(user.id),
    cachedRecurring(user.id),
    cachedCategories(user.id),
    cachedHoldings(user.id),
    searchParams,
  ]);

  if (accounts.length === 0) {
    return (
      <section aria-label="還沒有帳戶" className="card stack">
        <p className="text-ink">還沒有帳戶。先新增銀行帳戶，再設定薪水與每月固定的收支。</p>
        <div className="button-row">
          <Link href={SAVINGS_PATHS.addAccount} className="btn-primary">
            <Icon name="plus" className="size-4" />
            新增銀行帳戶
          </Link>
        </div>
      </section>
    );
  }

  // 定期定額確認時才要估股數 沒有定期定額就不查股價
  const symbols = quoteSymbols(holdings.filter((holding) => rules.some((rule) => rule.holdingId === holding.id)).map((holding) => holding.symbol));
  const quotes = symbols.length > 0 ? await cachedQuotes(symbols) : null;
  const view = recurringPageView({ accounts, rules, categories, holdings, quotes, balances: accountBalances(accounts, flows), today });
  const add = presetFrom(params.add);
  const editId = parseRowId(params.edit);
  const openEditId = rules.some((rule) => rule.id === editId) ? editId : null;

  return (
    <div className="page-stack">
      <SalarySection items={view.salaries} form={view.form} salaryAccounts={view.salaryAccounts} allocationAccounts={view.allocationAccounts} openAdd={add === "salary"} openEditId={openEditId} />
      <RegularBuyList items={view.regularBuys} form={view.form} openAdd={add === "regular-buy"} openEditId={openEditId} />
      <OtherRecurringList items={view.others} form={view.form} openAdd={add === "other"} openEditId={openEditId} />
    </div>
  );
}

function SectionSkeleton({ cards }: { cards: number }) {
  return (
    <div className="stack">
      <Skeleton className="h-7 w-24" />
      <div className={CARD_GRID}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card stack">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className={`h-4 ${i % 2 === 0 ? "w-2/5" : "w-1/3"}`} />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 跟載入完的版面排得一樣 串流進來時才不會跳 */
function RecurringSkeleton() {
  return (
    <LoadingState label="載入每月固定…" className="page-stack">
      <SectionSkeleton cards={2} />
      <SectionSkeleton cards={1} />
      <SectionSkeleton cards={3} />
    </LoadingState>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function RecurringPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="recurring">
      <StreamSection fallback={<RecurringSkeleton />}>
        <RecurringSection searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}
