"use client";

import { useLayoutEffect } from "react";

/**
 * AppShell 的 main 帶的標記
 * app-shell.tsx 直接寫屬性 因為 Server Component 拿不到 client 模組匯出的字串
 */
export const APP_SHELL_SELECTOR = "[data-app-shell]";

/**
 * 登出或被導回登入頁是站內換頁 前一個人的頁面還藏在 Activity 裡
 * 整頁重新載入 換人登入才看不到打到一半的密碼或 API Key
 */
export function DiscardHiddenPages() {
  useLayoutEffect(() => {
    const shell = document.querySelector(APP_SHELL_SELECTOR);
    // 看得到的 AppShell 不算 才不會一直重新載入
    if (shell && shell.getClientRects().length === 0) window.location.reload();
  }, []);
  return null;
}
