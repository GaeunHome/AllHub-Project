"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { dayTabs, startDay } from "../board-model";
import { deviceClock } from "../today-view";
import type { DayView } from "../trip-view";

const PHONE = "(width < 40rem)";

const keyOf = (day: string | null) => day ?? "";

/** 看板的位置是橫向捲動 不能用 scrollIntoView 欄在畫面下面時連頁面都會跟著捲 */
function showColumn(board: HTMLElement | null, day: string | null, behavior: ScrollBehavior) {
  const column = board?.querySelector<HTMLElement>(`[data-board-list][data-day="${keyOf(day)}"]`);
  if (!board || !column) return null;
  const inset = parseFloat(getComputedStyle(board).paddingLeft);
  board.scrollTo({ left: board.scrollLeft + column.getBoundingClientRect().left - board.getBoundingClientRect().left - inset, behavior });
  return column;
}

/** 手機打開時先看今天 只跑一次 存檔後頁面重讀不能把人拉回去 要在看板的外層呼叫 這時 ref 才接上 */
export function useStartDay(boardRef: RefObject<HTMLElement | null>, days: DayView[]) {
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    if (matchMedia(PHONE).matches) showColumn(boardRef.current, startDay(days.map(({ date }) => date), deviceClock(new Date()).date), "instant");
  }, [boardRef, days]);
}

/** 使用者選的 手機一次看一天 看板本身還是橫向的 手指滑也能換天 拖到別天也照舊 所以這裡只管捲到哪一欄 */
export function DayTabs({ boardRef, days }: { boardRef: RefObject<HTMLElement | null>; days: DayView[] }) {
  const rowRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(keyOf(days[0]?.date ?? null));
  const tabs = dayTabs([{ day: null as string | null, label: "想去的點", short: "" }, ...days.map(({ date, label, short }) => ({ day: date as string | null, label, short }))]);

  // 手指滑動時切換列也要跟著 看板只比這一欄寬 一次只會有一欄超過六成
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive((entry.target as HTMLElement).dataset.day ?? "");
      },
      { root: board, threshold: 0.6 },
    );
    for (const column of board.querySelectorAll("[data-board-list]")) observer.observe(column);
    return () => observer.disconnect();
  }, [boardRef, days.length]);

  // 天數多時選到的那一顆要留在畫面裡
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>("[aria-current]");
    if (row && tab) row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2 });
  }, [active]);

  const pick = (day: string | null) => {
    const column = showColumn(boardRef.current, day, matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
    const tabsBottom = rowRef.current?.getBoundingClientRect().bottom ?? 0;
    // 捲到長的那一天下面時換到短的一天 畫面會是空的 回到這一欄的開頭
    const top = column?.getBoundingClientRect().top ?? tabsBottom;
    if (top < tabsBottom) window.scrollBy({ top: top - tabsBottom });
  };

  return (
    <nav ref={rowRef} aria-label="切換天數" className="trv-days no-scrollbar">
      {tabs.map(({ day, label, short }) => (
        <button key={keyOf(day)} type="button" aria-current={keyOf(day) === active ? "true" : undefined} onClick={() => pick(day)} className="trv-day">
          <span className="font-semibold">{label}</span>
          {short && <span className="text-xs tabular-nums">{short}</span>}
        </button>
      ))}
    </nav>
  );
}
