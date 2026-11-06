"use client";

import { useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { FOCUS_FRAME } from "@/core/ui/focus-frame";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import { PLACE_LIMIT, movedIds, swapTarget } from "../../lib/place-order";
import { deletePlaceAction, movePlaceAction } from "../actions";
import type { PlaceTab } from "../place-tabs";
import { PlaceForm } from "./place-form";
import { Flag } from "./weather-images";

type ManagedPlace = Pick<PlaceTab, "key" | "id" | "name" | "country">;
type Step = -1 | 1;

const STEPS: { step: Step; label: string; icon: "arrow-up" | "arrow-down" }[] = [
  { step: -1, label: "上移", icon: "arrow-up" },
  { step: 1, label: "下移", icon: "arrow-down" },
];

/** 按鈕到頭會停用 停用的按鈕留不住焦點 換到另一個方向 */
function refocusStep(row: Element | null | undefined, step: Step) {
  const arrow = (direction: Step) => row?.querySelector<HTMLButtonElement>(`[data-step="${direction}"]`);
  const target = arrow(step);
  (target?.disabled ? arrow(step === -1 ? 1 : -1) : target)?.focus();
}

/** 使用者不要拖曳 所有調整都在這裡 手機與電腦同一種操作 新增後視窗留著 可以接著排順序 */
export function PlaceManager({ tabs }: { tabs: ManagedPlace[] }) {
  const toast = useToast();
  const listRef = useRef<HTMLUListElement>(null);
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  const home = tabs.filter((tab) => tab.id === null);
  const movable = tabs.flatMap((tab) => (tab.id === null ? [] : [tab.id]));
  const [ids, moveOptimistic] = useOptimistic(movable, (current, { id, beforeId }: { id: number; beforeId: number | null }) => movedIds(current, id, beforeId));
  const ordered = ids.flatMap((id) => tabs.filter((tab) => tab.id === id));

  // 列在 DOM 裡換位置時焦點會掉 要能連續按
  const refocus = useRef<{ id: number; step: Step } | null>(null);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    const { id, step } = refocus.current;
    refocus.current = null;
    refocusStep(listRef.current?.querySelector(`[data-place-id="${id}"]`), step);
  });

  const move = (tab: ManagedPlace & { id: number }, step: Step) => {
    const target = swapTarget(ids, tab.id, step);
    if (!target) return;
    refocus.current = { id: tab.id, step };
    setStatus(`${tab.name}${step === -1 ? "往前" : "往後"}移一格`);
    startTransition(async () => {
      moveOptimistic({ id: tab.id, beforeId: target.beforeId });
      // 連不上伺服器時會丟錯 不接住會變成整頁的錯誤畫面
      const result = await movePlaceAction(tab.id, target.beforeId).catch(() => ({ error: "順序沒有存到，請重新整理頁面" }));
      if (result?.error) toast.error(result.error);
    });
  };

  return (
    <div {...FOCUS_FRAME} className="stack">
      <ul ref={listRef} className="flex flex-col">
        {home.map((tab) => (
          <li key={tab.key} className="wx-place">
            <span className="wx-place-name">
              <Flag country={tab.country} size={18} />
              {tab.name}
            </span>
            <span className="chip">首頁的縣市</span>
          </li>
        ))}
        {ordered.map((tab) => {
          const id = tab.id as number;
          return (
            <li key={tab.key} data-place-id={id} className="wx-place">
              <span className="wx-place-name">
                <Flag country={tab.country} size={18} />
                {tab.name}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {STEPS.map(({ step, label, icon }) => (
                  <button key={step} type="button" data-step={step} aria-label={`${label}${tab.name}`} disabled={swapTarget(ids, id, step) === null} onClick={() => move({ ...tab, id }, step)} className="btn-ghost btn-sm btn-icon">
                    <Icon name={icon} className="size-4" />
                  </button>
                ))}
                <ActionButton action={deletePlaceAction} fields={{ id }} confirmMessage={`確定移除「${tab.name}」？`} successMessage="已移除城市" aria-label={`移除${tab.name}`} className="btn-ghost btn-sm btn-icon">
                  <Icon name="x" className="size-4" />
                </ActionButton>
              </span>
            </li>
          );
        })}
      </ul>
      {ids.length >= PLACE_LIMIT ? (
        <p className="text-ink">最多 {PLACE_LIMIT} 個城市，移除一個才能再新增</p>
      ) : adding ? (
        <PlaceForm
          onDone={(message) => {
            setAdding(false);
            if (message) toast.success(message);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary self-start">
          <Icon name="plus" className="size-4" />
          新增城市
        </button>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}

export function ManagePlacesButton({ tabs }: { tabs: ManagedPlace[] }) {
  const dialog = useDialog();
  return (
    <>
      <button {...dialog.triggerProps} className="wx-chip">
        <Icon name="settings" className="size-4" />
        管理
      </button>
      <Dialog {...dialog.dialogProps} title="管理城市" size="sm">
        <PlaceManager tabs={tabs} />
      </Dialog>
    </>
  );
}
