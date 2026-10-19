"use client";

import type { ReactNode } from "react";
import { Dialog, DialogMessage, type useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { CardHeader } from "@/core/ui/page-header";
import type { useRemovalNotice } from "../row-controls";
import type { useLinkedTrigger } from "../settings/open-from-link";
import { RECURRING_LIST } from "./recurring-row";

type RecurringSectionProps = {
  id: string;
  title: string;
  /** 新增的視窗 標題列的新增按鈕要用 addTrigger 不能新增時不給 */
  add: ReturnType<typeof useDialog>;
  addTrigger?: ReturnType<typeof useLinkedTrigger>;
  /** 報讀器念的新增按鈕名稱 例如新增薪水 */
  addLabel: string;
  addTitle: string;
  addForm: ReactNode;
  /** 刪除或略過後那一列的按鈕會不見 訊息留在清單外面 */
  notice: ReturnType<typeof useRemovalNotice>;
  /** 還沒有任何一條時的說明 有的話不給 */
  empty?: ReactNode;
  children: ReactNode;
};

/** 每月固定頁的一區 新增與刪除的訊息都在標題列下面 */
export function RecurringSection({ id, title, add, addTrigger, addLabel, addTitle, addForm, notice, empty, children }: RecurringSectionProps) {
  return (
    <section aria-labelledby={id} className="card stack @container min-w-0 overflow-hidden">
      <CardHeader
        id={id}
        actions={
          addTrigger && (
            <button {...addTrigger} aria-label={addLabel} className="btn-secondary btn-sm">
              <Icon name="plus" className="size-4" />
              新增
            </button>
          )
        }
      >
        {title}
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...notice.messageProps} />
      <Dialog {...add.dialogProps} title={addTitle}>
        {addForm}
      </Dialog>
      {empty ?? <ul className={RECURRING_LIST}>{children}</ul>}
    </section>
  );
}
