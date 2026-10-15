"use client";

import { useState } from "react";
import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { CATEGORY_KIND_LABELS, type CategoryKind, type PaletteColor } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { deleteCategoryAction, moveCategoryAction } from "../../actions";
import { nextFreeColor } from "../../form-math";
import { ColorDot } from "../color-dot";
import { CATEGORY_KIND_OPTIONS, CategoryForm, type CategoryDraft } from "../forms/category-form";
import { DeleteMenuItem, EditButton, MoveButtons, MoveMenuItems, useRemovalNotice } from "../row-controls";
import { Segmented } from "../segmented";

/** 支出與收入分開列 新增的預設是正在看的那一類 */
export function CategoriesCard({ categories }: { categories: CategoryDraft[] }) {
  const [kind, setKind] = useState<CategoryKind>("expense");
  const add = useDialog();
  const removal = useRemovalNotice();
  const shown = categories.filter((category) => category.kind === kind);
  // 這一類還沒用過的顏色 新增時預先選好 修改灰色的舊分類也改用它
  const freeColor = nextFreeColor(shown.map((category) => category.color));

  return (
    <section aria-labelledby="savings-categories" className="card stack">
      <CardHeader
        id="savings-categories"
        icon={<Icon name="chart-pie" />}
        actions={
          <button {...add.triggerProps} className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增分類
          </button>
        }
      >
        分類
      </CardHeader>
      <Segmented label="分類的類型" options={CATEGORY_KIND_OPTIONS} value={kind} onChange={setKind} />
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title="新增分類" icon={<Icon name="plus" />} size="sm">
        <CategoryForm
          defaultKind={kind}
          defaultColor={freeColor}
          onDone={(message, addedKind) => {
            add.done(message);
            // 正在看支出時新增了收入的分類 要切過去才看得到
            setKind(addedKind);
          }}
          onCancel={add.close}
        />
      </Dialog>
      {shown.length === 0 ? (
        <EmptyState compact icon="chart-pie" title={`還沒有${CATEGORY_KIND_LABELS[kind]}的分類`} hint={kind === "expense" ? "例如餐飲、交通、訂閱；可以設每月預算。" : "例如薪水、獎金。"} />
      ) : (
        <ul className="card-list">
          {shown.map((category, index) => (
            <CategoryRow key={category.id} category={category} isFirst={index === 0} isLast={index === shown.length - 1} freeColor={freeColor} onDeleted={removal.report} />
          ))}
        </ul>
      )}
    </section>
  );
}

type CategoryRowProps = { category: CategoryDraft; isFirst: boolean; isLast: boolean; freeColor: PaletteColor; onDeleted: (message: string) => void };

function CategoryRow({ category, isFirst, isLast, freeColor, onDeleted }: CategoryRowProps) {
  const edit = useDialog();

  return (
    <li className="card-row stack">
      <div className="flex items-center gap-3">
        <ColorDot color={category.color} className="size-3" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words text-ink">{category.name}</span>
          {category.kind === "expense" && <span className="text-sm text-ink-soft tabular-nums">{category.monthlyBudget ? `每月預算 ${formatTwd(category.monthlyBudget)}` : "沒有設預算"}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MoveButtons action={moveCategoryAction} id={category.id} name={category.name} isFirst={isFirst} isLast={isLast} />
          <EditButton name={category.name} {...edit.triggerProps} />
          <MoreMenu label={`「${category.name}」的選項`}>
            <MoveMenuItems action={moveCategoryAction} id={category.id} isFirst={isFirst} isLast={isLast} />
            <DeleteMenuItem
              action={deleteCategoryAction}
              id={category.id}
              confirmMessage={`確定刪除分類「${category.name}」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。`}
              label="刪除分類"
              deletedMessage={`已刪除「${category.name}」`}
              onDeleted={onDeleted}
            />
          </MoreMenu>
        </div>
      </div>
      <DialogMessage {...edit.messageProps} />
      <Dialog {...edit.dialogProps} title={`修改「${category.name}」`} icon={<Icon name="pencil" />} size="sm">
        <CategoryForm category={category} defaultKind={category.kind} defaultColor={freeColor} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
