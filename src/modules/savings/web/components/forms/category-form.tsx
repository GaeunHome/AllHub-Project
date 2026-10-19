"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { CATEGORY_ICONS, CATEGORY_ICON_NAMES, CATEGORY_KINDS, CATEGORY_KIND_LABELS, NAME_MAX_LENGTH, type CategoryIcon, type CategoryKind } from "../../../lib/kinds";
import { createCategoryAction, updateCategoryAction } from "../../actions";
import { AmountField, FormButtons, LEGEND_CLASS } from "./fields";

/** icon 是 null 時畫面用這一類的預設圖示 */
export type CategoryDraft = { id: number; name: string; kind: CategoryKind; monthlyBudget: number | null; icon: string | null };

type CategoryFormProps = {
  category?: CategoryDraft;
  defaultKind: CategoryKind;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

const CATEGORY_KIND_OPTIONS = CATEGORY_KINDS.map((kind) => ({ id: kind, label: CATEGORY_KIND_LABELS[kind] }));

const isCategoryIcon = (value: string | null): value is CategoryIcon => value !== null && Object.hasOwn(CATEGORY_ICONS, value);

/** 名稱剛好是圖示的名稱時 例如餐飲 */
function iconForName(name: string): CategoryIcon | null {
  const text = name.trim();
  return CATEGORY_ICON_NAMES.find((icon) => CATEGORY_ICONS[icon] === text) ?? null;
}

/** 只有支出能設每月預算 類型建立後不能改 */
export function CategoryForm({ category, defaultKind, onDone, onCancel }: CategoryFormProps) {
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind);
  const [icon, setIcon] = useState<CategoryIcon | null>(() => (category && isCategoryIcon(category.icon) ? category.icon : null));
  // 自己選過圖示後 改名稱不再幫忙換
  const [picked, setPicked] = useState(icon !== null);
  const { state, pending, formProps } = useDialogForm(category ? updateCategoryAction : createCategoryAction, onDone);

  const pick = (value: CategoryIcon) => {
    setIcon(value);
    setPicked(true);
  };

  return (
    <form {...formProps} className="stack">
      {category ? (
        <>
          <input type="hidden" name="id" value={category.id} />
          <p className="text-ink">{CATEGORY_KIND_LABELS[kind]}的分類（類型建立後不能改）</p>
        </>
      ) : (
        <SegmentedControl variant="field" label="分類類型" name="kind" options={CATEGORY_KIND_OPTIONS} value={kind} onChange={setKind} />
      )}
      <label className="field">
        <span className="field-label">名稱</span>
        <input
          name="name"
          required
          maxLength={NAME_MAX_LENGTH}
          defaultValue={category?.name}
          placeholder={kind === "expense" ? "例如：餐飲、交通" : "例如：薪水、獎金"}
          autoComplete="off"
          data-autofocus
          onChange={(event) => {
            if (!picked) setIcon(iconForName(event.target.value));
          }}
          className="input"
        />
      </label>
      <IconPicker value={icon} onChange={pick} />
      {kind === "expense" && <AmountField name="monthlyBudget" label="每月預算（元，選填）" defaultValue={category?.monthlyBudget} />}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={category ? "儲存" : "新增分類"} pendingLabel={category ? "儲存中…" : "新增中…"} icon={category ? "check" : "plus"} />
    </form>
  );
}

// 選到的用主色框起來 radio 藏在格子裡 方向鍵照樣能換
const ICON_CELL =
  "relative flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-solid text-ink-soft transition-colors hover:text-ink has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-soft)] has-[:checked]:text-brand-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]";

/** 沒選時送出空的 畫面用這一類的預設圖示 */
function IconPicker({ value, onChange }: { value: CategoryIcon | null; onChange: (icon: CategoryIcon) => void }) {
  return (
    <fieldset className="field min-w-0">
      <legend className={LEGEND_CLASS}>圖示{value && <span className="font-normal text-ink-soft">：{CATEGORY_ICONS[value]}</span>}</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] justify-items-center gap-1.5">
        {CATEGORY_ICON_NAMES.map((name) => (
          <label key={name} title={CATEGORY_ICONS[name]} className={ICON_CELL}>
            <input type="radio" name="icon" value={name} checked={value === name} onChange={() => onChange(name)} aria-label={CATEGORY_ICONS[name]} className="sr-only" />
            <Icon name={name} className="size-5" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
