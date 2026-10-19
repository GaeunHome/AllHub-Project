import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/core/auth";
import { taipeiMonthKey } from "@/core/time";
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
import { TrendChart } from "../dashboard/trend-chart";
import { flowSeries } from "../dashboard/trend-model";
import { SalaryMenu } from "../forms/salary-dialog";
import { Illustration } from "../illustration";
import { MonthChecklist } from "./month-checklist";
import { QuickActions } from "./quick-actions";

// 每一區各自讀資料與串流 慢或出錯只影響那一區
// 都先 requireSession 再讀 重複的快取讀取會合併 不會多查資料庫

/** 一頁只有一個大數字 下面一行寫各類帳戶的合計 */
export async function HeroSection() {
  const user = await requireSession();
  const { input, state } = await loadAccounts(user.id, new Date());
  const hero = heroView(input, state);
  return (
    <section aria-labelledby="fin-total" className="fin-hero card flex min-w-0 flex-col justify-center gap-1">
      <h2 id="fin-total" className="text-ink-soft">
        總資產
      </h2>
      <p className="text-4xl font-bold tracking-tight text-ink tabular-nums sm:text-5xl">{formatTwd(hero.total)}</p>
      <HeroParts hero={hero} />
    </section>
  );
}

function HeroParts({ hero }: { hero: HeroView }) {
  const parts = [
    hero.deposit !== null && <span key="deposit">存款 {money(formatTwd(hero.deposit))}</span>,
    hero.investment !== null && (
      <span key="investment">
        投資 {money(formatTwd(hero.investment.value))}（{hero.investment.priced ? `損益 ${formatSignedTwd(hero.investment.profit)}` : "股價暫時讀不到"}
        {hero.investment.priced && hero.investment.quoteDate !== null && `，${formatSlashDate(hero.investment.quoteDate)} 收盤`}）
      </span>
    ),
    hero.cardOwed !== null && <span key="credit">信用卡未繳 {money(formatTwd(hero.cardOwed))}</span>,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-1 text-ink-soft">
      {parts.flatMap((part, i) =>
        i === 0
          ? [part]
          : [
              <span key={`dot-${i}`} aria-hidden>
                ·
              </span>,
              part,
            ],
      )}
    </p>
  );
}

const money = (text: string) => <span className="font-semibold text-ink tabular-nums">{text}</span>;

/** 常用的動作 臨時的獎金這類不在每月固定裡的薪水收在 ⋮ */
export async function QuickActionsSection() {
  const user = await requireSession();
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
  const user = await requireSession();
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

/** 收入支出與存下寫成一行 支出分類照金額排 點一列到紀錄頁篩好那個分類 */
export async function MonthSection() {
  const user = await requireSession();
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
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-ink-soft">
        <span>收入 {money(formatSignedTwd(month.income))}</span>
        <span aria-hidden>·</span>
        <span>支出 {money(formatTwd(month.expense))}</span>
        <span aria-hidden>·</span>
        {/* 存下是負的就是花得比賺得多 寫成多花才不會看成少了負號 */}
        <span>
          {month.saved < 0 ? "多花" : "存下"} {money(formatTwd(Math.abs(month.saved)))}
        </span>
      </p>
      {month.rows.length === 0 ? <p className="text-ink-soft">本月還沒有支出</p> : <ExpenseList rows={month.rows} />}
    </section>
  );
}

/** 到本月為止最多 12 個月 從帳戶建立或第一筆紀錄的月份開始 */
export async function TrendSection() {
  const user = await requireSession();
  const [accounts, totals] = await Promise.all([cachedAccounts(user.id), cachedCategoryTotals(user.id)]);
  const current = taipeiMonthKey(new Date());
  return <TrendChart points={flowSeries(totals, accounts.map((account) => taipeiMonthKey(account.createdAt)), current)} current={current} />;
}
