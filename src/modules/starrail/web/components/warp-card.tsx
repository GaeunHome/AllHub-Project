import { after } from "next/server";
import Link from "next/link";
import { requireModule } from "@/core/auth";
import { externalAssetUrl } from "@/core/external-url";
import { Avatar } from "@/core/ui/avatar";
import { FormMessage } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { LoadingState, Skeleton } from "@/core/ui/skeleton";
import { warpsHref } from "../../lib/urls";
import type { StarrailAccountView } from "../../service/accounts";
import { cachedWarps } from "../../service/cached";
import { reportWarps } from "../../service/warps";
import { hasRecords, nearPity, percentOf, pityText } from "../warps-view";
import { PanelNotice } from "./panel-parts";

// 星穹鐵道頁已經很長 這裡只放最常看的兩個卡池
const CARD_BANNERS: readonly number[] = [11, 12];

/** 主頁的摘要 每個卡池一條保底進度條 旁邊是上一隻五星 點了到躍遷紀錄頁 */
export async function WarpCard({ account }: { account: StarrailAccountView }) {
  const user = await requireModule("starrail");
  const read = await cachedWarps(user.id, account.id);
  after(() => reportWarps(read));
  if (!read.ok) {
    return (
      <PanelNotice title="躍遷紀錄">
        <FormMessage tone="error">{read.message}</FormMessage>
      </PanelNotice>
    );
  }
  const rows = read.summaries.filter((row) => CARD_BANNERS.includes(row.banner.id));
  const empty = !read.summaries.some(hasRecords);
  return (
    <section aria-labelledby="sr-warps" className="stack">
      <h3 id="sr-warps" className="sr-title">
        躍遷紀錄
      </h3>
      <Link href={warpsHref(account.id)} className="sr-panel group flex flex-wrap items-center gap-x-8 gap-y-3 p-4 sm:p-5">
        {empty ? (
          <span className="text-ink">這個帳號還沒有躍遷紀錄</span>
        ) : (
          <ul className="grid w-full min-w-0 gap-x-10 gap-y-2 lg:w-auto lg:flex-1 lg:grid-cols-2">
            {rows.map((row) => {
              const last = row.fiveStars[0] ?? null;
              return (
                <li key={row.banner.id} data-near={nearPity(row) ? "" : undefined} className="sr-warp-row">
                  <Avatar src={externalAssetUrl(last?.icon ?? null)} name={last?.name ?? row.banner.label} size="md" className="sr-warp-avatar" />
                  <span className="sr-warp-name font-semibold text-ink">{row.banner.label}</span>
                  <span className="sr-warp-track sr-warp-bar">
                    <span className="sr-warp-fill" style={{ width: percentOf(row.pity, row.banner.hardPity) }} />
                  </span>
                  <span className="sr-num sr-warp-pulls font-bold whitespace-nowrap text-ink">{pityText(row)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-sr-gold">
          查看
          <Icon name="chevron-right" className="size-4" />
        </span>
      </Link>
    </section>
  );
}

export function WarpCardSkeleton() {
  return (
    <LoadingState label="載入躍遷紀錄…" className="stack">
      <h3 className="sr-title">躍遷紀錄</h3>
      <Skeleton className="h-16 rounded-none" />
    </LoadingState>
  );
}
