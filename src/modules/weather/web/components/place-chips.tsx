"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { DRAG_SCROLL, NO_DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import { beforeIdAt, movedIds, swapTarget } from "../../lib/place-order";
import { deletePlaceAction, movePlaceAction } from "../actions";
import { placeHref, type PlaceTab } from "../place-tabs";
import { AddPlaceButton } from "./place-form";
import { Flag } from "./weather-images";

type Chip = Pick<PlaceTab, "key" | "id" | "name" | "country">;
type Drag = { id: number; beforeId: number | null };
type Pressed = Drag & { pointerId: number };

/** 離邊緣這麼近就自動捲動 放不下的城市才拖得過去 */
const EDGE_PX = 48;
/** 每一幀捲這麼多 大約一秒半個手機畫面 */
const SCROLL_PX = 4;

/** 使用者要的 按住把手拖 ✕ 移除 首頁選的縣市固定第一個 所以兩個都沒有 */
export function PlaceChips({ tabs, selectedKey }: { tabs: Chip[]; selectedKey: string }) {
  const toast = useToast();
  const rowRef = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<Pressed | null>(null);
  const [status, setStatus] = useState("");
  const [, startTransition] = useTransition();
  const movable = tabs.flatMap((tab) => (tab.id === null ? [] : [tab.id]));
  const [ids, moveOptimistic] = useOptimistic(movable, (current, { id, beforeId }: Drag) => movedIds(current, id, beforeId));
  const shown = drag ? movedIds(ids, drag.id, drag.beforeId) : ids;
  const home = tabs.filter((tab) => tab.id === null);
  const ordered = shown.flatMap((id) => tabs.filter((tab) => tab.id === id));

  const save = (id: number, beforeId: number | null) => {
    if (movedIds(ids, id, beforeId).every((value, index) => value === ids[index])) return;
    startTransition(async () => {
      moveOptimistic({ id, beforeId });
      // 連不上伺服器時會丟錯 不接住會變成整頁的錯誤畫面
      const result = await movePlaceAction(id, beforeId).catch(() => ({ error: "順序沒有存到，請重新整理頁面" }));
      if (result?.error) toast.error(result.error);
    });
  };

  const chipsAt = () => [...(rowRef.current?.querySelectorAll<HTMLElement>("[data-place-id]") ?? [])].map((chip) => {
    const { left, width } = chip.getBoundingClientRect();
    return { id: Number(chip.dataset.placeId), left, width };
  });

  const begin = (event: ReactPointerEvent, id: number) => {
    if (event.button !== 0 || !event.isPrimary) return;
    setDrag({ id, beforeId: ids[ids.indexOf(id) + 1] ?? null, pointerId: event.pointerId });
  };

  // 排序時膠囊在 DOM 裡換位置 把手會失去 pointer capture 所以聽 window
  const dragRef = useRef(drag);
  const saveRef = useRef(save);
  useEffect(() => {
    dragRef.current = drag;
    saveRef.current = save;
  });
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    let x: number | null = null;
    const place = () => {
      const current = dragRef.current;
      if (!current || x === null) return;
      const beforeId = beforeIdAt(chipsAt(), x, current.id);
      if (beforeId !== current.beforeId) setDrag({ ...current, beforeId });
    };
    const follow = (event: PointerEvent) => {
      if (event.pointerId !== dragRef.current?.pointerId) return;
      x = event.clientX;
      place();
    };
    // 手指停在邊緣不動也要繼續捲
    let frame = requestAnimationFrame(function scroll() {
      const row = rowRef.current;
      if (row && x !== null) {
        const { left, right } = row.getBoundingClientRect();
        const before = row.scrollLeft;
        if (x > right - EDGE_PX) row.scrollLeft += SCROLL_PX;
        else if (x < left + EDGE_PX) row.scrollLeft -= SCROLL_PX;
        if (row.scrollLeft !== before) place();
      }
      frame = requestAnimationFrame(scroll);
    });
    const finish = (event: PointerEvent) => {
      const current = dragRef.current;
      if (event.pointerId !== current?.pointerId) return;
      saveRef.current(current.id, current.beforeId);
      setDrag(null);
    };
    const cancel = () => setDrag(null);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
      cancelAnimationFrame(frame);
    };
  }, [dragging]);

  // 膠囊在 DOM 裡換位置時焦點會掉 鍵盤才能連續移動
  const refocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (refocus.current === null) return;
    rowRef.current?.querySelector<HTMLElement>(`[data-place-id="${refocus.current}"] button`)?.focus();
    refocus.current = null;
  });

  const onKey = (event: KeyboardEvent, tab: Chip & { id: number }) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const target = swapTarget(ids, tab.id, event.key === "ArrowLeft" ? -1 : 1);
    if (!target) return;
    refocus.current = tab.id;
    save(tab.id, target.beforeId);
    setStatus(`${tab.name}${event.key === "ArrowLeft" ? "往前" : "往後"}移一格`);
  };

  return (
    <nav ref={rowRef} aria-label="城市" {...DRAG_SCROLL} className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
      {home.map((tab) => (
        <Link key={tab.key} href={placeHref(tab.key)} scroll={false} aria-current={tab.key === selectedKey ? "page" : undefined} className="wx-chip">
          <Flag country={tab.country} size={18} />
          {tab.name}
        </Link>
      ))}
      {ordered.map((tab) => {
        const id = tab.id as number;
        return (
          <span key={tab.key} data-place-id={id} data-dragging={drag?.id === id ? "" : undefined} data-current={tab.key === selectedKey ? "" : undefined} className="wx-chip wx-chip-editable">
            <button
              type="button"
              {...NO_DRAG_SCROLL}
              aria-label={`調整「${tab.name}」的順序，用左右鍵移動`}
              title="按住拖曳調整順序"
              onPointerDown={(event) => begin(event, id)}
              onKeyDown={(event) => onKey(event, { ...tab, id })}
              className="wx-chip-handle"
            >
              <Icon name="grip-vertical" className="size-3.5" />
            </button>
            <Link href={placeHref(tab.key)} scroll={false} aria-current={tab.key === selectedKey ? "page" : undefined} className="wx-chip-link">
              <Flag country={tab.country} size={18} />
              {tab.name}
            </Link>
            <ActionButton action={deletePlaceAction} fields={{ id }} confirmMessage={`確定移除「${tab.name}」？`} successMessage="已移除城市" aria-label={`移除${tab.name}`} className="wx-chip-remove">
              <Icon name="x" className="size-3.5" />
            </ActionButton>
          </span>
        );
      })}
      <AddPlaceButton />
      <span role="status" className="sr-only">
        {status}
      </span>
    </nav>
  );
}
