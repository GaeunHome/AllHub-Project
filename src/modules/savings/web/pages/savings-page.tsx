import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { cachedAccounts, cachedCategories, cachedPurposes } from "../../service/cached";
import { OVERVIEW_COLUMNS, OVERVIEW_LEFT, OVERVIEW_RIGHT } from "../components/dashboard/layout";
import { OverviewNotice } from "../components/dashboard/overview-notice";
import { AccountsSection, ExpenseSection, OverviewQuickAdd, OverviewSalaryMenu, PendingSection, SummarySection, TrendSection } from "../components/dashboard/sections";
import { AccountsSkeleton, ButtonSkeleton, ExpenseSkeleton, OverviewSkeleton, SummarySkeleton, TrendSkeleton } from "../components/dashboard/skeletons";
import { WelcomeCard } from "../components/dashboard/welcome";
import { SetupResultSlot } from "../components/forms/setup-button";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";

/**
 * 只看現在 月份切換在紀錄頁
 * web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
 */
export function SavingsPage({ info }: { info: ModuleInfo }) {
  return (
    <SavingsPageFrame
      info={info}
      current="overview"
      actions={
        <>
          <StreamSection fallback={<ButtonSkeleton />}>
            <OverviewQuickAdd />
          </StreamSection>
          <StreamSection fallback={<ButtonSkeleton icon />}>
            <OverviewSalaryMenu />
          </StreamSection>
        </>
      }
    >
      <StreamSection fallback={<OverviewSkeleton />}>
        <SavingsOverview />
      </StreamSection>
    </SavingsPageFrame>
  );
}

/** 還沒有帳戶時整個總覽換成歡迎卡 */
export async function SavingsOverview() {
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

  return (
    <>
      <StreamSection fallback={<SummarySkeleton />}>
        <SummarySection />
      </StreamSection>
      {/* 確認或略過後那一列會不見 訊息放在兩欄上面 撐滿整頁寬 */}
      <OverviewNotice>
        <div className={OVERVIEW_COLUMNS}>
          <div className={OVERVIEW_LEFT}>
            {/* 待處理常常沒有 不先佔位置 跟帳戶讀同一份資料 會一起出現 */}
            <StreamSection fallback={null}>
              <PendingSection />
            </StreamSection>
            <StreamSection fallback={<AccountsSkeleton />}>
              <AccountsSection />
            </StreamSection>
          </div>
          <div className={OVERVIEW_RIGHT}>
            <StreamSection fallback={<ExpenseSkeleton />}>
              <ExpenseSection />
            </StreamSection>
            <StreamSection fallback={<TrendSkeleton />}>
              <TrendSection />
            </StreamSection>
          </div>
        </div>
      </OverviewNotice>
    </>
  );
}
