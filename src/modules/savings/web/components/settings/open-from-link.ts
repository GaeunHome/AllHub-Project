"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import type { useDialog } from "@/core/ui/dialog";

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

/**
 * 連結打開的視窗 先把焦點放到打開它的按鈕 關掉後焦點才回得去
 * 回傳展開在那個按鈕上的 triggerProps
 */
export function useLinkedTrigger(dialog: ReturnType<typeof useDialog>, enabled: boolean, cleanHref: string) {
  const button = useRef<HTMLElement | null>(null);
  const triggerRef = dialog.triggerProps.ref;
  const ref = useCallback(
    (node: HTMLElement | null) => {
      button.current = node;
      const detach = triggerRef(node);
      return () => {
        button.current = null;
        detach?.();
      };
    },
    [triggerRef],
  );
  useOpenFromLink(
    enabled,
    () => {
      button.current?.focus();
      dialog.triggerProps.onClick();
    },
    cleanHref,
  );
  return { ...dialog.triggerProps, ref };
}
