"use client";

import { useLayoutEffect } from "react";

/**
 * AppShell 的 main 帶的標記 app-shell.tsx 直接寫屬性
 * Server Component 拿不到 use client 檔案匯出的字串
 */
export const APP_SHELL_SELECTOR = "[data-app-shell]";

/**
 * 換人登入是站內換頁 前一個人的頁面還藏在 Activity 裡
 * 整頁重新載入 才看不到打到一半的密碼
 */
export function DiscardHiddenPages() {
  useLayoutEffect(() => {
    const shell = document.querySelector(APP_SHELL_SELECTOR);
    // 看得到的 AppShell 不算 才不會一直重新載入
    if (shell && shell.getClientRects().length === 0) window.location.reload();
  }, []);
  return null;
}
