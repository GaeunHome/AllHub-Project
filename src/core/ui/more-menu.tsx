"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { keepFocusInFrame } from "./focus-frame";
import { Icon } from "./icon";
import { useOutsidePress } from "./outside-press";
import { POPUP_TRIGGER } from "./popup-layer";
import { placeNear } from "./popup-position";

type MoreMenuProps = {
  /** 給報讀器與提示的按鈕名稱 例如影片標題的選項 */
  label: string;
  /** 自訂按鈕內容 例如頻道頭像與名稱 預設是 ⋮ */
  trigger?: ReactNode;
  triggerClassName?: string;
  /** 打開視窗的項目標上 aria-haspopup="dialog" 視窗放在選單外面 選單收起時才不會一起卸載 */
  children: ReactNode;
};

const GAP = 4;
const EDGE = 8;

/** 打開視窗或做完就結束的項目 例如複製 按了就收起 */
const CLOSES_MENU = '[aria-haspopup="dialog"], [data-closes-menu]';

/**
 * 卡片與頻道上的 ⋮ 選單 寬螢幕貼著按鈕 手機從底部升起
 * 用 fixed 定位 放在會橫向捲動的列裡也不會被裁掉
 */
export function MoreMenu({ label, trigger, triggerClassName = "icon-button", children }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const byKeyboard = useRef(false);
  const panelId = useId();

  // Activity 藏起頁面或卸載時收起 回到這一頁時選單才不會還開著
  useLayoutEffect(() => () => setOpen(false), []);

  // 繪製前算好位置 選單才不會先出現在左上角再跳過去 下方放不下就改放上方
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!open || !button || !panel) return;
    const rect = button.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const { left, top } = placeNear(rect, { width, height }, { width: window.innerWidth, height: window.innerHeight }, { left: rect.right - width, gap: GAP, edge: EDGE });
    panel.style.setProperty("--menu-left", `${left}px`);
    panel.style.setProperty("--menu-top", `${top}px`);
    if (byKeyboard.current) panel.querySelector<HTMLElement>("a[href], button:not(:disabled)")?.focus();
  }, [open]);

  useOutsidePress(open, rootRef, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 選單在彈出視窗裡時 Esc 只收起選單 不讓瀏覽器連視窗一起關掉
      event.preventDefault();
      close();
      buttonRef.current?.focus();
    };
    // 選單貼著按鈕 頁面一捲動就對不上 所以直接收起 選單裡面的捲動不算
    const onScroll = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    // detail 為 0 是鍵盤或報讀器按的 打開後把焦點移進選單
    byKeyboard.current = event.detail === 0;
    setOpen((value) => !value);
  };

  // 點了連結就收起 表單留著 結果才看得到
  // 打開視窗的項目也收起 焦點先回到 ⋮ 視窗關掉後才回得來 不會留在視窗後面
  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(CLOSES_MENU)) {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (target.closest("a")) {
      setOpen(false);
    }
  };

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        // ⋮ 帶著焦點跟著那一列不見時 例如修改後那一列搬到別的清單 焦點交給外框
        const release = keepFocusInFrame(node);
        return () => {
          rootRef.current = null;
          release?.();
        };
      }}
      className="relative shrink-0"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={trigger ? undefined : label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // 面板是 group 沒有對應的 aria-haspopup 值
        // popup-layer.ts 靠這個屬性認出選單開著 頁面的快捷鍵才會讓開
        {...{ [POPUP_TRIGGER]: "" }}
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
