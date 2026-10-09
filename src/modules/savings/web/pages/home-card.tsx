import Link from "next/link";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { EmptyState } from "@/core/ui/empty-state";
import { HomeCard } from "@/core/ui/home-card";
import { taipeiMonth } from "../../lib/month";
import { monthProgress } from "../../lib/summary";
import { cachedEntryTotals, cachedGoals } from "../../service/cached";
import { MonthProgressSkeleton, MonthProgressSummary } from "../components/month-progress";

// web 層不能讀模組根目錄的 info.ts，模組網址寫在這裡
const SAVINGS_PAGE = "/savings";

// 名稱、圖示、點綴色由 src/app 從 info.ts 傳進來：web 層不能 import 模組根目錄
export function SavingsHomeCard({ info }: { info: ModuleInfo }) {
  return (
    <HomeCard info={info} title="本月存款" skeleton={<MonthProgressSkeleton />}>
      <SavingsSnapshot />
    </HomeCard>
  );
}

/** 台北時間的這個月；跟記帳頁的總覽用同一套計算（monthProgress） */
export async function SavingsSnapshot() {
  const user = await requireSession();
  const [goals, totals] = await Promise.all([cachedGoals(user.id), cachedEntryTotals(user.id)]);
  if (goals.length === 0) {
    return (
      <EmptyState
        compact
        icon="piggy-bank"
        title="還沒有每月固定項目"
        action={
          <Link href={SAVINGS_PAGE} className="btn-secondary">
            建立項目
          </Link>
        }
      />
    );
  }

  const progress = monthProgress(goals, totals, taipeiMonth(new Date()));
  if (progress.goals.length === 0) {
    return (
      <EmptyState
        compact
        icon="target"
        title="沒有啟用中的項目"
        action={
          <Link href={SAVINGS_PAGE} className="btn-secondary">
            管理項目
          </Link>
        }
      />
    );
  }
  return <MonthProgressSummary progress={progress} />;
}
