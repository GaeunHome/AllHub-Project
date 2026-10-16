"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { CATEGORY_KINDS, CATEGORY_KIND_LABELS, type CategoryKind, type PaletteColor } from "../../../lib/kinds";
import { createCategoryAction, updateCategoryAction } from "../../actions";
import { selectableColor } from "../../form-math";
import { Segmented } from "../segmented";
import { AmountField, FormButtons, NameField } from "./fields";

export type CategoryDraft = { id: number; name: string; kind: CategoryKind; color: PaletteColor; monthlyBudget: number | null };

type CategoryFormProps = {
  category?: CategoryDraft;
  defaultKind: CategoryKind;
  /** 資料表要一個顏色 新增時用這一類還沒用過的 修改灰色的舊分類也換成它 */
  defaultColor: PaletteColor;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

const CATEGORY_KIND_OPTIONS = CATEGORY_KINDS.map((kind) => ({ id: kind, label: CATEGORY_KIND_LABELS[kind] }));

/** 只有支出能設每月預算 類型建立後不能改 */
export function CategoryForm({ category, defaultKind, defaultColor, onDone, onCancel }: CategoryFormProps) {
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind);
  const { state, pending, formProps } = useDialogForm(category ? updateCategoryAction : createCategoryAction, onDone);

  return (
    <form {...formProps} className="stack">
      {category ? (
        <>
          <input type="hidden" name="id" value={category.id} />
          <p className="text-ink">{CATEGORY_KIND_LABELS[kind]}的分類（類型建立後不能改）</p>
        </>
      ) : (
        <Segmented label="分類類型" name="kind" options={CATEGORY_KIND_OPTIONS} value={kind} onChange={setKind} />
      )}
      <input type="hidden" name="color" value={category ? selectableColor(category.color, defaultColor) : defaultColor} />
      <NameField defaultValue={category?.name} placeholder={kind === "expense" ? "例如：餐飲、交通" : "例如：薪水、獎金"} />
      {kind === "expense" && <AmountField name="monthlyBudget" label="每月預算（元，選填）" defaultValue={category?.monthlyBudget} />}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={category ? "儲存" : "新增分類"} pendingLabel={category ? "儲存中…" : "新增中…"} icon={category ? "check" : "plus"} />
    </form>
  );
}
