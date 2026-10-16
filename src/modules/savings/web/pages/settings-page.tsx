import { Suspense, type ReactNode } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { accountsWithHoldings } from "../../lib/holdings";
import { parseRowId } from "../../lib/validation";
import { nextRunDate, recurringTitle, scheduleText } from "../../lib/recurring";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedHoldings, cachedPurposes, cachedRecurring } from "../../service/cached";
import { SetupResultSlot } from "../components/forms/setup-button";
import type { HoldingOption } from "../components/forms/options";
import type { SearchParams } from "../components/month-href";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { SetupCard } from "../components/setup-card";
import { AccountsCard, type AccountItem } from "../components/settings/accounts-card";
import { CategoriesCard } from "../components/settings/categories-card";
import { PurposesCard } from "../components/settings/purposes-card";
import { RecurringCard, type RecurringItem } from "../components/settings/recurring-card";
import { sortByNextDate } from "../settings-display";

// 每張卡片各自讀資料各自串流 同一次請求重複讀同一份快取會自動合併

/**
 * 還沒有用途與分類時 最上面先請使用者建立預設的
 * 建好後卡片換掉 外面的位置留著放成功訊息
 */
export async function SetupNotice() {
  const user = await requireSession();
  const [purposes, categories] = await Promise.all([cachedPurposes(user.id), cachedCategories(user.id)]);
  return <SetupResultSlot>{purposes.length === 0 && categories.length === 0 && <SetupCard />}</SetupResultSlot>;
}

/** 從總覽或紀錄頁的新增帳戶連過來時帶 add 參數 打開新增的視窗 */
export async function AccountsLoader({ searchParams }: { searchParams?: SearchParams } = {}) {
  const user = await requireSession();
  const [accounts, purposes, rules, flows, params] = await Promise.all([cachedAccounts(user.id), cachedPurposes(user.id), cachedRecurring(user.id), cachedAccountFlows(user.id), searchParams]);
  const purposeNames = new Map(purposes.map((purpose) => [purpose.id, purpose.name]));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const items: AccountItem[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    purposeId: account.purposeId,
    openingBalance: account.openingBalance,
    openingCost: account.openingCost,
    monthlyPlan: account.monthlyPlan,
    targetAmount: account.targetAmount,
    dueDay: account.dueDay,
    statementDay: account.statementDay,
    payFromAccountId: account.payFromAccountId,
    autopay: account.autopay,
    active: account.active,
    purposeName: account.purposeId === null ? null : (purposeNames.get(account.purposeId) ?? null),
    payFromName: account.payFromAccountId === null ? null : (accountNames.get(account.payFromAccountId) ?? null),
    // 刪除帳戶會連紀錄與固定收支一起刪 確認時要說
    // 筆數要另外查 這裡只看有沒有
    recurringCount: rules.filter((rule) => rule.accountId === account.id || rule.counterAccountId === account.id).length,
    hasRecords: flows.some((flow) => flow.accountId === account.id),
    hasTransfers: flows.some((flow) => flow.accountId === account.id && (flow.transferIn > 0 || flow.transferOut > 0)),
  }));
  return <AccountsCard accounts={items} purposes={purposes.map(({ id, name }) => ({ id, name }))} openAdd={params?.add === "account"} />;
}

export async function PurposesLoader() {
  const user = await requireSession();
  const [purposes, accounts] = await Promise.all([cachedPurposes(user.id), cachedAccounts(user.id)]);
  return (
    <PurposesCard
      purposes={purposes.map(({ id, name, color }) => ({ id, name, color, accountCount: accounts.filter((account) => account.purposeId === id).length }))}
    />
  );
}

export async function CategoriesLoader() {
  const user = await requireSession();
  const categories = await cachedCategories(user.id);
  return <CategoriesCard categories={categories.map(({ id, name, kind, color, monthlyBudget }) => ({ id, name, kind, color, monthlyBudget }))} />;
}

