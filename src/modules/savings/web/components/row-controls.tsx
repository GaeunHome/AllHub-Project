"use client";

import type { ReactNode } from "react";
import { ActionButton } from "@/core/ui/action-button";
import type { useDialog } from "@/core/ui/dialog";
import type { FormState } from "@/core/ui/form-message";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { formatMonth } from "../../lib/month";
import { skipOccurrenceAction } from "../actions";

export { DeleteMenuItem } from "@/core/ui/delete-menu-item";

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
  /** 視窗放在按鈕外面 按鈕裡不能再放按鈕 */
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
        <ActionButton action={action} fields={{ id, direction: "up" }} formClassName="flex flex-col" className="menu-item">
          <Icon name="arrow-up" className="size-4" />
          上移
        </ActionButton>
      )}
      {!isLast && (
        <ActionButton action={action} fields={{ id, direction: "down" }} formClassName="flex flex-col" className="menu-item">
          <Icon name="arrow-down" className="size-4" />
          下移
        </ActionButton>
      )}
    </>
  );
}

type ActiveMenuItemProps = {
  action: RowAction;
  id: number;
  active: boolean;
  pausedHint: string;
  /** 停用或恢復後這一列會搬到別的清單 成功時提示這句 */
  changedMessage?: string;
};

/** 停用後資料都留著 隨時可以恢復 */
export function ActiveMenuItem({ action, id, active, pausedHint, changedMessage }: ActiveMenuItemProps) {
  return (
    <ActionButton action={action} fields={{ id, active: String(!active) }} title={active ? pausedHint : undefined} successMessage={changedMessage} formClassName="flex flex-col" className="menu-item">
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

type SkipButtonProps = { name: string; ruleId: number; period: string; inMenu?: boolean };

/** 略過也是處理掉這一期 先確認 按完這一期的按鈕會不見 結果用提示視窗 */
export function SkipButton({ name, ruleId, period, inMenu = false }: SkipButtonProps) {
  return (
    <ActionButton
      action={skipOccurrenceAction}
      fields={{ ruleId, period }}
      confirmMessage={`略過「${name}」${formatMonth(period)}這一期？這一期不會記帳。`}
      successMessage={`已略過「${name}」${formatMonth(period)}`}
      formClassName={inMenu ? "flex flex-col" : undefined}
      aria-label={inMenu ? undefined : `略過這一期：${name}`}
      className={inMenu ? "menu-item" : "btn-secondary btn-sm"}
    >
      {inMenu && <Icon name="check-check" className="size-4" />}
      {inMenu ? "略過這一期" : "略過"}
    </ActionButton>
  );
}
