import Link from "next/link";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { earliestFlowMonth } from "../../lib/ledger";
import { resolveMonth, selectableMonths, taipeiMonth } from "../../lib/month";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedMonthTransactions } from "../../service/cached";
import type { TransactionView } from "../../service/transactions";
import { QuickAddButton, QuickAddFab } from "../components/forms/quick-add";
import type { SearchParams } from "../components/month-href";
import { MonthSwitcher } from "../components/month-switcher";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { RecordList } from "../components/records/record-list";
import { entryFormOptions, formExtras, periodLabel } from "../dashboard-view";
import { SAVINGS_PATHS } from "../paths";
import { categoryFilterFrom, type RecordItem } from "../record-filter";

/** 只交給瀏覽器畫面用得到的欄位 不帶 userId 與 createdAt */
function toRecordItem(view: TransactionView): RecordItem {
  const { id, kind, accountId, accountName, counterAccountId, counterAccountName, categoryId, categoryName, categoryColor, amount, date, note, recurring } = view;
  return { id, kind, accountId, accountName, counterAccountId, counterAccountName, categoryId, categoryName, categoryColor, amount, date, note, recurring };
}

/** 先 requireSession 再讀自己的資料 */
export async function RecordsSection({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const now = new Date();
  const current = taipeiMonth(now);
  const params = await searchParams;
  const month = resolveMonth(params.month, current);
  const [accounts, categories, flows, transactions] = await Promise.all([
    cachedAccounts(user.id),
    cachedCategories(user.id),
    cachedAccountFlows(user.id),
    cachedMonthTransactions(user.id, month),
  ]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="wallet"
        title="還沒有帳戶"
        hint="先新增存款、投資或信用卡帳戶，就可以開始記帳。"
        action={
          <Link href={SAVINGS_PATHS.addAccount} className="btn-primary">
            <Icon name="plus" className="size-4" />
            新增帳戶
          </Link>
        }
      />
    );
  }

  const today = taipeiToday(now);
  const options = entryFormOptions(accounts, categories, today);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} current={current} options={selectableMonths(current, earliestFlowMonth(flows), month)} basePath={SAVINGS_PATHS.records} />
        <div className="button-row">
          <QuickAddButton {...options} />
        </div>
      </div>
      <RecordList
        records={transactions.map(toRecordItem)}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name, kind: account.kind, active: account.active, ...formExtras(account) }))}
        categories={options.categories}
        today={today}
        monthLabel={periodLabel(month, current)}
        initialCategory={categoryFilterFrom(params.category, categories)}
      />
      <QuickAddFab {...options} />
    </>
  );
}

/** 跟載入完的版面排得一樣 串流進來時才不會跳 */
function RecordsSkeleton() {
  return (
    <LoadingState label="載入紀錄…" className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-11 w-64 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <div className="stack">
        <div className="grid grid-cols-3 gap-2 xl:max-w-3xl">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
        <div className="card divide-y divide-line p-0">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-row flex items-center gap-3">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className={`h-4 ${i % 2 === 0 ? "w-1/3" : "w-1/4"}`} />
                <Skeleton className="h-3.5 w-1/5" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </LoadingState>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function RecordsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="records">
      <StreamSection fallback={<RecordsSkeleton />}>
        <RecordsSection searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}
