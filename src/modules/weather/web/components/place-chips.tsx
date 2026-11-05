"use client";

import Link from "next/link";
import { useLayoutEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { DRAG_SCROLL, NO_DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import { movedIds, swapTarget } from "../../lib/place-order";
import { deletePlaceAction, movePlaceAction } from "../actions";
import { placeHref, type PlaceTab } from "../place-tabs";
import { AddPlaceButton } from "./place-form";
import { useChipDrag } from "./use-chip-drag";
import { Flag } from "./weather-images";

type Chip = Pick<PlaceTab, "key" | "id" | "name" | "country">;

/** 使用者要的 滑鼠按住整顆膠囊拖 手指要滑列所以按把手 ✕ 移除 首頁選的縣市固定第一個 都沒有 */
export function PlaceChips({ tabs, selectedKey }: { tabs: Chip[]; selectedKey: string }) {
  const toast = useToast();
  const rowRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("");
  const [, startTransition] = useTransition();
  const movable = tabs.flatMap((tab) => (tab.id === null ? [] : [tab.id]));
  const [ids, moveOptimistic] = useOptimistic(movable, (current, { id, beforeId }: { id: number; beforeId: number | null }) => movedIds(current, id, beforeId));
  const home = tabs.filter((tab) => tab.id === null);
  const ordered = ids.flatMap((id) => tabs.filter((tab) => tab.id === id));

  const save = (id: number, beforeId: number | null) => {
    if (movedIds(ids, id, beforeId).every((value, index) => value === ids[index])) return;
    startTransition(async () => {
      moveOptimistic({ id, beforeId });
      // 連不上伺服器時會丟錯 不接住會變成整頁的錯誤畫面
      const result = await movePlaceAction(id, beforeId).catch(() => ({ error: "順序沒有存到，請重新整理頁面" }));
      if (result?.error) toast.error(result.error);
    });
  };

  const { draggingId, press } = useChipDrag(rowRef, save);

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
    <nav ref={rowRef} aria-label="城市" data-sorting={draggingId === null ? undefined : ""} {...DRAG_SCROLL} className="wx-chips no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
      {home.map((tab) => (
        <Link key={tab.key} href={placeHref(tab.key)} scroll={false} aria-current={tab.key === selectedKey ? "page" : undefined} className="wx-chip">
          <Flag country={tab.country} size={18} />
          {tab.name}
        </Link>
      ))}
      {ordered.map((tab) => {
        const id = tab.id as number;
        return (
          <span
            key={tab.key}
            {...NO_DRAG_SCROLL}
            data-place-id={id}
            data-dragging={draggingId === id ? "" : undefined}
            data-current={tab.key === selectedKey ? "" : undefined}
            // 瀏覽器開始拖連結就會取消指標事件
            onDragStart={(event) => event.preventDefault()}
            className="wx-chip wx-chip-editable"
          >
            <button type="button" aria-label={`調整「${tab.name}」的順序，用左右鍵移動`} onPointerDown={(event) => press(event, id)} onKeyDown={(event) => onKey(event, { ...tab, id })} className="wx-chip-handle">
              <Icon name="grip-vertical" className="size-3.5" />
            </button>
            <Link
              href={placeHref(tab.key)}
              scroll={false}
              aria-current={tab.key === selectedKey ? "page" : undefined}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") press(event, id);
              }}
              className="wx-chip-link"
            >
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
