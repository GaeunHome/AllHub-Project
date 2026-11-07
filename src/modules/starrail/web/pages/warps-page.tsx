import { after } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { PageTheme } from "@/core/ui/page-theme";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { accountHref, warpsHref } from "../../lib/urls";
import type { BannerSummary } from "../../lib/warps";
import { cachedAccounts, cachedWarps } from "../../service/cached";
import { reportWarps } from "../../service/warps";
import { pickAccount } from "../account-tabs";
import { AccountTabs } from "../components/account-card";
import { StarrailBanner } from "../components/starrail-banner";
import { FiveStarList, PityPanel } from "../components/warp-history";
import { hasRecords, pickBanner, shownBanners } from "../warps-view";

// web 層不能 import 模組根目錄 圖示 名稱 點綴色由 src/app 從 info.ts 傳進來
export function WarpsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <PageTheme accent={info.accent} className="theme-starrail page-stack">
      <StarrailBanner info={info} />
      <Suspense fallback={<WarpsSkeleton />}>
        <WarpsArea searchParams={searchParams} />
      </Suspense>
    </PageTheme>
  );
}

/** 帳號與卡池都在網址上 重新整理也保留 帳號只從自己的裡面選 */
export async function WarpsArea({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("starrail");
  const params = await searchParams;
  const accounts = await cachedAccounts(user.id);
  const account = pickAccount(accounts, params.account);
  if (!account) {
    return (
      <p className="sr-panel p-5 text-ink sm:p-6">
        還沒有連結帳號。
        <Link href="/starrail" className="link">
          到星穹鐵道頁連結
        </Link>
      </p>
    );
  }
  const read = await cachedWarps(user.id, account.id);
  after(() => reportWarps(read));

  return (
    <div className="page-stack">
      <div className="stack">
        <AccountTabs accounts={accounts} selectedId={account.id} hrefOf={warpsHref} />
        <Link href={accountHref(account.id)} className="flex w-fit items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <Icon name="chevron-left" className="size-4" />
          星穹鐵道
        </Link>
        <h2 className="sr-title flex items-center gap-1.5">
          躍遷紀錄
          <InfoTip label="躍遷紀錄的說明">來自 HoYoLAB 官方，只有五星與已墊幾抽，最多是 30 分鐘前的資料</InfoTip>
        </h2>
      </div>
      {read.ok ? <BannerArea accountId={account.id} summaries={read.summaries} requested={params.banner} /> : <FormMessage tone="error">{read.message}</FormMessage>}
    </div>
  );
}

function BannerArea({ accountId, summaries, requested }: { accountId: number; summaries: BannerSummary[]; requested: string | string[] | undefined }) {
  const selected = pickBanner(summaries, requested);
  return (
    <>
      <nav aria-label="卡池" className="no-scrollbar flex overflow-x-auto border-b border-line">
        {shownBanners(summaries).map((row) => (
          <Link key={row.banner.id} href={warpsHref(accountId, row.banner.id)} scroll={false} aria-current={row.banner.id === selected.banner.id ? "page" : undefined} className="sr-tab shrink-0">
            {row.banner.label}
          </Link>
        ))}
      </nav>
      {hasRecords(selected) ? (
        <div className="stack">
          <PityPanel summary={selected} />
          <FiveStarList summary={selected} />
        </div>
      ) : (
        <p className="sr-panel p-5 text-ink-soft sm:p-6">這個卡池還沒有紀錄</p>
      )}
    </>
  );
}

function WarpsSkeleton() {
  return (
    <LoadingState label="載入躍遷紀錄…" className="stack">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-11 w-72 max-w-full" />
      <Skeleton className="h-40 rounded-none" />
      <Skeleton className="h-56 rounded-none" />
    </LoadingState>
  );
}
