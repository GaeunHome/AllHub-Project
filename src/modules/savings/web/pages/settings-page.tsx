import { Suspense, type ReactNode } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { taipeiToday } from "../../lib/dates";
import { nextRunDate } from "../../lib/recurring";
import { cachedAccountFlows, cachedAccounts, cachedCategories, cachedPurposes, cachedRecurring } from "../../service/cached";
import { SetupResultSlot } from "../components/forms/setup-button";
import type { SearchParams } from "../components/month-href";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { SetupCard } from "../components/setup-card";
import { AccountsCard, type AccountItem } from "../components/settings/accounts-card";
import { CategoriesCard } from "../components/settings/categories-card";
import { PurposesCard } from "../components/settings/purposes-card";
import { RecurringCard, type RecurringItem } from "../components/settings/recurring-card";

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
  const purposeById = new Map(purposes.map((purpose) => [purpose.id, purpose]));
  const nameById = new Map(accounts.map((account) => [account.id, account.name]));
  const items: AccountItem[] = accounts.map((account) => {
    const purpose = account.purposeId === null ? undefined : purposeById.get(account.purposeId);
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      purposeId: account.purposeId,
      openingBalance: account.openingBalance,
      openingCost: account.openingCost,
      monthlyPlan: account.monthlyPlan,
      targetAmount: account.targetAmount,
      dueDay: account.dueDay,
      payFromAccountId: account.payFromAccountId,
      active: account.active,
      purposeName: purpose?.name ?? null,
      purposeColor: purpose?.color ?? null,
      payFromName: account.payFromAccountId === null ? null : (nameById.get(account.payFromAccountId) ?? null),
      // 刪除帳戶會連紀錄與固定收支一起刪 確認時要說
      // 筆數要另外查 這裡只看有沒有
      recurringCount: rules.filter((rule) => rule.accountId === account.id || rule.counterAccountId === account.id).length,
      hasRecords: flows.some((flow) => flow.accountId === account.id),
      hasTransfers: flows.some((flow) => flow.accountId === account.id && (flow.transferIn > 0 || flow.transferOut > 0)),
    };
  });
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

export async function RecurringLoader() {
  const user = await requireSession();
  const [rules, accounts, categories] = await Promise.all([cachedRecurring(user.id), cachedAccounts(user.id), cachedCategories(user.id)]);
  const today = taipeiToday(new Date());
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const items: RecurringItem[] = rules.map((rule) => {
    const account = accountById.get(rule.accountId);
    const counter = rule.counterAccountId === null ? undefined : accountById.get(rule.counterAccountId);
    const category = rule.categoryId === null ? undefined : categoryById.get(rule.categoryId);
    return {
      id: rule.id,
      kind: rule.kind,
      accountId: rule.accountId,
      counterAccountId: rule.counterAccountId,
      categoryId: rule.categoryId,
      amount: rule.amount,
      dayOfMonth: rule.dayOfMonth,
      note: rule.note,
      active: rule.active,
      lastPostedMonth: rule.lastPostedMonth,
      createdAt: rule.createdAt.toISOString(),
      accountName: account?.name ?? "",
      counterAccountName: counter?.name ?? null,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      nextDate: rule.active ? nextRunDate(rule, today) : null,
      // 帳戶或轉入的帳戶停用時排程會略過
      accountPaused: account?.active === false || counter?.active === false,
    };
  });
  return (
    <RecurringCard
      rules={items}
      accounts={accounts.map(({ id, name, kind, active, payFromAccountId }) => ({ id, name, kind, active, payFromAccountId }))}
      categories={categories.map(({ id, name, kind, color }) => ({ id, name, kind, color }))}
      today={today}
    />
  );
}

/**
 * 跟載入完成的卡片一樣高 每一列跟真的一樣是兩行字 70px
 * 串流進來時下面的卡片才不會跳
 */
function CardSkeleton({ label, rows, segmented = false }: { label: string; rows: number; segmented?: boolean }) {
  return (
    <LoadingState label={label} className="card stack">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-xl" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      {segmented && <Skeleton className="h-11 w-full rounded-lg" />}
      <div className="card-list">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="card-row flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <Skeleton className={`h-5 ${i % 2 === 0 ? "w-2/5" : "w-1/3"}`} />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
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
      {/* 寬螢幕兩欄 左邊帳戶與用途 右邊分類與固定收支 */}
      <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
        <div className="page-stack">
          <Card id="accounts" fallback={<CardSkeleton label="載入帳戶…" rows={4} />}>
            <AccountsLoader searchParams={searchParams} />
          </Card>
          <Card id="purposes" fallback={<CardSkeleton label="載入用途…" rows={3} />}>
            <PurposesLoader />
          </Card>
        </div>
        <div className="page-stack">
          <Card id="categories" fallback={<CardSkeleton label="載入分類…" rows={4} segmented />}>
            <CategoriesLoader />
          </Card>
          <Card id="recurring" fallback={<CardSkeleton label="載入固定收支…" rows={3} />}>
            <RecurringLoader />
          </Card>
        </div>
      </div>
    </SavingsPageFrame>
  );
}
