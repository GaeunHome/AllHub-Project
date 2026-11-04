"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { beforeIdAt, type Move } from "../board-model";

export type DropTarget = { day: string | null; beforeId: number | null };
type Dragging = { itemId: number; title: string; pointerId: number };

/** 離邊緣這麼近就自動捲動 導覽列佔掉上面一段 所以比手指的範圍寬一點 */
const EDGE_PX = 72;
/** 每一幀捲這麼多 大約一秒半個螢幕 手指還來得及停下來 */
const SCROLL_PX = 8;

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => a?.day === b?.day && a?.beforeId === b?.beforeId;

/**
 * 只有把手能拖 手機上按其他地方照樣能捲動頁面
 * 欄位看左右位置 不看高度 空的那一天比較矮 手指低於它時也要算放進去
 */
function dropAt(x: number, y: number, itemId: number): DropTarget | "outside" | "between" {
  const board = document.querySelector("[data-board]")?.getBoundingClientRect();
  if (!board || x < board.left || x > board.right || y < board.top || y > board.bottom) return "outside";
  const column = [...document.querySelectorAll<HTMLElement>("[data-board-list]")].find((candidate) => {
    const { left, right } = candidate.getBoundingClientRect();
    return x >= left && x <= right;
  });
  if (!column) return "between";
  const cards = [...column.querySelectorAll<HTMLElement>("[data-item-id]")]
    .filter((card) => card.dataset.itemId !== String(itemId))
    .map((card) => {
      const { top, height } = card.getBoundingClientRect();
      return { id: Number(card.dataset.itemId), top, height };
    });
  return { day: column.dataset.day || null, beforeId: beforeIdAt(cards, y) };
}

/** 回傳有沒有捲動 捲了落點就要重算 */
function scrollNearEdges(x: number, y: number): boolean {
  const board = document.querySelector<HTMLElement>("[data-board]");
  const before = [board?.scrollLeft, window.scrollY];
  if (board) {
    const box = board.getBoundingClientRect();
    if (x > box.right - EDGE_PX) board.scrollLeft += SCROLL_PX;
    else if (x < box.left + EDGE_PX) board.scrollLeft -= SCROLL_PX;
  }
  if (y > window.innerHeight - EDGE_PX) window.scrollBy(0, SCROLL_PX);
  else if (y < EDGE_PX) window.scrollBy(0, -SCROLL_PX);
  return before[0] !== board?.scrollLeft || before[1] !== window.scrollY;
}

/** onKey 給方向鍵用 鍵盤使用者不能拖 把手本身要能操作 */
export function useBoardDrag(onMove: (move: Move) => void, onKey: (itemId: number, key: string) => boolean) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const ghostNode = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<Dragging | null>(null);

  const finish = useCallback(() => {
    draggingRef.current = null;
    pointerRef.current = null;
    targetRef.current = null;
    setDragging(null);
    setTarget(null);
  }, []);

  const retarget = useCallback(() => {
    const active = draggingRef.current;
    const pointer = pointerRef.current;
    if (!active || !pointer) return;
    const found = dropAt(pointer.x, pointer.y, active.itemId);
    // 經過欄位之間的空隙時沿用上一個落點 不會一閃一閃
    if (found === "between") return;
    const next = found === "outside" ? null : found;
    if (sameTarget(next, targetRef.current)) return;
    targetRef.current = next;
    setTarget(next);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    // 手指停在邊緣不動也要繼續捲 不能只靠 pointermove
    let frame = requestAnimationFrame(function tick() {
      if (pointerRef.current && scrollNearEdges(pointerRef.current.x, pointerRef.current.y)) retarget();
      frame = requestAnimationFrame(tick);
    });
    document.addEventListener("keydown", onEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onEscape);
    };
  }, [dragging, finish, retarget]);

  // Activity 把頁面藏起來時放掉 回來時才不會留著拖到一半的樣子
  useLayoutEffect(() => finish, [finish]);

  // 位置直接寫在樣式上 不經過 React 跟著手指才順
  const placeGhost = (x: number, y: number) => {
    if (ghostNode.current) ghostNode.current.style.translate = `${x}px ${y}px`;
  };
  // 按下去還沒移動時 標籤就要出現在手指旁邊
  const attachGhost = useCallback((node: HTMLDivElement | null) => {
    ghostNode.current = node;
    if (node && pointerRef.current) node.style.translate = `${pointerRef.current.x}px ${pointerRef.current.y}px`;
  }, []);

  const handleProps = (itemId: number, title: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      // 第二根手指與右鍵不算
      if (event.button !== 0 || !event.isPrimary || draggingRef.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const active = { itemId, title, pointerId: event.pointerId };
      draggingRef.current = active;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      setDragging(active);
    },
    // 位置不存 state 每動一下都重畫整個看板 手機會卡 落點變了才重畫
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (draggingRef.current?.pointerId !== event.pointerId) return;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      placeGhost(event.clientX, event.clientY);
      retarget();
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const active = draggingRef.current;
      const drop = targetRef.current;
      if (active?.pointerId !== event.pointerId) return;
      finish();
      if (drop) onMove({ itemId: active.itemId, toDay: drop.day, beforeId: drop.beforeId });
    },
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (onKey(itemId, event.key)) event.preventDefault();
    },
  });

  return { dragging, target, attachGhost, handleProps };
}
