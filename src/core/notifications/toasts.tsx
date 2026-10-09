"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ui/icon";
import { relativeTime } from "./format";
import { NotificationSummary, type NotificationModule } from "./notification-summary";
import type { NotificationItem } from "./types";

const TOAST_MS = 6000;

type ToastsProps = {
  toasts: NotificationItem[];
  modules: ReadonlyMap<string, NotificationModule>;
  onOpen: (item: NotificationItem) => void;
  onDismiss: (id: number) => void;
};

/** 右下角的提示卡片；容器一直存在，報讀器才會念出新加進來的卡片 */
export function NotificationToasts({ toasts, modules, onOpen, onDismiss }: ToastsProps) {
  return (
    <div aria-live="polite" aria-label="新通知" className="toast-region">
      {toasts.map((item) => (
        <Toast key={item.id} item={item} module={modules.get(item.module)} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ item, module, onOpen, onDismiss }: { item: NotificationItem; module?: NotificationModule; onOpen: ToastsProps["onOpen"]; onDismiss: ToastsProps["onDismiss"] }) {
  // 滑鼠移上去或用鍵盤停在卡片上時先不要收起來，讓人看得完
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(item.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, item.id, onDismiss]);

  return (
    <div
      data-accent={module?.accent}
      className="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <button
        type="button"
        className="toast-main"
        onClick={() => {
          onOpen(item);
          onDismiss(item.id);
        }}
      >
        <NotificationSummary item={item} module={module} time={relativeTime(item.createdAt)} />
      </button>
      <button type="button" onClick={() => onDismiss(item.id)} aria-label="關閉這則提示" className="icon-button text-ink-soft">
        <Icon name="x" className="size-4" />
      </button>
    </div>
  );
}
