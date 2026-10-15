"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { useDialog } from "@/core/ui/dialog";
import type { FormState } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";

type RowAction = (previous: FormState, formData: FormData) => Promise<FormState>;

type MoveProps = { action: RowAction; id: number; name: string; isFirst: boolean; isLast: boolean };

/** 手機上改用選單裡的 MoveMenuItems 整列才放得進一行 */
export function MoveButtons({ action, id, name, isFirst, isLast }: MoveProps) {
  return (
    <span className="hidden items-center gap-1 sm:flex">
      <ActionButton action={action} fields={{ id, direction: "up" }} disabled={isFirst} aria-label={`把「${name}」往上移`} title="往上移" className="btn-ghost btn-sm btn-icon">
        <Icon name="arrow-up" className="size-4" />
      </ActionButton>
      <ActionButton action={action} fields={{ id, direction: "down" }} disabled={isLast} aria-label={`把「${name}」往下移`} title="往下移" className="btn-ghost btn-sm btn-icon">
        <Icon name="arrow-down" className="size-4" />
      </ActionButton>
    </span>
  );
}

/** 選單送出後不會收起 連按幾次就能移好幾格 */
export function MoveMenuItems({ action, id, isFirst, isLast }: Omit<MoveProps, "name">) {
  return (
    <>
      {!isFirst && (
        <ActionButton action={action} fields={{ id, direction: "up" }} formClassName="flex flex-col gap-1 sm:hidden" className="menu-item">
          <Icon name="arrow-up" className="size-4" />
          往上移
        </ActionButton>
      )}
      {!isLast && (
        <ActionButton action={action} fields={{ id, direction: "down" }} formClassName="flex flex-col gap-1 sm:hidden" className="menu-item">
          <Icon name="arrow-down" className="size-4" />
          往下移
        </ActionButton>
      )}
    </>
  );
}

/** 手機上只留圖示 整排按鈕才放得進一行 */
export function EditButton({ name, ...triggerProps }: { name: string } & ComponentProps<"button">) {
  return (
    <button {...triggerProps} aria-label={`修改「${name}」`} className="btn-ghost btn-sm btn-icon sm:w-auto sm:px-3">
      <Icon name="pencil" className="size-4" />
      <span className="hidden sm:inline">修改</span>
    </button>
  );
}

/**
 * 成功後按鈕會跟著那一列或整張卡片消失
 * 所以訊息留在外面還在的地方 焦點移到訊息上 不掉到 body
 */
export function useRemovalNotice() {
  const notice = useDialog();
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  // 訊息畫出來後才拿得到元素 不管那一列早或晚一次更新消失 焦點都會落在訊息上
  useLayoutEffect(() => {
    if (focusRequest > 0) messageRef.current?.focus();
  }, [focusRequest]);

  return {
    /** 展開在清單外面的 DialogMessage 上 */
    messageProps: { message: notice.message, ref: messageRef },
    report: (message: string) => {
      notice.done(message);
      setFocusRequest((count) => count + 1);
    },
  };
}

type DeleteMenuItemProps = {
  action: RowAction;
  id: number;
  confirmMessage: string;
  label: string;
  /** 伺服器沒給訊息時用這句 例如別的裝置已經刪掉了 */
  deletedMessage: string;
  /** 這一列會跟選單一起消失 訊息交給清單外的 useRemovalNotice */
  onDeleted: (message: string) => void;
};

/** 先跳確認 刪除後這一列會跟選單一起消失 */
export function DeleteMenuItem({ action, id, confirmMessage, label, deletedMessage, onDeleted }: DeleteMenuItemProps) {
  const run = async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (!result.error) onDeleted(result.message ?? deletedMessage);
    return result;
  };

  return (
    <ActionButton
      action={run}
      fields={{ id }}
      confirmMessage={confirmMessage}
      formClassName="flex flex-col gap-1"
      pendingLabel={
        <>
          <Icon name="trash-2" className="size-4" />
          刪除中…
        </>
      }
      className="menu-item menu-item-danger"
    >
      <Icon name="trash-2" className="size-4" />
      {label}
    </ActionButton>
  );
}

/** 停用後資料都留著 隨時可以恢復 */
export function ActiveMenuItem({ action, id, active, pausedHint }: { action: RowAction; id: number; active: boolean; pausedHint: string }) {
  return (
    <ActionButton action={action} fields={{ id, active: String(!active) }} title={active ? pausedHint : undefined} formClassName="flex flex-col gap-1" className="menu-item">
      <Icon name={active ? "eye-off" : "eye"} className="size-4" />
      {active ? "停用" : "恢復"}
    </ActionButton>
  );
}
