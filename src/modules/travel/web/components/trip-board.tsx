"use client";

import { Fragment, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, DialogButton, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { useToast } from "@/core/ui/toast";
import { dayRouteUrl, directionsUrl, mapsSearchUrl, type RouteStop } from "../../lib/maps";
import type { ItemKind } from "../../lib/rules";
import { formatClock, scheduleDay, type ScheduledItem } from "../../lib/schedule";
import type { TripComment, TripItem } from "../../service/trips";
import { addCommentAction, deleteCommentAction, deleteItemAction, moveItemAction } from "../actions";
import { adjacentListMove, isSamePlace, itemsOfDay, moveInBoard, neighbourMove, type Move } from "../board-model";
import { dayText } from "../trip-text";
import type { DayView } from "../trip-view";
import { CopyTripButton } from "./copy-trip-button";
import { DayTabs, useStartDay } from "./day-tabs";
import { ItemForm, KIND_LABELS } from "./item-form";
import { useBoardDrag } from "./use-board-drag";

const KIND_ICONS: Record<ItemKind, UiIconName> = { place: "map-pin", food: "utensils", transport: "bus", stay: "house", other: "circle-dot" };

type TripBoardProps = {
  tripId: number;
  tripTitle: string;
  destination: string | null;
  days: DayView[];
  items: TripItem[];
  comments: TripComment[];
  userId: string;
  managerId: string | null;
};

type BoardContext = Omit<TripBoardProps, "days" | "items"> & {
  items: TripItem[];
  lists: { day: string | null; label: string }[];
  move: (move: Move) => void;
  drag: ReturnType<typeof useBoardDrag>;
};

/** 放開時畫面先換好時間也跟著重算 伺服器失敗時退回 放回原位不送出 */
export function TripBoard({ days, items, ...rest }: TripBoardProps) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [shown, applyMove] = useOptimistic(items, moveInBoard);
  const [announcement, setAnnouncement] = useState("");
  const focusItem = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  useStartDay(boardRef, days);
  const lists = [{ day: null, label: "想去的點" }, ...days.map((day) => ({ day: day.date, label: `${day.label}（${day.detail}）` }))];
  const move = (next: Move) => {
    if (isSamePlace(shown, next)) return;
    focusItem.current = next.itemId;
    setAnnouncement(`已移到${lists.find((list) => list.day === next.toDay)?.label ?? ""}`);
    startTransition(async () => {
      applyMove(next);
      const state = await moveItemAction(rest.tripId, next.itemId, next.toDay, next.beforeId);
      if (state.error) toast.error(state.error);
    });
  };
  const onKey = (itemId: number, key: string) => {
    const days = lists.map((list) => list.day);
    const next = key === "ArrowUp" ? neighbourMove(shown, itemId, -1) : key === "ArrowDown" ? neighbourMove(shown, itemId, 1) : key === "ArrowLeft" ? adjacentListMove(shown, days, itemId, -1) : key === "ArrowRight" ? adjacentListMove(shown, days, itemId, 1) : null;
    if (next === null) return false;
    if (next) move(next);
    return true;
  };
  const drag = useBoardDrag(move, onKey);
  const { dragging, attachGhost } = drag;
  const context: BoardContext = { ...rest, items: shown, lists, move, drag };

  // 跨天移動時那一張卡片是重新掛載的 焦點要跟過去 不然鍵盤使用者會回到頁面最上面
  useLayoutEffect(() => {
    if (focusItem.current === null) return;
    document.querySelector<HTMLElement>(`[data-item-id="${focusItem.current}"] .trv-handle`)?.focus();
    focusItem.current = null;
  }, [shown]);

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="stack">
        <DayTabs boardRef={boardRef} days={days} />
        {/* 拖曳時關掉捲動吸附 不然跟自動捲動互相打架 卡在原地 */}
        <div ref={boardRef} data-board data-dragging={dragging ? "" : undefined} className="trv-board no-scrollbar">
          <Column context={context} day={null} title="想去的點" />
          {days.map((day) => (
            <Column key={day.date} context={context} day={day.date} title={day.label} detail={day.detail} view={day} />
          ))}
        </div>
      </div>
      {dragging && (
        <div ref={attachGhost} aria-hidden className="trv-ghost">
          {dragging.title}
        </div>
      )}
    </>
  );
}

const stopOf = ({ title, lat, lng }: TripItem): RouteStop => ({ title, lat, lng });

