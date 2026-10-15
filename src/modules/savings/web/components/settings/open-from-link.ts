"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";

/**
 * 從別頁的連結打開視窗一次 例如網址的 add 參數
 * 用 replace 拿掉參數 重新整理或按上一頁都不會再打開
 */
export function useOpenFromLink(enabled: boolean, open: () => void, cleanHref: string) {
  const router = useRouter();
  const openNow = useEffectEvent(open);

  useEffect(() => {
    if (!enabled) return;
    openNow();
    router.replace(cleanHref, { scroll: false });
  }, [enabled, router, cleanHref]);
}
