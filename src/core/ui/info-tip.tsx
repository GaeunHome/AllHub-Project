"use client";

import { useEffect, useId, useLayoutEffect, useReducer, useRef, type FocusEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "./icon";
import { POPUP_TRIGGER } from "./popup-layer";

export type InfoTipState = { hover: boolean; focus: boolean; pinned: boolean; dismissed: boolean };
export type InfoTipEvent = "hover" | "unhover" | "focus" | "blur" | "toggle" | "escape" | "outside" | "reset";

export const INFO_TIP_CLOSED: InfoTipState = { hover: false, focus: false, pinned: false, dismissed: false };

/**
 * 拆成純函式不靠瀏覽器也能測 滑過與鍵盤焦點暫時顯示 點了固定顯示
 * 觸控裝置沒有滑過 只靠點
 */
export function infoTipReducer(state: InfoTipState, event: InfoTipEvent): InfoTipState {
  switch (event) {
    case "hover":
      return { ...state, hover: true, dismissed: false };
    case "unhover":
      return { ...state, hover: false };
    case "focus":
      return { ...state, focus: true, dismissed: false };
    // 不收起點開的 手機上點說明框裡的字時按鈕也會失去焦點
    // 焦點真的移到外面時由 outside 收起
    case "blur":
      return { ...state, focus: false };
    // 點開的再點一次就收起 滑鼠還停在上面也一樣
    case "toggle":
      return state.pinned ? { ...state, pinned: false, dismissed: true } : { ...state, pinned: true, dismissed: false };
    case "escape":
      return { ...state, pinned: false, dismissed: true };
    case "outside":
      return { ...state, pinned: false };
    case "reset":
      return INFO_TIP_CLOSED;
  }
}

export function infoTipVisible(state: InfoTipState): boolean {
  return !state.dismissed && (state.hover || state.focus || state.pinned);
}

const GAP = 6;
/** 跟手機的頁面左右內距一樣 */
const EDGE = 16;

type Box = { left: number; right: number; top: number; bottom: number };
type Size = { width: number; height: number };

/** 置中放在按鈕下方 左右留 EDGE 不超出畫面 下方放不下才改放上方 */
export function placeInfoTip(anchor: Box, tip: Size, viewport: Size): { left: number; top: number } {
  const left = Math.max(EDGE, Math.min((anchor.left + anchor.right) / 2 - tip.width / 2, viewport.width - EDGE - tip.width));
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - tip.height;
  const top = below + tip.height <= viewport.height - EDGE || above < EDGE ? below : above;
  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * 標題旁的 i 圓圈 滑過或鍵盤移到時顯示 點一下固定顯示給觸控裝置用
 * 說明用 aria-describedby 接在按鈕上 報讀器移到按鈕就會念
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(infoTipReducer, INFO_TIP_CLOSED);
  const visible = infoTipVisible(state);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  // fixed 定位才不會被卡片或捲動區塊裁掉
  // 繪製前依按鈕位置算好 捲動或改變視窗大小時跟著移動
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!visible || !button || !tip) return;
    const place = () => {
      const { left, top } = placeInfoTip(button.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight }, { width: document.documentElement.clientWidth, height: window.innerHeight });
      tip.style.setProperty("--tip-left", `${left}px`);
      tip.style.setProperty("--tip-top", `${top}px`);
    };
    place();
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    // 點外面或焦點移到外面就收起 iPhone 點按鈕不給焦點 只靠失去焦點收不起來
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) dispatch("outside");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch("escape");
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [visible]);

  // Activity 藏起頁面或卸載時收起 回來時才不會留著上次點開的說明
  useLayoutEffect(() => () => dispatch("reset"), []);

  // 手指點下去也會觸發 pointerenter 只認滑鼠與觸控筆 觸控裝置靠 onClick 切換
  const onHover = (event: ReactPointerEvent) => {
    if (event.pointerType !== "touch") dispatch(event.type === "pointerenter" ? "hover" : "unhover");
  };
  // 只有鍵盤來的焦點才顯示 滑鼠或手指點的交給 onClick
  // 切回這個視窗焦點被還回按鈕時才不會突然跳出來
  const onFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.matches(":focus-visible")) dispatch("focus");
  };

  return (
    <span ref={rootRef} className="info-tip" onPointerEnter={onHover} onPointerLeave={onHover}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={tipId}
        aria-expanded={visible}
        // tooltip 沒有 aria-haspopup 能宣告的值
        // popup-layer.ts 靠這個屬性認出它開著 頁面的快捷鍵才會讓開
        {...{ [POPUP_TRIGGER]: "" }}
        onClick={() => dispatch("toggle")}
        onFocus={onFocus}
        onBlur={() => dispatch("blur")}
        className="icon-button info-tip-button"
      >
        <Icon name="info" />
      </button>
      <span ref={tipRef} id={tipId} role="tooltip" hidden={!visible} className="info-tip-bubble">
        {children}
      </span>
    </span>
  );
}