function Column({ context, day, title, detail, view }: { context: BoardContext; day: string | null; title: string; detail?: string; view?: DayView }) {
  const { items, drag, tripId, tripTitle, destination } = context;
  const list = itemsOfDay(items, day);
  const schedule = day ? scheduleDay(list) : [];
  const route = day ? dayRouteUrl(list.map(stopOf)) : null;
  const dropHere = drag.target && drag.target.day === day ? drag.target : null;

  return (
    <section aria-label={detail ? `${title} ${detail}` : title} data-board-list data-day={day ?? ""} data-pool={day === null || undefined} className="trv-column">
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="font-semibold text-ink">{title}</h2>
          {detail && <p className="text-sm text-ink-soft">{detail}</p>}
        </div>
        {view && list.length > 0 && <CopyTripButton text={dayText({ title: tripTitle, destination }, view, list)} label={`複製${title}的行程`} iconOnly className="btn-ghost btn-sm btn-icon" />}
        {route && (
          <a href={route} target="_blank" rel="noreferrer" aria-label={`${title}的整天路線`} title="整天路線" className="btn-ghost btn-sm btn-icon shrink-0">
            <Icon name="map" className="size-4" />
          </a>
        )}
      </header>
      <ol className="trv-list">
        {list.map((item, index) => (
          <Fragment key={item.id}>
            {dropHere?.beforeId === item.id && <DropLine />}
            {day && index > 0 && <Leg from={list[index - 1]} to={item} />}
            <ItemCard item={item} slot={schedule[index]} context={context} destination={destination} />
          </Fragment>
        ))}
        {dropHere?.beforeId === null && <DropLine />}
        {list.length === 0 && !dropHere && <li className="trv-empty">{day ? "把想去的點拖到這裡" : "先把想去的地方貼上來"}</li>}
      </ol>
      <DialogButton
        label={
          <>
            <Icon name="plus" className="size-4" />
            新增
          </>
        }
        buttonClassName="btn-ghost btn-sm self-start"
        title={`新增到${title}`}
        size="sm"
      >
        {({ done, close }) => <ItemForm tripId={tripId} day={day} onDone={done} onCancel={close} />}
      </DialogButton>
    </section>
  );
}

const DropLine = () => <li aria-hidden className="trv-drop-line" />;

/** 兩站之間的交通 時間由使用者照查到的填 整行一鍵開 Google Maps 查 */
function Leg({ from, to }: { from: TripItem; to: TripItem }) {
  const text = to.travelMinutes > 0 ? `交通 ${to.travelMinutes} 分鐘` : "還沒填交通時間";
  return (
    <li className="trv-leg">
      <a href={directionsUrl(stopOf(from), stopOf(to))} target="_blank" rel="noreferrer" aria-label={`${text}，查路線`} title="查路線" className="trv-leg-link">
        <Icon name="bus" className="size-3.5 shrink-0" />
        <span className="tabular-nums">{text}</span>
        <Icon name="external-link" className="size-3 shrink-0" />
      </a>
    </li>
  );
}

function ItemCard({ item, slot, context, destination }: { item: TripItem; slot?: ScheduledItem; context: BoardContext; destination: string | null }) {
  const { drag, tripId } = context;
  const dragging = drag.dragging?.itemId === item.id;
  const mapLink = item.mapsUrl ?? mapsSearchUrl(item.title, destination);

  return (
    <li data-item-id={item.id} data-dragging={dragging || undefined} className="trv-card">
      <button type="button" aria-label={`移動「${item.title}」，可以拖曳，或按方向鍵`} {...drag.handleProps(item.id, item.title)} className="trv-handle">
        <Icon name="grip-vertical" className="size-4" />
      </button>
      {slot && <Clock slot={slot} />}
      <div className="trv-card-body">
        <p className="trv-card-title">
          <Icon name={KIND_ICONS[item.kind]} label={KIND_LABELS[item.kind]} className="mt-1 size-4 shrink-0 text-accent" />
          <span className="min-w-0 break-words">{item.title}</span>
        </p>
        {item.note && <p className="trv-note">{item.note}</p>}
        <div className="trv-tools">
          {slot && slot.late > 0 && <span className="chip chip-danger">晚 {slot.late} 分鐘</span>}
          <a href={mapLink} target="_blank" rel="noreferrer" aria-label={item.mapsUrl ? `看「${item.title}」的地圖` : `在地圖上查「${item.title}」`} title={item.mapsUrl ? "看地圖" : "查地圖"} className="trv-tool">
            <Icon name="map" className="size-4" />
          </a>
          <CommentsButton item={item} context={context} />
        </div>
      </div>
      <ItemMenu item={item} context={context} tripId={tripId} />
    </li>
  );
}

