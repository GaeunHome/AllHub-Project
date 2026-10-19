"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { CATEGORY_KINDS, categoryIconOf, type CategoryKind } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { deleteCategoryAction, moveCategoryAction } from "../../actions";
import { CategoryForm, type CategoryDraft } from "../forms/category-form";
import { SetupButton } from "../forms/setup-button";
import { DeleteMenuItem, LIST_ROW_MESSAGE, ListRow, MoveMenuItems, useRemovalNotice } from "../row-controls";
import { IconTile } from "../visuals";

const TITLES: Record<CategoryKind, string> = { expense: "支出分類與預算", income: "收入分類" };

/**
 * 支出與收入各一張卡片 寬螢幕並排 只有支出有預算
 * 還沒有分類時先請使用者建立預設的
 */
export function CategoriesCard({ categories }: { categories: CategoryDraft[] }) {
  if (categories.length === 0) return <NoCategories />;

  return (
    <div className="page-stack xl:grid xl:grid-cols-2 xl:items-start">
      {CATEGORY_KINDS.map((kind) => (
        <KindCard key={kind} kind={kind} items={categories.filter((category) => category.kind === kind)} />
      ))}
    </div>
  );
}

function NoCategories() {
  const add = useDialog();
  return (
    <section aria-labelledby="savings-categories" className="card stack">
      <CardHeader id="savings-categories">分類與預算</CardHeader>
      <p className="text-ink">還沒有分類。按「開始使用」建立常用的分類（餐飲、交通、薪水…，之後都能改），或自己新增。</p>
      <div className="button-row">
        <SetupButton />
        <button {...add.triggerProps} className="btn-secondary">
          <Icon name="plus" className="size-4" />
          新增分類
        </button>
      </div>
      <DialogMessage {...add.messageProps} />
      <Dialog {...add.dialogProps} title="新增分類">
        <CategoryForm defaultKind="expense" onDone={add.done} onCancel={add.close} />
      </Dialog>
    </section>
  );
}

function KindCard({ kind, items }: { kind: CategoryKind; items: CategoryDraft[] }) {
  const add = useDialog();
  const removal = useRemovalNotice();
  const id = `savings-categories-${kind}`;

  return (
    <section aria-labelledby={id} className="card stack overflow-hidden">
      <CardHeader
        id={id}
        actions={
          <button {...add.triggerProps} aria-label={kind === "expense" ? "新增支出分類" : "新增收入分類"} className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增
          </button>
        }
      >
        {TITLES[kind]}
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title={kind === "expense" ? "新增支出分類" : "新增收入分類"}>
        <CategoryForm defaultKind={kind} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {items.length === 0 ? (
        <p className="text-ink">{kind === "expense" ? "還沒有支出分類，按「新增」加一個，例如餐飲、交通。" : "還沒有收入分類，按「新增」加一個，例如薪水、獎金。"}</p>
      ) : (
        <ul className="card-list">
          {items.map((category, index) => (
            <CategoryRow key={category.id} category={category} isFirst={index === 0} isLast={index === items.length - 1} onDeleted={removal.report} />
          ))}
        </ul>
      )}
    </section>
  );
}

type CategoryRowProps = { category: CategoryDraft; isFirst: boolean; isLast: boolean; onDeleted: (message: string) => void };

/** 點一列修改 上移下移與刪除收在 ⋮ */
function CategoryRow({ category, isFirst, isLast, onDeleted }: CategoryRowProps) {
  const edit = useDialog();
  const budget = category.kind === "expense" && category.monthlyBudget !== null ? category.monthlyBudget : null;

  return (
    <ListRow
      title={
        <span className="flex items-center gap-3">
          <IconTile name={categoryIconOf(category.icon, category.kind)} size="sm" />
          {category.name}
        </span>
      }
      amount={budget !== null ? `預算 ${formatTwd(budget)}` : undefined}
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
      <Dialog {...edit.dialogProps} title={`修改「${category.name}」`}>
        <CategoryForm category={category} defaultKind={category.kind} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </ListRow>
  );
}
