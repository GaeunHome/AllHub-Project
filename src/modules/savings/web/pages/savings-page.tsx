import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { resolveMonth, taipeiMonth } from "../../lib/month";
import { cachedAccounts, cachedCategories, cachedPurposes } from "../../service/cached";
import { BUDGET_TREND_ROW, DONUT_ROW } from "../components/dashboard/layout";
import { AccountsSection, AssetSection, BudgetSection, DashboardToolbar, ExpenseSection, KpiSection, QuickAddFabSection, TrendSection } from "../components/dashboard/sections";
import { AccountsSkeleton, BudgetSkeleton, DonutCardSkeleton, KpiSkeleton, OverviewSkeleton, ToolbarSkeleton, TrendSkeleton } from "../components/dashboard/skeletons";
import { WelcomeCard } from "../components/dashboard/welcome";
import { SetupResultSlot } from "../components/forms/setup-button";
import type { SearchParams } from "../components/month-href";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function SavingsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="overview">
      <StreamSection fallback={<OverviewSkeleton />}>
        <SavingsOverview searchParams={searchParams} />
      </StreamSection>
    </SavingsPageFrame>
  );
}

/** 還沒有帳戶時整個總覽換成歡迎卡 */
export async function SavingsOverview({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession();
  const [accounts, purposes, categories] = await Promise.all([cachedAccounts(user.id), cachedPurposes(user.id), cachedCategories(user.id)]);
  if (accounts.length === 0) {
    // 按了開始使用後歡迎卡會換掉 訊息與焦點留在不會消失的外框裡
    return (
      <SetupResultSlot>
        <WelcomeCard firstTime={purposes.length === 0 && categories.length === 0} />
      </SetupResultSlot>
    );
  }

  const current = taipeiMonth(new Date());
  const props = { month: resolveMonth((await searchParams).month, current), current };
  // 過去的月份有月底標籤 總資產另外有投資賺賠
  // 骨架先留好位置 載入完下面才不會往下跳
  const past = props.month !== current;
  const notes = { assets: past || accounts.some((account) => account.active && account.kind === "investment"), owed: past };
  return (
    <>
      <StreamSection fallback={<ToolbarSkeleton />}>
        <DashboardToolbar {...props} />
      </StreamSection>
      <StreamSection fallback={<KpiSkeleton notes={notes} />}>
        <KpiSection {...props} />
      </StreamSection>
      <div className={DONUT_ROW}>
        <StreamSection fallback={<DonutCardSkeleton label="載入資產分布…" />}>
          <AssetSection {...props} />
        </StreamSection>
        <StreamSection fallback={<DonutCardSkeleton label="載入支出分類…" />}>
          <ExpenseSection {...props} />
        </StreamSection>
      </div>
      <StreamSection fallback={<AccountsSkeleton />}>
        <AccountsSection {...props} />
      </StreamSection>
      <div className={BUDGET_TREND_ROW}>
        <StreamSection fallback={<BudgetSkeleton />}>
          <BudgetSection {...props} />
        </StreamSection>
        <StreamSection fallback={<TrendSkeleton />}>
          <TrendSection {...props} />
        </StreamSection>
      </div>
      {/* 手機右下角的加號按鈕 讀不到時也只影響它自己 */}
      <StreamSection fallback={null}>
        <QuickAddFabSection />
      </StreamSection>
    </>
  );
}