/** 待處理的選單連過來時帶 recurring 參數 只打開自己的那一條 */
export async function RecurringLoader({ searchParams }: { searchParams?: SearchParams } = {}) {
  const user = await requireSession();
  const [rules, accounts, categories, holdings, params] = await Promise.all([cachedRecurring(user.id), cachedAccounts(user.id), cachedCategories(user.id), cachedHoldings(user.id), searchParams]);
  const linked = parseRowId(params?.recurring);
  const today = taipeiToday(new Date());
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const names = {
    accounts: new Map(accounts.map((account) => [account.id, account.name])),
    categories: new Map(categories.map((category) => [category.id, category.name])),
    holdingSymbols: new Map(holdings.map((holding) => [holding.id, holding.symbol])),
  };
  const items: RecurringItem[] = rules.map((rule) => {
    const account = accountById.get(rule.accountId);
    const counter = rule.counterAccountId === null ? undefined : accountById.get(rule.counterAccountId);
    return {
      id: rule.id,
      kind: rule.kind,
      name: rule.name,
      accountId: rule.accountId,
      counterAccountId: rule.counterAccountId,
      categoryId: rule.categoryId,
      amount: rule.amount,
      dayOfMonth: rule.dayOfMonth,
      intervalMonths: rule.intervalMonths,
      startMonth: rule.startMonth,
      holidayRule: rule.holidayRule,
      mode: rule.mode,
      holdingId: rule.holdingId,
      allocate: rule.allocate,
      note: rule.note,
      active: rule.active,
      lastPostedMonth: rule.lastPostedMonth,
      createdAt: rule.createdAt.toISOString(),
      title: recurringTitle(rule, names),
      schedule: scheduleText(rule),
      nextDate: rule.active ? nextRunDate(rule, today) : null,
      // 帳戶或轉入的帳戶停用時不會記帳 也不會列進待處理
      accountPaused: account?.active === false || counter?.active === false,
    };
  });
  // 停用的投資帳戶裡的持股只在修改原本選它的定期定額時列出來
  const holdingOptions: HoldingOption[] = holdings.flatMap((holding) => {
    const account = accountById.get(holding.accountId);
    return account?.kind === "investment" ? [{ id: holding.id, symbol: holding.symbol, name: holding.name, accountId: holding.accountId, accountName: account.name, active: account.active }] : [];
  });
  const withHoldings = accountsWithHoldings(holdings);
  return (
    <RecurringCard
      rules={sortByNextDate(items)}
      openId={rules.some((rule) => rule.id === linked) ? linked : null}
      accounts={accounts.map(({ id, name, kind, active, payFromAccountId }) => ({ id, name, kind, active, payFromAccountId, withHoldings: withHoldings.has(id) }))}
      categories={categories.map(({ id, name, kind }) => ({ id, name, kind }))}
      holdings={holdingOptions}
      today={today}
    />
  );
}

/**
 * 跟載入完成的卡片一樣高 每一列跟真的一樣是兩行字
 * 串流進來時下面的卡片才不會跳
 */
function CardSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <LoadingState label={label} className="card stack">
      <div className="flex min-h-9 items-center gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="ml-auto h-9 w-20 rounded-lg" />
      </div>
      <div className="card-list">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="card-row flex min-h-14 items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className={`h-4 ${i % 2 === 0 ? "w-2/5" : "w-1/3"}`} />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
            <Skeleton className="size-9 shrink-0 rounded-lg" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

/** 錨點放在外框上 串流還沒完成時也跳得到 */
function Card({ id, fallback, children }: { id: string; fallback: ReactNode; children: ReactNode }) {
  return (
    <div id={id}>
      <StreamSection fallback={fallback}>{children}</StreamSection>
    </div>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function SettingsPage({ info, searchParams }: { info: ModuleInfo; searchParams?: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="settings">
      <Suspense fallback={null}>
        <SetupNotice />
      </Suspense>
      {/* 手機照帳戶 固定收支 分類 用途的順序 寬螢幕左邊是錢 右邊是分類與用途 */}
      <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
        <div className="page-stack">
          <Card id="accounts" fallback={<CardSkeleton label="載入帳戶…" rows={4} />}>
            <AccountsLoader searchParams={searchParams} />
          </Card>
          <Card id="recurring" fallback={<CardSkeleton label="載入固定收支…" rows={3} />}>
            <RecurringLoader searchParams={searchParams} />
          </Card>
        </div>
        <div className="page-stack">
          <Card id="categories" fallback={<CardSkeleton label="載入分類…" rows={4} />}>
            <CategoriesLoader />
          </Card>
          <Card id="purposes" fallback={<CardSkeleton label="載入用途…" rows={3} />}>
            <PurposesLoader />
          </Card>
        </div>
      </div>
    </SavingsPageFrame>
  );
}
