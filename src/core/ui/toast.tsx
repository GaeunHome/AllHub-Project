"use client";

import { createContext, use, useLayoutEffect, useState, useSyncExternalStore, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";
import { attachToastLayer } from "./toast-layer";
import { createToastApi, createToastQueue, type Toast, type ToastApi, type ToastQueue } from "./toast-queue";

export type { ToastApi } from "./toast-queue";

// 外面沒有 ToastProvider 時什麼都不做 登入頁這類沒有 AppShell 的地方也不會出錯
const ToastContext = createContext<ToastApi>(createToastApi(() => {}));

/** 跳出提示視窗 成功 4 秒 提醒與錯誤 8 秒後自動收起 */
export function useToast(): ToastApi {
  return use(ToastContext);
}

/**
 * 放在 AppShell 換頁或 Activity 藏起頁面時提示還在
 * 提示的外層在 body 最後面 不在頁面裡
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(createToastQueue);
  const [api] = useState(() => createToastApi(queue.show));
  return (
    <ToastContext value={api}>
      {children}
      <ToastLayer queue={queue} />
    </ToastContext>
  );
}

const NO_TOASTS: readonly Toast[] = [];
const noSubscribe = () => () => {};

/** popover 的外層由瀏覽器建好再放進 top layer 伺服器與 hydration 時不畫 */
function ToastLayer({ queue }: { queue: ToastQueue }) {
  const toasts = useSyncExternalStore(queue.subscribe, queue.visible, () => NO_TOASTS);
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [layer] = useState(() => (typeof document === "undefined" ? null : createLayer()));
  useLayoutEffect(() => (layer ? attachToastLayer(layer) : undefined), [layer]);

  if (!inBrowser || !layer) return null;
  return createPortal(<ToastRegions toasts={toasts} queue={queue} />, layer);
}

function createLayer(): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "toast-layer";
  // manual 不會被 Esc 或點外面收起
  layer.setAttribute("popover", "manual");
  return layer;
}

type QueueControls = Pick<ToastQueue, "dismiss" | "hold" | "release">;

/**
 * 錯誤放在 alert 立刻念 成功與提醒放在 status 等報讀器念完手上的
 * 兩個 live region 一直都在 彼此不巢狀
 */
export function ToastRegions({ toasts, queue }: { toasts: readonly Toast[]; queue: QueueControls }) {
  return (
    <>
      <div role="alert" aria-atomic="false" className="toast-list">
        {toasts
          .filter((toast) => toast.tone === "error")
          .map((toast) => (
            <ToastCard key={toast.id} toast={toast} queue={queue} />
          ))}
      </div>
      <div role="status" aria-atomic="false" className="toast-list">
        {toasts
          .filter((toast) => toast.tone !== "error")
          .map((toast) => (
            <ToastCard key={toast.id} toast={toast} queue={queue} />
          ))}
      </div>
    </>
  );
}

const ICONS = { success: "circle-check", warning: "circle-alert", error: "circle-alert" } as const;

/** 滑鼠移上去或鍵盤停在上面時先不收起 讓人看得完 */
function ToastCard({ toast, queue }: { toast: Toast; queue: QueueControls }) {
  // 只在出現時滑進來一次 開關視窗時外層會搬家 不要再播一次
  const [settled, setSettled] = useState(false);
  const { id } = toast;
  const leave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) queue.release(id, "focus");
  };

  return (
    <div
      className={settled ? `toast-card toast-card-${toast.tone}` : `toast-card toast-card-${toast.tone} toast-card-entering`}
      onAnimationEnd={() => setSettled(true)}
      onMouseEnter={() => queue.hold(id, "hover")}
      onMouseLeave={() => queue.release(id, "hover")}
      onFocus={() => queue.hold(id, "focus")}
      onBlur={leave}
    >
      <Icon name={ICONS[toast.tone]} className="size-5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium break-words text-ink">{toast.title}</p>
        {toast.body && <p className="text-sm break-words text-ink-soft">{toast.body}</p>}
      </div>
      <button type="button" onClick={() => queue.dismiss(id)} aria-label="關閉這則提示" className="icon-button -my-1.5 text-ink-soft">
        <Icon name="x" className="size-4" />
      </button>
    </div>
  );
}
