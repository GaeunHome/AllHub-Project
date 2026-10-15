"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ModuleAccent } from "../module";

/** 標在 Activity 藏起來的頁面上 globals.css 換整頁樣式的選擇器才不會比對到它 */
export const ACTIVITY_HIDDEN = "data-activity-hidden";

type Marked = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

/** 顯示時拿掉標記 回傳的清除函式在藏起來或卸載的當下標上 */
export function markShown(element: Marked): () => void {
  element.removeAttribute(ACTIVITY_HIDDEN);
  return () => element.setAttribute(ACTIVITY_HIDDEN, "");
}

/**
 * 會換整頁底色的主題頁外框 伺服器算繪的 HTML 沒有標記 第一次繪製就套用
 * 換頁被 Activity 藏起來時標上 主題才不會漏到別頁
 */
export function PageTheme({ className, accent, children }: { className: string; accent?: ModuleAccent; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // 用 layout effect 藏起與顯示都在繪製前完成 才不會閃一下別的底色
  useLayoutEffect(() => (ref.current ? markShown(ref.current) : undefined), []);

  return (
    <div ref={ref} data-accent={accent} className={className}>
      {children}
    </div>
  );
}
