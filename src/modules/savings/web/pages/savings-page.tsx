import { requireModule } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { remainingSteps } from "../../lib/setup";
import { cachedAccounts, cachedCategories, cachedRecurring } from "../../service/cached";
import { OVERVIEW_COLUMNS, OVERVIEW_LEFT, OVERVIEW_RIGHT } from "../components/dashboard/layout";
import { ChecklistSkeleton, HeroSkeleton, MonthSkeleton, OverviewSkeleton, QuickActionsSkeleton, TrendSkeleton } from "../components/dashboard/skeletons";
import { OverviewPrefsSync } from "../components/overview/overview-prefs-sync";
import { ChecklistSection, HeroSection, MonthSection, QuickActionsSection, TrendSection, UrgentSection } from "../components/overview/sections";
import { SetupChecklist } from "../components/overview/setup-checklist";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { setupView } from "../overview-view";

/**
 * 只看現在 月份切換在紀錄頁
 * web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
 */
export function SavingsPage({ info }: { info: ModuleInfo }) {
  return (
    <SavingsPageFrame
      info={info}
      current="overview"
      hero={
        <StreamSection fallback={<HeroSkeleton />}>
          <HeroSection />
        </StreamSection>
      }
    >
      <StreamSection fallback={<OverviewSkeleton />}>
        <SavingsOverview />
      </StreamSection>
    </SavingsPageFrame>
  );
}

/**
 * 由上到下 開始設定 要先處理的事 常用動作 這個月要做的事 本月收支 每月收支
 * 總資產在橫幅裡 還沒有帳戶時只有開始設定
 */
export async function SavingsOverview() {
  const user = await requireModule("savings");
  const [accounts, categories, rules] = await Promise.all([cachedAccounts(user.id), cachedCategories(user.id), cachedRecurring(user.id)]);
  const setup = setupView(accounts, rules, categories);
  const pending = remainingSteps(setup.status, []);

  // 按了開始使用後那一行會不見 焦點交給頁面的外框
  if (setup.required) return <SetupChecklist view={setup} />;

  return (
    <>
      <OverviewPrefsSync pending={pending} />
      {pending.length > 0 && <SetupChecklist view={setup} />}
      <StreamSection fallback={null}>
        <UrgentSection />
      </StreamSection>
      <StreamSection fallback={<QuickActionsSkeleton />}>
        <QuickActionsSection />
      </StreamSection>
      <div className={OVERVIEW_COLUMNS}>
        <div className={OVERVIEW_LEFT}>
          <StreamSection fallback={<ChecklistSkeleton />}>
            <ChecklistSection />
          </StreamSection>
        </div>
        <div className={OVERVIEW_RIGHT}>
          <StreamSection fallback={<MonthSkeleton />}>
            <MonthSection />
          </StreamSection>
          <StreamSection fallback={<TrendSkeleton />}>
            <TrendSection />
          </StreamSection>
        </div>
      </div>
    </>
  );
}
