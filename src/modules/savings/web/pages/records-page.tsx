import Link from "next/link";
import { requireSession } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { taipeiMonthKey } from "@/core/time";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { accountsWithHoldings } from "../../lib/holdings";
import { earliestFlowMonth, monthTotals } from "../../lib/ledger";
import { resolveMonth, selectableMonths } from "../../lib/month";
import type { PendingRuleRow } from "../../lib/pending";
import { revertsPeriod } from "../../lib/recurring";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedCategoryTotals, cachedHoldings, cachedMonthTransactions, cachedRecurring } from "../../service/cached";
import type { TransactionView } from "../../service/transactions";
import { QuickAddButton } from "../components/forms/quick-add";
import { MonthSwitcher } from "../components/month-switcher";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { RecordList } from "../components/records/record-list";
import { categoryOptions, entryFormOptions, expenseRows, formExtras } from "../dashboard-view";
import { periodLabel } from "../format";
import { SAVINGS_PATHS } from "../paths";
import { accountFilterFrom, categoryFilterFrom, type RecordItem } from "../record-filter";

/**
 * 只交給瀏覽器畫面用得到的欄位 不帶 userId 與 createdAt
 * 刪掉待處理確認來的最後一期 伺服器會把它放回待處理 條件跟伺服器一樣
 */
function toRecordItem(view: TransactionView, rules: ReadonlyMap<number, Pick<PendingRuleRow, "kind" | "mode" | "lastPostedMonth">>, icons: ReadonlyMap<number, string | null>): RecordItem {
  const { id, kind, accountId, accountName, counterAccountId, counterAccountName, categoryId, categoryName, amount, date, note, recurring, recurringName, shares, holdingSymbol, cardBillId } = view;
  const rule = view.recurringId === null ? undefined : rules.get(view.recurringId);
  const backToPending = rule !== undefined && revertsPeriod(view, rule);
  const categoryIcon = categoryId === null ? null : (icons.get(categoryId) ?? null);
  return { id, kind, accountId, accountName, counterAccountId, counterAccountName, categoryId, categoryName, amount, date, note, recurring, recurringName, shares, holdingSymbol, cardBillId, backToPending, categoryIcon };
}

/**
 * 頁首的記一筆 手機也用這一顆 沒有帳戶時不顯示
 * 寬螢幕靠右 成功訊息排在按鈕下一行也靠右
 */
export async function RecordsActions() {
  const user = await requireSession();
  const [accounts, categories, holdings] = await Promise.all([cachedAccounts(user.id), cachedCategories(user.id), cachedHoldings(user.id)]);
  const options = entryFormOptions(accounts, categories, taipeiToday(new Date()), accountsWithHoldings(holdings));
  if (options.accounts.length === 0) return null;
  return (
    <div className="button-row sm:justify-end">
      <QuickAddButton {...options} />
    </div>
  );
}

/** 先 requireSession 再讀自己的資料 */
export async function RecordsSection({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const now = new Date();
  const current = taipeiMonthKey(now);
  const params = await searchParams;
  const month = resolveMonth(params.month, current);
  const [accounts, categories, flows, transactions, totals, rules, holdings] = await Promise.all([
    cachedAccounts(user.id),
    cachedCategories(user.id),
    cachedAccountFlows(user.id),
    cachedMonthTransactions(user.id, month),
    cachedCategoryTotals(user.id),
    cachedRecurring(user.id),
    cachedHoldings(user.id),
  ]);

  if (accounts.length === 0) {
    return (
      <p className="text-ink">
        還沒有帳戶。
        <Link href={SAVINGS_PATHS.addAccount} className="link">
          新增帳戶
        </Link>
      </p>
    );
  }

  const today = taipeiToday(now);
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const iconById = new Map(categories.map((category) => [category.id, category.icon]));
  const withHoldings = accountsWithHoldings(holdings);
  return (
    <RecordList
      records={transactions.map((view) => toRecordItem(view, ruleById, iconById))}
      accounts={accounts.map((account) => ({ id: account.id, name: account.name, kind: account.kind, active: account.active, ...formExtras(account), withHoldings: withHoldings.has(account.id) }))}
      categories={categoryOptions(categories)}
      today={today}
      monthSwitcher={<MonthSwitcher month={month} current={current} options={selectableMonths(current, earliestFlowMonth(flows), month)} />}
      monthLabel={periodLabel(month, current)}
      month={{ totals: monthTotals(totals, month), expenses: expenseRows(categories, totals, month) }}
      initialAccount={accountFilterFrom(params.account, accounts)}
      initialCategory={categoryFilterFrom(params.category, categories)}
    />
  );
}

/** 跟載入完的版面排得一樣 串流進來時才不會跳 */
function RecordsSkeleton() {
  return (
    <LoadingState label="載入紀錄…" className="stack xl:max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Skeleton className="h-11 w-64 rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg lg:w-96" />
      </div>
      <Skeleton className="h-5 w-56" />
      <div className="card divide-y divide-line p-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-row flex min-h-14 items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className={`h-4 ${i % 2 === 0 ? "w-1/3" : "w-1/4"}`} />
              <Skeleton className="h-3.5 w-1/5" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function RecordsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <SavingsPageFrame
      info={info}
      current="records"
      actions={
        <StreamSection fallback={<Skeleton className="h-11 w-28 rounded-lg" />}>
          <RecordsActions />
        </StreamSection>
      }
    >
      <StreamSection fallback={<RecordsSkeleton />}>
        <RecordsSection searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}
