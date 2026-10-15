"use client";

import { useEffect, useRef, useState } from "react";
import { countUp, countUpStart, formatCount, type FrameApi } from "./count-up";
import { prefersReducedMotion } from "./reduced-motion";

const browserFrames: FrameApi = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * globals.css 的 .fin-count-value 看到它才讓數字出現
 * 屬性留在元素上 Activity 再顯示時才不會又藏起來
 */
const COUNT_STARTED = "data-started";

/** 開始數之前數字藏著 看得到表示 JS 晚到 CSS 的備援已經讓最後的數字出現 */
const revealedByFallback = (element: HTMLElement) => window.getComputedStyle?.(element).visibility === "visible";

/** 直接改原本的文字節點 不用 textContent 換掉 React 之後才認得它 */
function writeText(element: HTMLElement, text: string) {
  const node = element.firstChild;
  if (node && node.nodeType === 3) node.nodeValue = text;
  else element.textContent = text;
}

type AnimatedNumberProps = { value: number; className?: string };

/**
 * 數值改變時從畫面上的數字接著數 Activity 再顯示時不重播
 * 報讀器只讀最後的數字 減少動態效果時由 CSS 直接顯示最後的數字
 */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  // null 是還沒出現過 Activity 藏起來時保留 再顯示時才知道數過了
  const shown = useRef<number | null>(null);
  // 伺服器算繪就寫最後的數字 開始數之前由 CSS 藏著
  // 之後只由 effect 改寫 數值改變時 React 才不會先把新數字畫上去
  const [initialText] = useState(() => formatCount(value));

  useEffect(() => {
    const element = valueRef.current;
    if (!element) return;
    // 每一幀直接改文字 不必每一幀 setState 重新算繪
    const write = (current: number) => {
      shown.current = current;
      writeText(element, formatCount(current));
    };
    const from = prefersReducedMotion() ? value : countUpStart(shown.current, value, shown.current === null && revealedByFallback(element));
    // 先寫好起點再讓數字出現 才不會閃一下最後的數字
    write(from);
    element.setAttribute(COUNT_STARTED, "");
    return countUp({ from, to: value, write, frames: browserFrames });
  }, [value]);

  const final = formatCount(value);
  return (
    <span className={className ? `fin-count ${className}` : "fin-count"}>
      <span className="fin-count-final">{final}</span>
      <span aria-hidden="true" className="fin-count-box">
        <span className="fin-count-ghost">{final}</span>
        <span ref={valueRef} className="fin-count-value">
          {initialText}
        </span>
      </span>
    </span>
  );
}
