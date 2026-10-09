"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./icon";

type MoreMenuProps = {
  /** 按鈕的名稱（報讀器與提示），例如「「影片標題」的選項」 */
  label: string;
  /** 自訂按鈕內容（例如頻道頭像與名稱）；預設是 ⋮ */
  trigger?: ReactNode;
  triggerClassName?: string;
  children: ReactNode;
};

const GAP = 4;
const EDGE = 8;

/** 卡片、頻道上的 ⋮ 選單：寬螢幕貼著按鈕，手機從底部升起；用 fixed 定位，放在會橫向捲動的列裡也不會被裁掉 */
export function MoreMenu({ label, trigger, triggerClassName = "icon-button", children }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const byKeyboard = useRef(false);
  const panelId = useId();

  // 繪製前算好位置，選單不會先出現在左上角再跳過去；下方放不下就改放上方
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!open || !button || !panel) return;
    const rect = button.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const left = Math.min(Math.max(EDGE, rect.right - width), window.innerWidth - width - EDGE);
    const fitsBelow = rect.bottom + GAP + height <= window.innerHeight - EDGE;
    const top = fitsBelow || rect.top - GAP - height < EDGE ? rect.bottom + GAP : rect.top - GAP - height;
    panel.style.setProperty("--menu-left", `${left}px`);
    panel.style.setProperty("--menu-top", `${top}px`);
    if (byKeyboard.current) panel.querySelector<HTMLElement>("a[href], button:not(:disabled)")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    // 選單貼在按鈕旁邊，頁面一捲動就對不上，所以直接收起；選單自己裡面的捲動不算
    const onScroll = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    // detail 為 0 是鍵盤或報讀器按下的：打開後把焦點移進選單
    byKeyboard.current = event.detail === 0;
    setOpen((value) => !value);
  };

  // 點了連結就收起；表單（重新檢查、通知開關）留著，結果才看得到
  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={trigger ? undefined : label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={triggerClassName}
      >
        {trigger ?? <Icon name="ellipsis-vertical" className="size-5" />}
      </button>
      {open && (
        <>
          <div aria-hidden className="more-menu-backdrop" onClick={() => setOpen(false)} />
          <div ref={panelRef} id={panelId} role="group" aria-label={label} className="more-menu" onClick={onPanelClick}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
