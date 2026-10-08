"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useHeaderMenu } from "../ui/header-menus";
import { Icon } from "../ui/icon";
import { useNotificationCenter } from "./center";
import { relativeTime } from "./format";
import { NotificationSummary } from "./notification-summary";
import { AlertSwitchTable, BrowserPermissionNotice } from "./settings";

const formatCount = (count: number) => (count > 99 ? "99+" : String(count));

export function NotificationBell() {
  const { feed, ringCount } = useNotificationCenter();
  // 跟帳號選單共用開關：打開一個時另一個收起
  const { expanded, toggle, close, rootRef, buttonRef } = useHeaderMenu("notifications");
  const panelId = useId();
  const total = feed.unread.total;

  return (
    <div ref={rootRef} className="shrink-0 sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={total > 0 ? `通知，${total} 則未讀` : "通知"}
        onClick={toggle}
        className="btn-ghost btn-sm relative min-w-10 px-2.5"
      >
        {/* key 換掉時重新掛載，搖晃動畫才會每一批新通知都播一次 */}
        <span key={ringCount} className={ringCount > 0 ? "bell-ringing inline-flex" : "inline-flex"}>
          <Icon name={total > 0 ? "bell-ring" : "bell"} className="size-[1.125rem]" />
        </span>
        {total > 0 && (
          <span aria-hidden className="count-badge absolute -top-1 -right-1">
            {formatCount(total)}
          </span>
        )}
      </button>

      {/* 收起時整個卸載，下次打開一律回到通知清單 */}
      {expanded && <NotificationPanel id={panelId} onClose={close} />}
    </div>
  );
}

function NotificationPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { feed, modules, open, markAllRead } = useNotificationCenter();
  const [view, setView] = useState<"list" | "settings">("list");
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const switched = useRef(false);
  const total = feed.unread.total;
  const moduleList = [...modules.values()];

  // 切換畫面時原本的按鈕會消失，焦點移到新畫面對應的按鈕，鍵盤操作才不會掉回頁首；剛打開面板時不搶焦點
  useEffect(() => {
    if (!switched.current) return;
    (view === "settings" ? backButtonRef : settingsButtonRef).current?.focus();
  }, [view]);

  const switchTo = (next: "list" | "settings") => {
    switched.current = true;
    setView(next);
  };

  return (
    <div id={id} role="dialog" aria-label={view === "list" ? "最近的通知" : "提醒方式"} className="notification-panel">
      {view === "list" ? (
        <>
          <div className="flex items-center gap-1 border-b border-line py-2.5 pr-2 pl-4">
            <h2 className="flex-1 font-semibold text-ink">通知</h2>
            <button type="button" disabled={total === 0} onClick={() => markAllRead()} className="btn-ghost btn-sm">
              <Icon name="check-check" className="size-4" />
              全部標為已讀
            </button>
            <button ref={settingsButtonRef} type="button" onClick={() => switchTo("settings")} aria-label="提醒方式" title="提醒方式" className="btn-ghost btn-sm min-w-10 px-2.5">
              <Icon name="settings" className="size-4" />
            </button>
          </div>
          {feed.recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="icon-tile size-11 rounded-full">
                <Icon name="inbox" />
              </span>
              <p className="text-sm text-muted">目前沒有通知</p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-y-auto overscroll-contain">
              {feed.recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="notification-row"
                    onClick={() => {
                      onClose();
                      open(item);
                    }}
                  >
                    <NotificationSummary item={item} module={modules.get(item.module)} time={relativeTime(item.createdAt)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-line py-2.5 pr-4 pl-2">
            <button ref={backButtonRef} type="button" onClick={() => switchTo("list")} aria-label="回到通知" title="回到通知" className="btn-ghost btn-sm min-w-10 px-2.5">
              <Icon name="chevron-left" className="size-4" />
            </button>
            <h2 className="flex-1 font-semibold text-ink">提醒方式</h2>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
            <p className="text-xs leading-relaxed text-muted">每個模組分開設定，存在這台裝置的瀏覽器。兩個都關的模組不跳提示，只算進未讀數字。</p>
            <AlertSwitchTable modules={moduleList} />
            <BrowserPermissionNotice moduleIds={moduleList.map((m) => m.id)} />
          </div>
        </>
      )}
      <Link
        href="/notifications"
        onClick={onClose}
        className="flex items-center justify-center gap-1 border-t border-line px-4 py-3 text-sm font-medium text-brand-ink hover:bg-surface-muted"
      >
        查看全部通知與提醒設定
        <Icon name="chevron-right" className="size-4" />
      </Link>
    </div>
  );
}
