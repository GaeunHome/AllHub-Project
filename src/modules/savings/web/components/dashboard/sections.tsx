import Link from "next/link";
import type { CSSProperties } from "react";
import { requireSession } from "@/core/auth";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { CardHeader, SectionTitle } from "@/core/ui/page-header";
import { StatusChip } from "@/core/ui/status-chip";
import { taipeiToday } from "../../../lib/dates";
import { accountBalances, assetSlices, assetSummary, budgetRows, creditCardStatuses, earliestFlowMonth, expenseSlices, monthTotals, negativeAccounts, targetProgress, trendSeries, type AssetScope } from "../../../lib/ledger";
import { formatSignedTwd } from "../../../lib/money";
import { selectableMonths, taipeiMonth, type MonthKey } from "../../../lib/month";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedCategoryTotals, cachedMonthTransactions, cachedPurposes } from "../../../service/cached";
import { activeAccountsInOrder, entryFormOptions, excludedNote, expenseRecords, periodLabel, salaryAccountOptions } from "../../dashboard-view";
import { QuickAddButton, QuickAddFab } from "../forms/quick-add";
import { SalaryButton } from "../forms/salary-dialog";
import { MonthSwitcher } from "../month-switcher";
import { AccountCard } from "./account-card";
import { AssetDonutCard } from "./asset-donut-card";
import { BudgetList } from "./budget-list";
import { ExpenseDonutCard } from "./expense-donut-card";
import { KpiRow } from "./kpi-row";
import { ACCOUNT_GRID, balancedColumns } from "./layout";
import { TrendChart } from "./trend-chart";
import { TREND_TITLE } from "./trend-model";
import { SAVINGS_PATHS } from "../../paths";

// 每一區各自讀資料與串流 慢或出錯只影響那一區
// 都先 requireSession 再讀 重複的快取讀取會合併 不會多查資料庫

/** month 是總覽選到的月份 current 是台北時間的這個月 */
export type SectionProps = { month: MonthKey; current: MonthKey };

/** 過去的月份那時錢還在 停用的帳戶也算 本月只算啟用中的 */
const scopeOf = ({ month, current }: SectionProps): AssetScope => (month < current ? "all" : "active");

export async function DashboardToolbar({ month, current }: SectionProps) {
  const user = await requireSession();
  const [accounts, categories, flows] = await Promise.all([cachedAccounts(user.id), cachedCategories(user.id), cachedAccountFlows(user.id)]);
  const today = taipeiToday(new Date());
  const options = entryFormOptions(accounts, categories, today);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <MonthSwitcher month={month} current={current} options={selectableMonths(current, earliestFlowMonth(flows), month)} basePath={SAVINGS_PATHS.overview} />
      <div className="button-row justify-end">
        <SalaryButton accounts={salaryAccountOptions(accounts, accountBalances(accounts, flows))} categories={options.categories} today={today} />
        {/* 手機右下角已經有加號按鈕 這裡不重複 */}
        <QuickAddButton {...options} className="btn-primary max-sm:hidden" />
      </div>
    </div>
  );
}

