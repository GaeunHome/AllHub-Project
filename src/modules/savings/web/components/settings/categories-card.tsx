"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { CATEGORY_KINDS, CATEGORY_KIND_LABELS, type CategoryKind, type PaletteColor } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { deleteCategoryAction, moveCategoryAction } from "../../actions";
import { nextFreeColor } from "../../form-math";
import { CategoryForm, type CategoryDraft } from "../forms/category-form";
import { DeleteMenuItem, LIST_ROW_MESSAGE, ListGroup, ListRow, MoveMenuItems, useRemovalNotice } from "../row-controls";

/** 支出與收入各一組 只有支出有預算 預算靠右對齊 */
export function CategoriesCard({ categories }: { categories: CategoryDraft[] }) {
  const add = useDialog();
  const removal = useRemovalNotice();
  const groups = CATEGORY_KINDS.map((kind) => ({ kind, items: categories.filter((category) => category.kind === kind) })).filter((group) => group.items.length > 0);
  // 畫面不顯示顏色 但資料表要一個 分到不同的顏色以後要用時才分得出來
  const freeColor = (kind: CategoryKind) => nextFreeColor(categories.filter((category) => category.kind === kind).map((category) => category.color));

  return (
    <section aria-labelledby="savings-categories" className="card stack overflow-hidden">
      <CardHeader
        id="savings-categories"
        actions={
          <button {...add.triggerProps} aria-label="新增分類" className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增
          </button>
        }
      >
        分類與預算
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title="新增分類" size="sm">
        <CategoryForm defaultKind="expense" defaultColor={freeColor("expense")} onDone={(message) => add.done(message)} onCancel={add.close} />
      </Dialog>
      {groups.length === 0 ? (
        <p className="text-ink">還沒有分類，按「新增」加一個，例如餐飲、交通。</p>
      ) : (
        <div className="card-list">
          {groups.map((group) => (
            <ListGroup key={group.kind} id={`savings-categories-${group.kind}`} title={CATEGORY_KIND_LABELS[group.kind]} aside={group.kind === "expense" && <span className="font-normal text-ink-soft">每月預算</span>} withMenu>
              {group.items.map((category, index) => (
                <CategoryRow key={category.id} category={category} isFirst={index === 0} isLast={index === group.items.length - 1} freeColor={freeColor(category.kind)} onDeleted={removal.report} />
              ))}
            </ListGroup>
          ))}
        </div>
      )}
    </section>
  );
}

type CategoryRowProps = { category: CategoryDraft; isFirst: boolean; isLast: boolean; freeColor: PaletteColor; onDeleted: (message: string) => void };

function CategoryRow({ category, isFirst, isLast, freeColor, onDeleted }: CategoryRowProps) {
  const edit = useDialog();

  return (
    <ListRow
      title={category.name}
      amount={category.monthlyBudget ? formatTwd(category.monthlyBudget) : undefined}
      trigger={edit.triggerProps}
      actionLabel="修改"
      menu={
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
      }
    >
      <DialogMessage {...edit.messageProps} className={LIST_ROW_MESSAGE} />
      <Dialog {...edit.dialogProps} title={`修改「${category.name}」`} size="sm">
        <CategoryForm category={category} defaultKind={category.kind} defaultColor={freeColor} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </ListRow>
  );
}
