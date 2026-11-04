"use client";

import type { ReactNode } from "react";
import { Dialog, type useDialog } from "@/core/ui/dialog";
import { FOCUS_FRAME } from "@/core/ui/focus-frame";
import { Icon } from "@/core/ui/icon";
import { ADD_TILE, CARD_GRID } from "../dashboard/layout";
import { SectionHeading } from "../section-heading";
import type { useLinkedTrigger } from "../settings/open-from-link";

type RecurringSectionProps = {
  id: string;
  title: string;
  /** 新增的視窗 最後一格的新增要用 addTrigger 不能新增時不給 */
  add: ReturnType<typeof useDialog>;
  addTrigger?: ReturnType<typeof useLinkedTrigger>;
  /** 虛線格上的字 例如新增薪水 */
  addLabel: string;
  addTitle: string;
  addForm: ReactNode;
  /** 還沒有任何一條時的說明 有的話不給 */
  empty?: ReactNode;
  children: ReactNode;
};

/** 每月固定頁的一區 外框一直都在 刪除或略過後那一張的按鈕不見時焦點落在這裡 */
export function RecurringSection({ id, title, add, addTrigger, addLabel, addTitle, addForm, empty, children }: RecurringSectionProps) {
  const addTile = addTrigger && (
    <button {...addTrigger} className={ADD_TILE}>
      <Icon name="plus" className="size-4" />
      {addLabel}
    </button>
  );
  return (
    <section aria-labelledby={id} {...FOCUS_FRAME} className="stack min-w-0">
      <SectionHeading id={id} title={title} />
      <Dialog {...add.dialogProps} title={addTitle}>
        {addForm}
      </Dialog>
      {empty ? (
        <div className={CARD_GRID}>
          <div className={addTile ? "card" : "card col-span-full"}>{empty}</div>
          {addTile}
        </div>
      ) : (
        <ul className={CARD_GRID}>
          {children}
          {addTile && <li className="grid">{addTile}</li>}
        </ul>
      )}
    </section>
  );
}