/** 過去的月份 總資產與信用卡未繳是那個月月底的 */
export async function KpiSection({ month, current }: SectionProps) {
  const user = await requireSession();
  const [accounts, flows, totals] = await Promise.all([cachedAccounts(user.id), cachedAccountFlows(user.id), cachedCategoryTotals(user.id)]);
  const period = periodLabel(month, current);
  const scope = scopeOf({ month, current });
  const summary = assetSummary(accounts, accountBalances(accounts, flows, month), scope);
  const { income, expense, saved } = monthTotals(totals, month);
  const isCurrent = month === current;
  const asOf = isCurrent ? null : <span className="chip">{period}底</span>;
  // 那個月已有的投資帳戶才寫賺賠 之後才開的才不會多一個投資 0 元
  const hasInvestment = accounts.some((account) => (scope === "all" || account.active) && account.kind === "investment" && taipeiMonth(account.createdAt) <= month);
  const short = isCurrent && creditCardStatuses(accounts, accountBalances(accounts, flows), taipeiToday(new Date())).some((card) => card.short);

  return (
    <KpiRow
      items={[
        {
          id: "assets",
          label: "總資產",
          icon: "landmark",
          value: summary.assets,
          wide: true,
          note: (asOf || hasInvestment) && (
            <>
              {asOf}
              {hasInvestment && (
                <span className="chip tabular-nums">
                  <Icon name={summary.investmentProfit < 0 ? "trending-down" : "trending-up"} className="size-3.5" />
                  投資 {formatSignedTwd(summary.investmentProfit)}
                </span>
              )}
            </>
          ),
        },
        { id: "income", label: `${period}收入`, icon: "trending-up", value: income },
        { id: "expense", label: `${period}支出`, icon: "trending-down", value: expense },
        { id: "saved", label: `${period}存下`, icon: "piggy-bank", value: saved },
        {
          id: "owed",
          label: "信用卡未繳",
          icon: "credit-card",
          value: summary.owed,
          note: (asOf || short) && (
            <>
              {asOf}
              {short && <StatusChip badge={{ label: "有扣款帳戶不夠扣", tone: "warning" }} />}
            </>
          ),
        },
      ]}
    />
  );
}

/** 圓餅圖只畫正的餘額 負的另外寫出來 因為總資產是扣掉它們的淨值 */
export async function AssetSection({ month, current }: SectionProps) {
  const user = await requireSession();
  const [accounts, purposes, flows] = await Promise.all([cachedAccounts(user.id), cachedPurposes(user.id), cachedAccountFlows(user.id)]);
  const scope = scopeOf({ month, current });
  const balances = accountBalances(accounts, flows, month);
  const byPurpose = assetSlices("purpose", accounts, purposes, balances, scope);
  const excluded = negativeAccounts(accounts, balances, scope).map(({ name, balance }) => ({ name, balance }));
  const title = month === current ? "資產分布" : `資產分布・${periodLabel(month, current)}底`;

  if (byPurpose.length === 0) {
    return (
      <section aria-labelledby="fin-assets" className="card stack min-w-0">
        <CardHeader id="fin-assets" icon={<Icon name="chart-pie" />}>
          {title}
        </CardHeader>
        <EmptyState compact icon="chart-pie" title="還沒有資產可以顯示" hint={excluded.length > 0 ? excludedNote(excluded) : "存款或投資帳戶有餘額後，這裡會畫出資產的分布"} />
      </section>
    );
  }
  return <AssetDonutCard title={title} byPurpose={byPurpose} byAccount={assetSlices("account", accounts, purposes, balances, scope)} excluded={excluded} />;
}

/** 那個月的支出紀錄一起送到瀏覽器 點一片時在瀏覽器篩選 不必再問伺服器 */
export async function ExpenseSection({ month, current }: SectionProps) {
  const user = await requireSession();
  const [categories, totals, transactions] = await Promise.all([cachedCategories(user.id), cachedCategoryTotals(user.id), cachedMonthTransactions(user.id, month)]);
  const period = periodLabel(month, current);
  const slices = expenseSlices(categories, totals, month);
  const title = `${period}支出分類`;
  const isCurrent = month === current;

  if (slices.length === 0) {
    return (
      <section aria-labelledby="fin-expenses" className="card stack min-w-0">
        <CardHeader id="fin-expenses" icon={<Icon name="receipt" />}>
          {title}
        </CardHeader>
        {/* 不放記一筆 工具列已經有 記了之後這裡會換成圓餅圖 訊息與焦點會跟著不見 */}
        <EmptyState compact icon="receipt" title={isCurrent ? "本月還沒有支出" : `${period}沒有支出`} hint={isCurrent ? "記一筆支出後，這裡會照分類畫出比例" : undefined} />
      </section>
    );
  }
  return (
    <ExpenseDonutCard
      title={title}
      slices={slices}
      total={monthTotals(totals, month).expense}
      totalLabel={`${period}支出`}
      records={expenseRecords(transactions, categories)}
      period={period}
      month={isCurrent ? null : month}
    />
  );
}

