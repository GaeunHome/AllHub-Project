"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ActionButton } from "@/core/ui/action-button";
import { useDialog } from "@/core/ui/dialog";
import type { FormState } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";

type RowAction = (previous: FormState, formData: FormData) => Promise<FormState>;

type DialogTrigger = ReturnType<typeof useDialog>["triggerProps"];

type ListRowProps = {
  title: ReactNode;
  detail?: ReactNode;
  /** 每一列都有 ⋮ 所以同一組的金額會對齊 */
  amount?: ReactNode;
  /** 只給要處理的狀態 例如已停用 */
  badge?: ReactNode;
  /** 停用的不用處理 名稱淡一點 */
  muted?: boolean;
  /** useDialog 的 triggerProps 給了整列就是打開視窗的按鈕 */
  trigger?: DialogTrigger;
  /** 報讀器先念的動作 例如修改 */
  actionLabel?: string;
  menu?: ReactNode;
  /** 成功訊息與視窗 放在按鈕外面 按鈕裡不能再放按鈕 */
  children?: ReactNode;
};

/**
 * 清單的一列 點一下打開修改或詳情 其他動作收在 ⋮
 * 選單是按鈕的兄弟 按鈕裡不能再放按鈕
 */
export function ListRow({ title, detail, amount, badge, muted = false, trigger, actionLabel, menu, children }: ListRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-medium break-words ${muted ? "text-ink-soft" : "text-ink"}`}>{title}</span>
          {badge}
        </span>
        {detail && <span className="text-sm break-words text-ink-soft">{detail}</span>}
      </span>
      {amount !== undefined && amount !== null && <span className="shrink-0 text-right font-medium text-ink tabular-nums">{amount}</span>}
    </>
  );
  // 有 ⋮ 時右邊的內距交給選單 圖示才跟卡片內容的右緣對齊
  const padding = `py-3 pl-5 sm:pl-6 ${menu ? "pr-2" : "pr-5 sm:pr-6"}`;

  return (
    <li className={`flex flex-col ${trigger ? "transition-colors hover:bg-surface-muted" : ""}`}>
      <div className="flex items-center">
        {trigger ? (
          <button {...trigger} className={`flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:-outline-offset-2 ${padding}`}>
            {actionLabel && <span className="sr-only">{actionLabel}：</span>}
            {content}
          </button>
        ) : (
          <div className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 ${padding}`}>{content}</div>
        )}
        {menu && <div className="shrink-0 pr-3 sm:pr-4">{menu}</div>}
      </div>
      {children}
    </li>
  );
}

/** 修改成功的訊息接在那一列下面 左右跟列的文字對齊 */
export const LIST_ROW_MESSAGE = "px-5 pb-3 sm:px-6";

type ListGroupProps = {
  id: string;
  /** 上面沒有區段標題時用 h2 例如紀錄頁的日期 */
  as?: "h2" | "h3";
  title: ReactNode;
  /** 標題列右邊 例如小計 跟列的金額對齊 */
  aside?: ReactNode;
  /** 列尾有 ⋮ 時右邊讓出選單的寬度 金額才對得齊 */
  withMenu?: boolean;
  children: ReactNode;
};

/** 卡片清單裡的一組 例如帳戶的存款 紀錄頁的一天 */
export function ListGroup({ id, as: Heading = "h3", title, aside, withMenu = false, children }: ListGroupProps) {
  return (
    <section aria-labelledby={id}>
      <Heading id={id} className="card-row flex items-center justify-between gap-3 border-b border-line bg-surface-muted py-2 text-sm font-semibold text-ink">
        {title}
        {aside && <span className={withMenu ? "pr-9 pointer-coarse:pr-11" : undefined}>{aside}</span>}
      </Heading>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

/** 選單送出後不會收起 連按幾次就能移好幾格 */
export function MoveMenuItems({ action, id, isFirst, isLast }: { action: RowAction; id: number; isFirst: boolean; isLast: boolean }) {
  return (
    <>
      {!isFirst && (
        <ActionButton action={action} fields={{ id, direction: "up" }} formClassName="flex flex-col gap-1" className="menu-item">
          <Icon name="arrow-up" className="size-4" />
          上移
        </ActionButton>
      )}
      {!isLast && (
        <ActionButton action={action} fields={{ id, direction: "down" }} formClassName="flex flex-col gap-1" className="menu-item">
          <Icon name="arrow-down" className="size-4" />
          下移
        </ActionButton>
      )}
    </>
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

type ActiveMenuItemProps = {
  action: RowAction;
  id: number;
  active: boolean;
  pausedHint: string;
  /** 停用或恢復後這一列會搬到別的清單 成功時呼叫 讓外面留訊息 */
  onChanged?: () => void;
};

/** 停用後資料都留著 隨時可以恢復 */
export function ActiveMenuItem({ action, id, active, pausedHint, onChanged }: ActiveMenuItemProps) {
  const run = async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (!result.error) onChanged?.();
    return result;
  };

  return (
    <ActionButton action={onChanged ? run : action} fields={{ id, active: String(!active) }} title={active ? pausedHint : undefined} formClassName="flex flex-col gap-1" className="menu-item">
      <Icon name={active ? "eye-off" : "eye"} className="size-4" />
      {active ? "停用" : "恢復"}
    </ActionButton>
  );
}

/** 打開視窗的選單項目 選單看到 aria-haspopup 就收起 焦點先回到 ⋮ 視窗要放在選單外面 */
export function DialogMenuItem({ trigger, icon, label }: { trigger: DialogTrigger; icon: UiIconName; label: string }) {
  return (
    <button {...trigger} className="menu-item">
      <Icon name={icon} className="size-4" />
      {label}
    </button>
  );
}
