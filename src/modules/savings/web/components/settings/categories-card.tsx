"use client";

import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { FOCUS_FRAME } from "@/core/ui/focus-frame";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import { CATEGORY_KINDS, categoryIconOf, type CategoryKind } from "../../../lib/kinds";
import { formatTwd } from "../../../lib/money";
import { deleteCategoryAction, moveCategoryAction } from "../../actions";
import { CategoryForm, type CategoryDraft } from "../forms/category-form";
import { SetupButton } from "../forms/setup-button";
import { ADD_TILE, CARD_GRID } from "../dashboard/layout";
import { MoveMenuItems } from "../row-controls";
import { SectionHeading, Sum } from "../section-heading";
import { IconTile } from "../visuals";

const TITLES: Record<CategoryKind, string> = { expense: "支出分類與預算", income: "收入分類" };

/**
 * 支出與收入各一區 一個分類一張小卡 只有支出有預算
 * 還沒有分類時先請使用者建立預設的
 */
export function CategoriesCard({ categories }: { categories: CategoryDraft[] }) {
  if (categories.length === 0) return <NoCategories />;

  return (
    <div className="page-stack">
      {CATEGORY_KINDS.map((kind) => (
        <KindSection key={kind} kind={kind} items={categories.filter((category) => category.kind === kind)} />
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
      <Dialog {...add.dialogProps} title="新增分類">
        <CategoryForm defaultKind="expense" onDone={add.done} onCancel={add.close} />
      </Dialog>
    </section>
  );
}

/** 外框一直都在 刪掉一張後焦點落在這裡 */
function KindSection({ kind, items }: { kind: CategoryKind; items: CategoryDraft[] }) {
  const add = useDialog();
  const id = `savings-categories-${kind}`;
  const addLabel = kind === "expense" ? "新增支出分類" : "新增收入分類";
  const budget = items.reduce((sum, category) => sum + (category.monthlyBudget ?? 0), 0);
  const addTile = (
    <button {...add.triggerProps} className={ADD_TILE}>
      <Icon name="plus" className="size-4" />
      {addLabel}
    </button>
  );

  return (
    <section aria-labelledby={id} {...FOCUS_FRAME} className="stack min-w-0">
      <SectionHeading id={id} title={TITLES[kind]} summary={kind === "expense" && budget > 0 && <Sum label="每月預算" amount={budget} />} />
      <Dialog {...add.dialogProps} title={addLabel}>
        <CategoryForm defaultKind={kind} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {items.length === 0 ? (
        <div className={CARD_GRID}>
          <p className="card text-ink">{kind === "expense" ? "還沒有支出分類，按「新增」加一個，例如餐飲、交通。" : "還沒有收入分類，按「新增」加一個，例如薪水、獎金。"}</p>
          {addTile}
        </div>
      ) : (
        <ul className={CARD_GRID}>
          {items.map((category, index) => (
            <CategoryCard key={category.id} category={category} isFirst={index === 0} isLast={index === items.length - 1} />
          ))}
          <li className="grid">{addTile}</li>
        </ul>
      )}
    </section>
  );
}

type CategoryCardProps = { category: CategoryDraft; isFirst: boolean; isLast: boolean };

/** 點卡片修改 上移下移與刪除收在 ⋮ */
function CategoryCard({ category, isFirst, isLast }: CategoryCardProps) {
  const edit = useDialog();
  const budget = category.kind === "expense" && category.monthlyBudget !== null ? category.monthlyBudget : null;

  return (
    <li className="card flex min-w-0 items-center overflow-hidden p-0 transition-colors hover:bg-surface-muted sm:p-0">
      <button {...edit.triggerProps} className="flex min-h-20 min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-5 text-left focus-visible:-outline-offset-2">
        <span className="sr-only">修改：</span>
        <IconTile name={categoryIconOf(category.icon, category.kind)} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words text-ink">{category.name}</span>
          {budget !== null && <span className="text-sm text-ink-soft tabular-nums">預算 {formatTwd(budget)}</span>}
        </span>
      </button>
      <div className="shrink-0 pr-3">
        <MoreMenu label={`「${category.name}」的選項`}>
          <MoveMenuItems action={moveCategoryAction} id={category.id} isFirst={isFirst} isLast={isLast} />
          <DeleteMenuItem
            action={deleteCategoryAction}
            fields={{ id: category.id }}
            confirmMessage={`確定刪除分類「${category.name}」？用了這個分類的紀錄與固定收支會改成「未分類」，紀錄本身會留著。`}
            label="刪除分類"
            deletedMessage={`已刪除「${category.name}」`}
          />
        </MoreMenu>
      </div>
      <Dialog {...edit.dialogProps} title={`修改「${category.name}」`}>
        <CategoryForm category={category} defaultKind={category.kind} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