/** 一律是目前的餘額 記一筆與更新餘額都是現在的事 看過去的月份時在標題旁寫明 */
export async function AccountsSection({ month, current }: SectionProps) {
  const user = await requireSession();
  const [accounts, purposes, categories, flows] = await Promise.all([cachedAccounts(user.id), cachedPurposes(user.id), cachedCategories(user.id), cachedAccountFlows(user.id)]);
  const today = taipeiToday(new Date());
  const balances = accountBalances(accounts, flows);
  const active = activeAccountsInOrder(accounts);
  const options = entryFormOptions(accounts, categories, today);
  const cards = new Map(creditCardStatuses(accounts, balances, today).map((card) => [card.accountId, card]));
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const purposeById = new Map(purposes.map((purpose) => [purpose.id, purpose]));

  return (
    <section aria-labelledby="fin-accounts" className="stack">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SectionTitle id="fin-accounts" icon="wallet">
          帳戶
        </SectionTitle>
        {month !== current && <span className="chip">目前餘額</span>}
      </div>
      {active.length === 0 ? (
        <EmptyState
          compact
          icon="landmark"
          title="沒有啟用中的帳戶"
          hint="停用的帳戶不算進總覽，紀錄還留著"
          action={
            <Link href={SAVINGS_PATHS.accounts} className="btn-secondary">
              管理帳戶
            </Link>
          }
        />
      ) : (
        <div className={ACCOUNT_GRID} style={{ "--fin-cols": balancedColumns(active.length) } as CSSProperties}>
          {active.map((account, i) => {
            const balance = balances.get(account.id) ?? { balance: 0, cost: null, profit: null, owed: null };
            const card = cards.get(account.id) ?? null;
            return (
              <AccountCard
                key={account.id}
                account={account}
                balance={balance}
                purpose={account.purposeId === null ? null : (purposeById.get(account.purposeId) ?? null)}
                progress={account.kind === "credit" ? null : targetProgress(account.targetAmount, balance.balance)}
                card={card}
                payFromName={card && card.payFromAccountId !== null ? (names.get(card.payFromAccountId) ?? null) : null}
                options={options}
                index={i}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export async function BudgetSection({ month, current }: SectionProps) {
  const user = await requireSession();
  const [categories, totals] = await Promise.all([cachedCategories(user.id), cachedCategoryTotals(user.id)]);
  const rows = budgetRows(categories, totals, month);

  return (
    <section aria-labelledby="fin-budget" className="card stack @container min-w-0">
      <CardHeader id="fin-budget" icon={<Icon name="target" />}>
        {periodLabel(month, current)}預算
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon="target"
          title="還沒有設定預算"
          hint="在支出分類設定每月預算，這裡會顯示花了多少"
          action={
            <Link href={SAVINGS_PATHS.categories} className="btn-secondary">
              設定預算
            </Link>
          }
        />
      ) : (
        <BudgetList rows={rows} />
      )}
    </section>
  );
}

/**
 * 一律到本月為止最多 12 個月 不跟著切換的月份移動 選到的月份標成目前
 * 本月以前的月底資產連現在停用的帳戶也算
 */
export async function TrendSection({ month, current }: SectionProps) {
  const user = await requireSession();
  const [accounts, flows, totals] = await Promise.all([cachedAccounts(user.id), cachedAccountFlows(user.id), cachedCategoryTotals(user.id)]);
  const points = trendSeries(accounts, flows, totals, current, 12, current);
  if (points.length === 0) {
    return (
      <section aria-labelledby="fin-trend" className="card stack min-w-0">
        <CardHeader id="fin-trend" icon={<Icon name="chart-column" />}>
          {TREND_TITLE}
        </CardHeader>
        <EmptyState compact icon="chart-column" title="還沒有紀錄" />
      </section>
    );
  }
  return <TrendChart points={points} selected={month} />;
}

export async function QuickAddFabSection() {
  const user = await requireSession();
  const [accounts, categories] = await Promise.all([cachedAccounts(user.id), cachedCategories(user.id)]);
  return <QuickAddFab {...entryFormOptions(accounts, categories, taipeiToday(new Date()))} />;
}