function Clock({ slot }: { slot: ScheduledItem }) {
  return (
    <p className="trv-clock">
      <b>{formatClock(slot.arrive)}</b>
      <span className="sr-only">到</span>
      <span>{formatClock(slot.leave)}</span>
    </p>
  );
}

/** 拖曳以外的操作都在這裡 鍵盤與手機跨天移動靠它 視窗放在選單外面才不會跟著收起 */
function ItemMenu({ item, context, tripId }: { item: TripItem; context: BoardContext; tripId: number }) {
  const edit = useDialog();
  const relocate = useDialog();
  const { items, move, lists } = context;
  const step = (direction: -1 | 1) => {
    const next = neighbourMove(items, item.id, direction);
    if (next) move(next);
  };

  return (
    <>
      <MoreMenu label={`「${item.title}」的選項`}>
        <button {...edit.triggerProps} className="menu-item">
          <Icon name="pencil" className="size-4" />
          修改
        </button>
        <button type="button" onClick={() => step(-1)} className="menu-item">
          <Icon name="arrow-up" className="size-4" />
          上移
        </button>
        <button type="button" onClick={() => step(1)} className="menu-item">
          <Icon name="arrow-down" className="size-4" />
          下移
        </button>
        <button {...relocate.triggerProps} className="menu-item">
          <Icon name="arrow-left-right" className="size-4" />
          移到別天
        </button>
        <DeleteMenuItem action={deleteItemAction.bind(null, tripId)} fields={{ id: item.id }} confirmMessage={`確定刪除「${item.title}」？`} label="刪除" deletedMessage={`已刪除「${item.title}」`} />
      </MoreMenu>
      <Dialog {...edit.dialogProps} title={`修改「${item.title}」`} size="sm">
        <ItemForm tripId={tripId} item={item} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
      <Dialog {...relocate.dialogProps} title={`把「${item.title}」移到…`} size="sm">
        <ul className="stack">
          {lists.map(({ day, label }) => (
            <li key={day ?? "pool"}>
              <button
                type="button"
                disabled={day === item.day}
                onClick={() => {
                  move({ itemId: item.id, toDay: day, beforeId: null });
                  relocate.close();
                }}
                className="btn-secondary w-full"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

function CommentsButton({ item, context }: { item: TripItem; context: BoardContext }) {
  const { comments, tripId, userId, managerId } = context;
  const dialog = useDialog();
  const mine = comments.filter((comment) => comment.itemId === item.id);

  return (
    <>
      <button {...dialog.triggerProps} aria-label={mine.length > 0 ? `「${item.title}」的留言，${mine.length} 則` : `「${item.title}」的留言`} title="留言" className="trv-tool">
        <Icon name="message-circle" className="size-4" />
        {mine.length > 0 && <span className="tabular-nums">{mine.length}</span>}
      </button>
      <Dialog {...dialog.dialogProps} title={`「${item.title}」的留言`} size="sm">
        <div className="stack">
          {mine.length > 0 && (
            <ul className="stack">
              {mine.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{comment.authorName}</p>
                    <p className="break-words text-ink">{comment.body}</p>
                  </div>
                  {(comment.userId === userId || managerId === userId) && (
                    <ActionButton action={deleteCommentAction} fields={{ tripId, commentId: comment.id }} aria-label="刪除這則留言" className="btn-ghost btn-sm btn-icon">
                      <Icon name="x" className="size-4" />
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          <CommentForm tripId={tripId} itemId={item.id} onDone={dialog.done} />
        </div>
      </Dialog>
    </>
  );
}

function CommentForm({ tripId, itemId, onDone }: { tripId: number; itemId: number; onDone: (message: string | undefined) => void }) {
  const { state, pending, formProps } = useDialogForm(addCommentAction, onDone);
  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="itemId" value={itemId} />
      <label className="field">
        <span className="field-label">留言</span>
        <textarea name="body" rows={2} required data-autofocus className="input" />
      </label>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <button type="submit" disabled={pending} className="btn-primary self-end">
        {pending ? "送出中…" : "送出"}
      </button>
    </form>
  );
}

