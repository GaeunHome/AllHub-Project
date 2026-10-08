"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { useNotificationCenter } from "./center";
import { absoluteTime } from "./format";
import { linkTarget } from "./links";
import { ModuleBadge, type NotificationModule } from "./notification-summary";
import type { NotificationItem } from "./types";

type ListProps = {
  items: NotificationItem[];
  /** 保留期內有通知的模組，決定要顯示哪些篩選按鈕 */
  moduleIds: string[];
  module: string | null;
  modules: NotificationModule[];
  retentionDays: number;
};

export function NotificationList({ items, moduleIds, module, modules, retentionDays }: ListProps) {
  const router = useRouter();
  const { feed, latestId, markRead, markAllRead } = useNotificationCenter();
  // 先在畫面上標成已讀，不必等重新整理
  const [locallyRead, setLocallyRead] = useState<ReadonlySet<number>>(new Set());
  const byId = new Map(modules.map((m) => [m.id, m]));
  const filters = modules.filter((m) => moduleIds.includes(m.id) || m.id === module);
  const isRead = (item: NotificationItem) => item.read || locallyRead.has(item.id);
  const unreadHere = items.filter((item) => !isRead(item));

  // 輪詢看到更新的通知時重新抓這一頁，列表不用手動重新整理
  const seenId = useRef(latestId);
  useEffect(() => {
    if (latestId !== null && seenId.current !== null && latestId > seenId.current) router.refresh();
    seenId.current = latestId;
  }, [latestId, router]);

  const read = (ids: number[]) => {
    setLocallyRead((current) => new Set([...current, ...ids]));
    markRead(ids);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="依模組篩選" className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
          <FilterLink href="/notifications" current={module === null} count={feed.unread.total}>
            <Icon name="inbox" />
            全部
          </FilterLink>
          {filters.map((m) => (
            <FilterLink key={m.id} href={`/notifications?module=${m.id}`} current={module === m.id} count={feed.unread.byModule[m.id] ?? 0} accent={m.accent}>
              {m.icon ? <Icon src={m.icon} /> : <Icon name="bell" />}
              {m.name}
            </FilterLink>
          ))}
        </nav>
        <button
          type="button"
          disabled={unreadHere.length === 0}
          onClick={() => {
            setLocallyRead(new Set(items.map((item) => item.id)));
            markAllRead(module ?? undefined);
          }}
          className="btn-secondary btn-sm"
        >
          <Icon name="check-check" className="size-4" />
          全部標為已讀
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="inbox" title="這段期間沒有通知" hint={`追蹤的主播開台、頻道有新影片、簽到或開拓力快滿時，通知會出現在這裡，保留 ${retentionDays} 天`} />
      ) : (
        <ul className="card divide-y divide-line p-0">
          {items.map((item) => (
            <NotificationEntry key={item.id} item={item} module={byId.get(item.module)} read={isRead(item)} onRead={() => read([item.id])} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({ href, current, count, accent, children }: { href: string; current: boolean; count: number; accent?: NotificationModule["accent"]; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={current ? "page" : undefined} data-accent={accent} className="nav-pill">
      {children}
      {count > 0 && (
        <span className="count-badge">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> 則未讀</span>
        </span>
      )}
    </Link>
  );
}

function NotificationEntry({ item, module, read, onRead }: { item: NotificationItem; module?: NotificationModule; read: boolean; onRead: () => void }) {
  const target = linkTarget(item.url);
  const linkLabel = target?.external ? "開啟連結" : "前往查看";

  return (
    <li className="flex items-start gap-3 px-4 py-4 sm:px-5">
      <ModuleBadge module={module} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {!read && (
            <>
              <span aria-hidden className="unread-dot" />
              <span className="sr-only">未讀：</span>
            </>
          )}
          <p className={`min-w-0 ${read ? "font-medium text-ink-soft" : "font-semibold text-ink"}`}>{item.title}</p>
          <span className="chip">{module?.name ?? item.module}</span>
          <time dateTime={item.createdAt} className="ml-auto text-xs whitespace-nowrap text-muted tabular-nums">
            {absoluteTime(item.createdAt)}
          </time>
        </div>
        {item.body && <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{item.body}</p>}
        {(target || !read) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {target &&
              (target.external ? (
                <a href={target.href} target="_blank" rel="noreferrer" onClick={onRead} className="btn-secondary btn-sm">
                  <Icon name="external-link" className="size-3.5" />
                  {linkLabel}
                </a>
              ) : (
                <Link href={target.href} onClick={onRead} className="btn-secondary btn-sm">
                  <Icon name="chevron-right" className="size-3.5" />
                  {linkLabel}
                </Link>
              ))}
            {!read && (
              <button type="button" onClick={onRead} className="btn-ghost btn-sm">
                <Icon name="check" className="size-3.5" />
                標為已讀
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
