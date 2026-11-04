import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "@/core/auth";
import type { ModuleInfo, SearchParams } from "@/core/module";
import { groupDigits } from "@/core/number";
import { formatTaipeiDateTime } from "@/core/time";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { PageTheme } from "@/core/ui/page-theme";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { accountHref, warpsHref } from "../../lib/urls";
import { WARP_LIMIT } from "../../lib/warps";
import { cachedAccounts, cachedWarpList, cachedWarpSummary } from "../../service/cached";
import { pickAccount } from "../account-tabs";
import { AccountTabs } from "../components/account-card";
import { StarrailBanner } from "../components/starrail-banner";
import { AllWarps, FiveStarList, PityPanel } from "../components/warp-history";
import { WarpSyncButton } from "../components/warp-sync-button";
import { gameFont } from "../game-font";
import { pageFrom, pickBanner, shownBanners } from "../warps-view";

// web 層不能 import 模組根目錄 圖示 名稱 點綴色由 src/app 從 info.ts 傳進來
export function WarpsPage({ info, searchParams }: { info: ModuleInfo; searchParams: SearchParams }) {
  return (
    <PageTheme accent={info.accent} className={`theme-starrail ${gameFont.variable} page-stack`}>
      <StarrailBanner info={info} />
      <Suspense fallback={<WarpsSkeleton />}>
        <WarpsArea searchParams={searchParams} />
      </Suspense>
    </PageTheme>
  );
}

/** 帳號 卡池 頁數都在網址上 重新整理也保留 帳號只從自己的裡面選 */
export async function WarpsArea({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireModule("starrail");
  const params = await searchParams;
  const accounts = await cachedAccounts(user.id);
  const account = pickAccount(accounts, params.account);
  const summaries = account ? await cachedWarpSummary(user.id, account.id) : null;
  if (!account || !summaries) {
    return (
      <p className="sr-panel p-5 text-ink-soft sm:p-6">
        還沒有連結帳號。
        <Link href="/starrail" className="link">
          到星穹鐵道頁連結
        </Link>
      </p>
    );
  }
  const selected = pickBanner(summaries, params.banner);
  const page = pageFrom(params.page, selected.total);
  const list = await cachedWarpList(user.id, account.id, selected.banner.id, page);
  const latest = summaries.flatMap((row) => row.latest ?? []).toSorted((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="page-stack">
      <div className="stack">
        <AccountTabs accounts={accounts} selectedId={account.id} hrefOf={warpsHref} />
        <Link href={accountHref(account.id)} className="flex w-fit items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <Icon name="chevron-left" className="size-4" />
          星穹鐵道
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="sr-title flex items-center gap-1.5">
            躍遷紀錄
            <InfoTip label="躍遷紀錄的說明">每天自動更新一次，存下來的紀錄不會過期。HoYoverse 只給得出最近一段時間的紀錄，更早的補不回來。每個帳號最多留 {groupDigits(WARP_LIMIT)} 抽，超過時移除最舊的。</InfoTip>
          </h2>
          {latest && <p className="text-sm text-ink-soft">最新一抽 {formatTaipeiDateTime(latest)}</p>}
          <div className="sm:ml-auto">
            <WarpSyncButton accountId={account.id} />
          </div>
        </div>
      </div>
      <nav aria-label="卡池" className="no-scrollbar flex overflow-x-auto border-b border-line">
        {shownBanners(summaries).map((row) => (
          <Link key={row.banner.id} href={warpsHref(account.id, row.banner.id)} scroll={false} aria-current={row.banner.id === selected.banner.id ? "page" : undefined} className="sr-tab shrink-0">
            {row.banner.label}
          </Link>
        ))}
      </nav>
      {selected.total === 0 ? (
        <p className="sr-panel p-5 text-ink-soft sm:p-6">這個卡池還沒有紀錄</p>
      ) : (
        <div className="stack">
          <PityPanel summary={selected} />
          <FiveStarList summary={selected} />
          {list && <AllWarps warps={list.warps} total={list.total} page={page} accountId={account.id} bannerType={selected.banner.id} />}
        </div>
      )}
    </div>
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
