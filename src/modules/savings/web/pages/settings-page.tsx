import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/core/auth";
import type { ModuleInfo } from "@/core/module";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { parseRowId } from "../../lib/validation";
import { cachedCategories } from "../../service/cached";
import { SetupResultSlot } from "../components/forms/setup-button";
import type { SearchParams } from "../components/month-href";
import { SavingsPageFrame, StreamSection } from "../components/page-frame";
import { CategoriesCard } from "../components/settings/categories-card";
import { SAVINGS_PATHS, editRecurringPath } from "../paths";

/**
 * 書籤或通知裡設定頁的新增帳戶與修改固定收支連結 轉到帳戶頁與每月固定頁
 * 要打開哪一條由每月固定頁確認是不是自己的
 */
export async function LegacyLinkRedirect({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  if (params.add === "account") redirect(SAVINGS_PATHS.addAccount);
  const recurring = parseRowId(params.recurring);
  if (recurring !== null) redirect(editRecurringPath(recurring));
  return null;
}

export async function CategoriesLoader() {
  const user = await requireSession();
  const categories = await cachedCategories(user.id);
  return <CategoriesCard categories={categories.map(({ id, name, kind, color, monthlyBudget, icon }) => ({ id, name, kind, color, monthlyBudget, icon }))} />;
}

/** 跟載入完成的卡片一樣高 串流進來時下面的字才不會跳 */
function CategoriesSkeleton() {
  return (
    <LoadingState label="載入分類…" className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
      {[5, 3].map((rows) => (
        <div key={rows} className="card stack">
          <div className="flex min-h-9 items-center gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="ml-auto h-9 w-20 rounded-lg" />
          </div>
          <div className="card-list">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="card-row flex min-h-14 items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className={`h-4 ${i % 2 === 0 ? "w-1/3" : "w-1/4"}`} />
                <Skeleton className="ml-auto size-9 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </LoadingState>
  );
}

// web 層不能 import 模組根目錄 所以 info 由 src/app 傳進來
export function SettingsPage({ info, searchParams }: { info: ModuleInfo; searchParams?: SearchParams }) {
  return (
    <SavingsPageFrame info={info} current="settings">
      <Suspense fallback={null}>
        <LegacyLinkRedirect searchParams={searchParams} />
      </Suspense>
      {/* 開始使用成功後卡片會換掉 訊息留在外面這一層 */}
      <SetupResultSlot>
        <StreamSection fallback={<CategoriesSkeleton />}>
          <CategoriesLoader />
        </StreamSection>
      </SetupResultSlot>
      <p className="text-ink">
        帳戶在
        <Link href={SAVINGS_PATHS.accounts} className="link">
          帳戶
        </Link>
        與
        <Link href={SAVINGS_PATHS.investments} className="link">
          投資
        </Link>
        分頁新增與修改；薪水、定期定額與每月的固定收支在
        <Link href={SAVINGS_PATHS.recurring} className="link">
          每月固定
        </Link>
        分頁。
      </p>
    </SavingsPageFrame>
  );
}
