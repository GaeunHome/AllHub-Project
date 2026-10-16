import Link from "next/link";
import { requireSession } from "@/core/auth";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { taipeiToday } from "../../../lib/dates";
import { accountsWithHoldings } from "../../../lib/holdings";
import { monthTotals } from "../../../lib/ledger";
import { formatTwd } from "../../../lib/money";
import { taipeiMonth } from "../../../lib/month";
import { cachedAccounts, cachedCategories, cachedCategoryTotals, cachedHoldings, cachedPurposes, cachedRecurring } from "../../../service/cached";
import { accountGroups, categoryOptions, depositOptions, entryFormOptions, expenseRows, pendingEntries, recordsHref, salaryAccountOptions, settlementAccounts } from "../../dashboard-view";
import { loadAccounts, loadPending } from "../../overview-data";
import { AccountList } from "../accounts/account-list";
import { QuickAddButton } from "../forms/quick-add";
import { SalaryMenu } from "../forms/salary-dialog";
import { PendingList } from "../pending/pending-list";
import { ExpenseList } from "./expense-list";
import { TrendChart } from "./trend-chart";
import { flowSeries } from "./trend-model";

// 每一區各自讀資料與串流 慢或出錯只影響那一區
// 都先 requireSession 再讀 重複的快取讀取會合併 不會多查資料庫

/** 頁首的記一筆 是這一頁唯一的主要按鈕 手機也用它 */
export async function OverviewQuickAdd() {
  const user = await requireSession();
  const [accounts, categories, holdings] = await Promise.all([cachedAccounts(user.id), cachedCategories(user.id), cachedHoldings(user.id)]);
  return <QuickAddButton {...entryFormOptions(accounts, categories, taipeiToday(new Date()), accountsWithHoldings(holdings))} />;
}

/** 頁首 ⋮ 裡的薪水入帳並分配 建議金額看目前的餘額 */
export async function OverviewSalaryMenu() {
  const user = await requireSession();
  const [{ input, state }, categories] = await Promise.all([loadAccounts(user.id, new Date()), cachedCategories(user.id)]);
  return <SalaryMenu accounts={salaryAccountOptions(input.accounts, state.balances, state.withHoldings)} categories={categoryOptions(categories)} today={input.today} />;
}

/** 一頁只有一個大數字 本月的收支寫成一行 */
export async function SummarySection() {
  const user = await requireSession();
  const now = new Date();
  const [{ state }, totals] = await Promise.all([loadAccounts(user.id, now), cachedCategoryTotals(user.id)]);
  const { income, expense, saved } = monthTotals(totals, taipeiMonth(now));
  return (
    <section aria-labelledby="fin-total" className="flex flex-col gap-1">
      <h2 id="fin-total" className="text-sm text-ink-soft">
        總資產
      </h2>
      <p className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">{formatTwd(state.totalAssets)}</p>
      <p className="flex flex-wrap gap-x-2 text-sm text-ink-soft">
        <span>本月</span>
        <span>
          收入 <span className="font-medium text-ink">{formatTwd(income)}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          支出 <span className="font-medium text-ink">{formatTwd(expense)}</span>
        </span>
        <span aria-hidden>·</span>
        {/* 存下是負的就是花得比賺得多 寫成多花才不會看成少了負號 */}
        <span>
          {saved < 0 ? "多花" : "存下"} <span className="font-medium text-ink">{formatTwd(Math.abs(saved))}</span>
        </span>
      </p>
    </section>
  );
}

/** 沒有要處理的就整區不出現 */
export async function PendingSection() {
  const user = await requireSession();
  const { input, state, rules, categories, items } = await loadPending(user.id, new Date());
  if (items.length === 0) return null;
  return (
    <PendingList
      entries={pendingEntries(items, { accounts: input.accounts, rules, holdings: input.holdings, quotes: input.quotes, categories, today: input.today })}
      payFromAccounts={depositOptions(input.accounts)}
      salaryAccounts={salaryAccountOptions(input.accounts, state.balances, state.withHoldings)}
      categories={categoryOptions(categories)}
      today={input.today}
    />
  );
}

/** 一律是目前的餘額 點一列打開帳戶詳情 */
export async function AccountsSection() {
  const user = await requireSession();
  const [{ input, state }, purposes, categories, rules] = await Promise.all([loadAccounts(user.id, new Date()), cachedPurposes(user.id), cachedCategories(user.id), cachedRecurring(user.id)]);
  return (
    <AccountList
      groups={accountGroups(input, state, purposes, settlementAccounts(rules))}
      context={{ options: entryFormOptions(input.accounts, categories, input.today, state.withHoldings), depositAccounts: depositOptions(input.accounts), today: input.today }}
    />
  );
}

/** 分類照金額排 有預算的寫已用與預算 點一列到紀錄頁篩好那個分類 */
export async function ExpenseSection() {
  const user = await requireSession();
  const [categories, totals] = await Promise.all([cachedCategories(user.id), cachedCategoryTotals(user.id)]);
  const rows = expenseRows(categories, totals, taipeiMonth(new Date()));
  return (
    <section aria-labelledby="fin-expenses" className="card stack min-w-0 overflow-hidden">
      <CardHeader
        id="fin-expenses"
        actions={
          <Link href={recordsHref()} className="card-header-link">
            全部紀錄
            <Icon name="chevron-right" className="size-4" />
          </Link>
        }
      >
        本月支出
      </CardHeader>
      {rows.length === 0 ? <p className="text-ink-soft">本月還沒有支出</p> : <ExpenseList rows={rows} />}
    </section>
  );
}

/** 到本月為止最多 12 個月 從帳戶建立或第一筆紀錄的月份開始 */
export async function TrendSection() {
  const user = await requireSession();
  const [accounts, totals] = await Promise.all([cachedAccounts(user.id), cachedCategoryTotals(user.id)]);
  const current = taipeiMonth(new Date());
  return <TrendChart points={flowSeries(totals, accounts.map((account) => taipeiMonth(account.createdAt)), current)} current={current} />;
}
