"use client";

import { useHtmlFlagSync, type HtmlRoot } from "@/core/ui/html-flag";
import { Icon } from "@/core/ui/icon";
import { SIDE_INIT_SCRIPT, applySide, readSide, saveSide, subscribeSide, useSide } from "../side-pref";

const SIDE_SYNC = {
  script: SIDE_INIT_SCRIPT,
  apply: (root: HtmlRoot) => applySide(root, readSide()),
  subscribe: subscribeSide,
  clear: (root: HtmlRoot) => applySide(root, "open"),
};

/** 收起的偏好標在 html 上 整頁載入與站內換頁時第一次繪製就是收起的樣子 */
export function SideSync() {
  return useHtmlFlagSync(SIDE_SYNC);
}

/** 箭頭方向與字由 transit.css 依 html 的屬性換 hydration 前就對 寬螢幕往右收 手機往上收 */
export function SideToggle({ controls }: { controls: string }) {
  const open = useSide() === "open";
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={() => saveSide(open ? "closed" : "open")} className="trn-side-toggle">
      <Icon name="chevron-right" className="size-4 shrink-0" />
      <span className="trn-side-when-open">收起</span>
      <span className="trn-side-when-closed">展開</span>
    </button>
  );
}
