"use client";

import { createContext, use, useEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { movedIds, sameOrder, swapTarget } from "@/core/order";
import { DRAG_SCROLL } from "@/core/ui/drag-scroll";
import { Icon } from "@/core/ui/icon";
import { useToast } from "@/core/ui/toast";
import { moveRouteAction } from "../actions";
import { startRouteDrag } from "../route-drag";
import { beforeIdOf } from "../route-sort";

export type SortableItem = { id: number; label: string; node: ReactNode };

type Sorting = { move: (id: number, step: -1 | 1) => void; canMove: (id: number, step: -1 | 1) => boolean };

/** 卡片的 ⋮ 也能往前移往後移 手機的常用路線是橫向滑 沒有拖曳的把手 */
const SortingContext = createContext<Sorting | null>(null);
export const useSorting = () => use(SortingContext);

// 手指靠近側邊欄上下緣時跟著捲 一次捲這麼多
const EDGE_PX = 48;
const EDGE_STEP = 12;

/** 拖曳中才有 卸載時停掉視窗上的監聽 */
type Drag = { stop: () => void };

/** 使用者要的 側邊欄的常用路線可以上下拖曳 畫面先換好再等伺服器 失敗時退回原本的順序 */
export function SortableRoutes({ items, after }: { items: SortableItem[]; after?: ReactNode }) {
  const toast = useToast();
  const serverOrder = items.map((item) => item.id);
  const [order, setOptimistic] = useOptimistic(serverOrder, (_current, next: number[]) => next);
  // 拖曳中的順序只在畫面上 放開才存
  const [dragging, setDragging] = useState<{ id: number; order: number[] } | null>(null);
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const drag = useRef<Drag | null>(null);
  const elements = useRef(new Map<number, HTMLElement>());
  const shown = dragging?.order ?? order;
  const byId = new Map(items.map((item) => [item.id, item]));

  useEffect(() => () => drag.current?.stop(), []);

  const save = (next: number[], id: number) => {
    if (sameOrder(next, order)) return;
    const position = next.indexOf(id) + 1;
    startTransition(async () => {
      setOptimistic(next);
      const result = await moveRouteAction(id, beforeIdOf(next, id));
      if (result.error) toast.error(result.error);
      else setMessage(`${byId.get(id)?.label ?? ""} 移到第 ${position} 條`);
    });
  };

  const move = (id: number, step: -1 | 1) => {
    const target = swapTarget(order, id, step);
    if (target) save(movedIds(order, id, target.beforeId), id);
  };
  const sorting: Sorting = { move, canMove: (id, step) => swapTarget(order, id, step) !== null };

  /** 手指靠近側邊欄上下緣時跟著捲 捲完再量其他卡片的中線 */
  const middles = (id: number, others: readonly number[], pointerY: number) => {
    const scroller = elements.current.get(id)?.closest<HTMLElement>(".trn-side");
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      if (pointerY < box.top + EDGE_PX) scroller.scrollTop -= EDGE_STEP;
      else if (pointerY > box.bottom - EDGE_PX) scroller.scrollTop += EDGE_STEP;
    }
    return others.map((other) => {
      const box = elements.current.get(other)?.getBoundingClientRect();
      return box ? box.top + box.height / 2 : Number.POSITIVE_INFINITY;
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, id: number) => {
    const element = elements.current.get(id);
    if (event.button !== 0 || drag.current || !element) return;
    event.preventDefault();
    const startY = event.clientY;
    const startTop = element.offsetTop;
    const stop = startRouteDrag(
      window,
      { id, pointerId: event.pointerId, order: shown },
      {
        middles: (others, pointerY) => middles(id, others, pointerY),
        reorder: (next) => setDragging({ id, order: next }),
        follow: (pointerY) => {
          const moved = elements.current.get(id);
          // offsetTop 不受 transform 影響 換位置後卡片還是貼著手指
          if (moved) moved.style.transform = `translateY(${pointerY - startY - (moved.offsetTop - startTop)}px)`;
        },
        done: (dropped) => {
          const moved = elements.current.get(id);
          if (moved) moved.style.transform = "";
          drag.current = null;
          setDragging(null);
          if (dropped) save(dropped, id);
        },
      },
    );
    drag.current = { stop };
    setDragging({ id, order: shown });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: number) => {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : null;
    if (step === null || drag.current) return;
    event.preventDefault();
    move(id, step);
  };

  return (
    <SortingContext value={sorting}>
      <div {...DRAG_SCROLL} className="trn-grid trn-sortable no-scrollbar" data-dragging={dragging ? "" : undefined}>
        {shown.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <div
              key={id}
              ref={(element) => {
                if (element) elements.current.set(id, element);
                else elements.current.delete(id);
              }}
              data-lifted={dragging?.id === id ? "" : undefined}
              className="trn-sortable-item"
            >
              <button
                type="button"
                aria-label={`排序 ${item.label}`}
                aria-describedby="transit-sort-hint"
                onPointerDown={(event) => onPointerDown(event, id)}
                onKeyDown={(event) => onKeyDown(event, id)}
                className="trn-handle"
              >
                <Icon name="grip-vertical" className="size-4" />
              </button>
              {item.node}
            </div>
          );
        })}
        {after}
      </div>
      <p id="transit-sort-hint" hidden>
        拖曳或按上下鍵排順序
      </p>
      <p role="status" className="sr-only">
        {message}
      </p>
    </SortingContext>
  );
}
