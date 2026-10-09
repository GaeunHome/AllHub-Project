"use client";

import Link from "next/link";
import { EmptyState } from "../ui/empty-state";
import { LoadingState, Skeleton } from "../ui/skeleton";
import { useNotificationCenter } from "./center";
import { relativeTime } from "./format";
import { ModuleBadge, type NotificationModule } from "./notification-summary";
import type { NotificationItem } from "./types";
import { unreadDigest } from "./unread";

/** 跟鈴鐺用同一份輪詢資料：在鈴鐺或這裡標成已讀，兩邊一起更新，不必另外向伺服器要 */
export function HomeNotifications() {
  const { feed, loaded, modules, open } = useNotificationCenter();
  const { items, more } = unreadDigest(feed);
  return <UnreadDigestList loaded={loaded} items={items} more={more} modules={modules} onOpen={open} />;
}

type UnreadDigestListProps = {
  loaded: boolean;
  items: NotificationItem[];
  more: number;
  modules: ReadonlyMap<string, NotificationModule>;
  /** 只給測試固定時間；畫面上用瀏覽器的現在時間 */
  now?: Date;
  /** 標成已讀並打開通知的連結 */
  onOpen: (item: NotificationItem) => void;
};

export function UnreadDigestList({ loaded, items, more, modules, now, onOpen }: UnreadDigestListProps) {
  // 第一次輪詢回來之前不知道有沒有未讀，先不說「沒有」
  if (!loaded) return <UnreadDigestSkeleton />;
  if (items.length === 0) return <EmptyState compact icon="check-check" title="沒有未讀通知" />;

  return (
    <div className="stack">
      <ul className="-mx-2 flex flex-col">
        {items.map((item) => {
          const source = modules.get(item.module);
          return (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item)} className="home-row">
                <ModuleBadge module={source} className="size-9" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-ink">{item.title}</span>
                  <span className="truncate text-sm text-ink-soft">
                    {source?.name ?? item.module} · {relativeTime(item.createdAt, now)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <Link href="/notifications" className="link link-block">
          還有 {more} 則未讀
        </Link>
      )}
    </div>
  );
}

function UnreadDigestSkeleton() {
  return (
    <LoadingState label="載入未讀通知…" className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-14 items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={`h-4 ${i === 1 ? "w-1/2" : "w-3/4"}`} />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </div>
      ))}
    </LoadingState>
  );
}
