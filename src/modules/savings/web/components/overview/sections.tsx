import Link from "next/link";
import type { ReactNode } from "react";
import { requireModule } from "@/core/auth";
import { taipeiMonthKey } from "@/core/time";
import { Fact, FactList } from "@/core/ui/fact-list";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import { formatSlashDate } from "../../../lib/dates";
import { formatSignedTwd, formatTwd } from "../../../lib/money";
import { cachedAccounts, cachedCategories, cachedCategoryTotals, cachedRecurring } from "../../../service/cached";
import { categoryOptions, salaryAccountOptions } from "../../dashboard-view";
import { loadAccounts, loadChecklist } from "../../overview-data";
import { checklistRows, checklistSummary, heroView, monthView, quickActionsView, type HeroView } from "../../overview-view";
import { SAVINGS_PATHS, recordsHref } from "../../paths";
import { ExpenseList } from "../dashboard/expense-list";
import { BIG_FIGURE, BIG_FIGURE_FACTS } from "../dashboard/layout";
import { TrendChart } from "../dashboard/trend-chart";
import { flowSeries } from "../dashboard/trend-model";
import { SalaryMenu } from "../forms/salary-dialog";
import { Illustration } from "../illustration";
import { MonthChecklist } from "./month-checklist";
import { QuickActions } from "./quick-actions";

// 每一區各自讀資料與串流 慢或出錯只影響那一區
// 都先 requireModule 再讀 重複的快取讀取會合併 不會多查資料庫

/** 一頁只有一個大數字 旁邊是各類帳戶的合計 各一列 */
export async function HeroSection() {
  const user = await requireModule("savings");
  const { input, state } = await loadAccounts(user.id, new Date());
  const hero = heroView(input, state);
  return (
    <section aria-labelledby="fin-total" className={`fin-hero card ${BIG_FIGURE}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="fin-total" className="text-ink-soft">
          總資產
        </h2>
        <p className="text-4xl font-bold tracking-tight text-ink tabular-nums sm:text-5xl">{formatTwd(hero.total)}</p>
      </div>
      <HeroFacts hero={hero} />
    </section>
  );
}

function HeroFacts({ hero: { deposit, investment, cardOwed } }: { hero: HeroView }) {
  if (deposit === null && investment === null && cardOwed === null) return null;
  return (
    <FactList className={BIG_FIGURE_FACTS}>
      {deposit !== null && <Fact label="存款">{money(formatTwd(deposit))}</Fact>}
      {investment !== null && <Fact label="投資">{money(formatTwd(investment.value))}</Fact>}
      {investment !== null && <ProfitFact investment={investment} />}
      {cardOwed !== null && <Fact label="信用卡未繳">{money(formatTwd(cardOwed))}</Fact>}
    </FactList>
  );
}

/** 讀不到股價時市值是先用成本算的 不寫損益 */
function ProfitFact({ investment }: { investment: NonNullable<HeroView["investment"]> }) {
  if (!investment.priced) return <Fact label="股價">暫時讀不到</Fact>;
  const label = investment.quoteDate === null ? "損益" : `損益（${formatSlashDate(investment.quoteDate)} 收盤）`;
  return <Fact label={label}>{money(formatSignedTwd(investment.profit))}</Fact>;
}

const money = (text: string) => <span className="font-semibold text-ink tabular-nums">{text}</span>;

/** 常用的動作 臨時的獎金這類不在每月固定裡的薪水收在 ⋮ */
export async function QuickActionsSection() {
  const user = await requireModule("savings");
  const [{ input, state }, categories, rules] = await Promise.all([loadAccounts(user.id, new Date()), cachedCategories(user.id), cachedRecurring(user.id)]);
  return (
    <QuickActions
      view={quickActionsView(input, state, categories, rules)}
      menu={<SalaryMenu accounts={salaryAccountOptions(input.accounts, state.balances, state.withHoldings)} categories={categoryOptions(categories)} today={input.today} />}
    />
  );
}

/** 做完的打勾留著 沒有任何固定收支與信用卡時先請他去設定 */
export async function ChecklistSection() {
  const user = await requireModule("savings");
  const view = await loadChecklist(user.id, new Date());
  const rows = checklistRows(view);
  const { remaining } = checklistSummary(view.items);

  return (
    <section aria-labelledby="fin-checklist" className="card stack @container min-w-0 overflow-hidden">
      <CardHeader id="fin-checklist" actions={view.configured && <span className="text-sm font-medium text-ink-soft">{remaining > 0 ? `還有 ${remaining} 件要做` : "都做完了"}</span>}>
        這個月要做的事
      </CardHeader>
      {!view.configured ? (
        <IllustratedNote illustration="no-recurring" text="還沒有固定收支與信用卡。設定薪水、房租這類每個月都有的事，到期時會列在這裡提醒你。">
          <Link href={SAVINGS_PATHS.recurring} className="btn-secondary">
            設定薪水與每月固定
            <Icon name="chevron-right" className="size-4" />
          </Link>
        </IllustratedNote>
      ) : (
        <>
          {remaining === 0 && <IllustratedNote illustration="all-done" text={rows.length === 0 ? "這個月沒有要做的事。" : "這個月要做的都做完了。"} />}
          {rows.length > 0 && <MonthChecklist rows={rows} payFromAccounts={view.payFromAccounts} salaryAccounts={view.salaryAccounts} categories={view.categories} today={view.today} />}
        </>
      )}
    </section>
  );
}

function IllustratedNote({ illustration, text, children }: { illustration: "no-recurring" | "all-done"; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Illustration name={illustration} className="w-24 shrink-0" />
      <div className="flex min-w-48 flex-1 flex-col items-start gap-3">
        <p className="text-ink">{text}</p>
        {children}
      </div>
    </div>
  );
}

/** 收入支出與存下各一列 支出分類照金額排 點一列到紀錄頁篩好那個分類 */
export async function MonthSection() {
  const user = await requireModule("savings");
  const [categories, totals] = await Promise.all([cachedCategories(user.id), cachedCategoryTotals(user.id)]);
  const month = monthView(categories, totals, taipeiMonthKey(new Date()));
  return (
    <section aria-labelledby="fin-month" className="card stack min-w-0 overflow-hidden">
      <CardHeader
        id="fin-month"
        actions={
          <Link href={recordsHref()} className="card-header-link">
            全部紀錄
            <Icon name="chevron-right" className="size-4" />
          </Link>
        }
      >
        本月收支
      </CardHeader>
      <FactList>
        <Fact label="收入">{money(formatSignedTwd(month.income))}</Fact>
        <Fact label="支出">{money(formatTwd(month.expense))}</Fact>
        {/* 存下是負的就是花得比賺得多 寫成多花才不會看成少了負號 */}
        <Fact label={month.saved < 0 ? "多花" : "存下"}>{money(formatTwd(Math.abs(month.saved)))}</Fact>
      </FactList>
      {month.rows.length === 0 ? <p className="text-ink-soft">本月還沒有支出</p> : <ExpenseList rows={month.rows} />}
    </section>
  );
}

/** 到本月為止最多 12 個月 從帳戶建立或第一筆紀錄的月份開始 */
export async function TrendSection() {
  const user = await requireModule("savings");
  const [accounts, totals] = await Promise.all([cachedAccounts(user.id), cachedCategoryTotals(user.id)]);
  const current = taipeiMonthKey(new Date());
  return <TrendChart points={flowSeries(totals, accounts.map((account) => taipeiMonthKey(account.createdAt)), current)} current={current} />;
}
