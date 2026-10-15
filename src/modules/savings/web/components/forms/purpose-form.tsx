"use client";

import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import type { PaletteColor } from "../../../lib/kinds";
import { createPurposeAction, updatePurposeAction } from "../../actions";
import { selectableColor } from "../../form-math";
import { ColorSwatches, FormButtons, NameField } from "./fields";

export type PurposeDraft = { id: number; name: string; color: PaletteColor };

type PurposeFormProps = {
  purpose?: PurposeDraft;
  /** 還沒用過的顏色 新增時預先選好 修改灰色的舊用途時也改用它 */
  defaultColor: PaletteColor;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 顏色用在資產圓餅圖與帳戶卡片的標籤 */
export function PurposeForm({ purpose, defaultColor, onDone, onCancel }: PurposeFormProps) {
  const { state, pending, formProps } = useDialogForm(purpose ? updatePurposeAction : createPurposeAction, onDone);

  return (
    <form {...formProps} className="stack">
      {purpose && <input type="hidden" name="id" value={purpose.id} />}
      <NameField defaultValue={purpose?.name} placeholder="例如：生活費、旅遊基金" />
      <ColorSwatches defaultValue={purpose ? selectableColor(purpose.color, defaultColor) : defaultColor} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={purpose ? "儲存" : "新增用途"} pendingLabel={purpose ? "儲存中…" : "新增中…"} icon={purpose ? "check" : "plus"} />
    </form>
  );
}
