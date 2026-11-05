"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { DRAG_PX, swallowNextClick } from "@/core/ui/drag-scroll";
import { beforeIdOf, clampDrag, dragTarget, shiftAt, type Slot } from "../../lib/place-order";

/** 離邊緣這麼近就自動捲動 放不下的城市才拖得過去 */
const EDGE_PX = 48;
/** 每一幀捲這麼多 大約一秒半個手機畫面 */
const SCROLL_PX = 4;
/** 跟旁邊膠囊讓位的動畫一樣長 */
const SETTLE_MS = 150;

type Session = { chips: HTMLElement[]; slots: Slot[]; from: number; grab: number; to: number };

/** 位置都換算成列裡的座標 拖的時候列會捲動 */
function rowX(row: HTMLElement, clientX: number) {
  return clientX - row.getBoundingClientRect().left + row.scrollLeft;
}

function measure(row: HTMLElement) {
  const chips = [...row.querySelectorAll<HTMLElement>("[data-place-id]")];
  const slots = chips.map((chip) => {
    const { left, width } = chip.getBoundingClientRect();
    return { id: Number(chip.dataset.placeId), left: rowX(row, left), width };
  });
  return { chips, slots };
}

function clearShifts(chips: readonly HTMLElement[]) {
  for (const chip of chips) chip.style.translate = "";
}

/** 從放開的位置滑進空位 不然會瞬間跳過去 */
function settle(chip: HTMLElement, fromLeft: number) {
  const distance = fromLeft - chip.getBoundingClientRect().left;
  if (distance === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  chip.animate({ translate: [`${distance}px`, "0"] }, { duration: SETTLE_MS, easing: "ease-out" });
}

/** 拖的時候順序不動 只用 translate 移動 放開才換順序 一換位置就會失去指標與焦點
 *  不用 transform 拖曳時的放大會連位移一起放大 位置不存 state 每動一下都重畫太重 */
export function useChipDrag(rowRef: RefObject<HTMLElement | null>, onDrop: (id: number, beforeId: number | null) => void) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const abortRef = useRef<() => void>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });
  // Activity 藏起來時也要收掉 不然膠囊回來時還留在拖到一半的位置
  useEffect(() => () => abortRef.current?.(), []);

  const press = (event: ReactPointerEvent, id: number) => {
    const row = rowRef.current;
    if (!row || event.button !== 0 || !event.isPrimary) return;
    const { pointerId, clientX: startX } = event;
    let x = startX;
    let session: Session | null = null;
    let canceled = false;
    let painted = "";
    let frame = 0;

    const paint = (current: Session) => {
      const { chips, slots, from, grab } = current;
      // 手指跑到列外面時膠囊留在看得到的地方 不然會被裁掉
      const seen = Math.min(Math.max(rowX(row, x) - grab, row.scrollLeft), row.scrollLeft + row.clientWidth - slots[from].width);
      const left = clampDrag(slots, from, seen);
      const to = dragTarget(slots, from, left);
      current.to = to;
      chips.forEach((chip, index) => {
        const shift = index === from ? left - slots[from].left : shiftAt(slots, from, to, index);
        chip.style.translate = shift === 0 ? "" : `${shift}px`;
      });
    };

    // 手指停在邊緣不動也要繼續捲
    const tick = () => {
      const { left, right } = row.getBoundingClientRect();
      if (x > right - EDGE_PX) row.scrollLeft += SCROLL_PX;
      else if (x < left + EDGE_PX) row.scrollLeft -= SCROLL_PX;
      // 手停著時不用重寫每一顆的位置
      const place = `${x} ${row.scrollLeft}`;
      if (session && place !== painted) {
        painted = place;
        paint(session);
      }
      frame = requestAnimationFrame(tick);
    };

    const begin = () => {
      const { chips, slots } = measure(row);
      const from = slots.findIndex((slot) => slot.id === id);
      if (from === -1) return;
      session = { chips, slots, from, grab: rowX(row, startX) - slots[from].left, to: from };
      setDraggingId(id);
      frame = requestAnimationFrame(tick);
    };

    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
      cancelAnimationFrame(frame);
      abortRef.current = null;
    };

    const putBack = (save: boolean) => {
      if (!session) return;
      const { chips, slots, from, to } = session;
      session = null;
      const dragged = chips[from];
      const left = dragged.getBoundingClientRect().left;
      // 新的順序跟拿掉位移要在同一次繪製 不然膠囊會閃回原位
      flushSync(() => {
        setDraggingId(null);
        if (save) dropRef.current(id, beforeIdOf(slots, from, to));
      });
      clearShifts(chips);
      settle(dragged, left);
    };

    const release = (save: boolean) => {
      detach();
      putBack(save);
    };

    function move(moved: PointerEvent) {
      if (moved.pointerId !== pointerId) return;
      // 放開的事件有時候到不了 例如 Ctrl 加點打開選單 膠囊不能黏在游標上
      if (moved.buttons === 0) return release(false);
      x = moved.clientX;
      if (!session && !canceled && Math.abs(x - startX) >= DRAG_PX) begin();
    }
    function up(lifted: PointerEvent) {
      if (lifted.pointerId !== pointerId) return;
      if (session || canceled) swallowNextClick(document);
      release(true);
    }
    function cancel(canceledEvent: PointerEvent) {
      if (canceledEvent.pointerId === pointerId) release(false);
    }
    function escape(key: KeyboardEvent) {
      if (key.key !== "Escape" || !session) return;
      // 手還按著 要等放開才收掉監聽 那一下不能變成點連結
      canceled = true;
      cancelAnimationFrame(frame);
      putBack(false);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    abortRef.current = () => {
      detach();
      if (session) clearShifts(session.chips);
      setDraggingId(null);
    };
  };

  return { draggingId, press };
}
