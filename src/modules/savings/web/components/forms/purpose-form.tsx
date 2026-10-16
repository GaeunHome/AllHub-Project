"use client";

import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import type { PaletteColor } from "../../../lib/kinds";
import { createPurposeAction, updatePurposeAction } from "../../actions";
import { selectableColor } from "../../form-math";
import { FormButtons, NameField } from "./fields";

export type PurposeDraft = { id: number; name: string; color: PaletteColor };

type PurposeFormProps = {
  purpose?: PurposeDraft;
  /** 資料表要一個顏色 新增時用還沒用過的 修改灰色的舊用途也換成它 */
  defaultColor: PaletteColor;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

export function PurposeForm({ purpose, defaultColor, onDone, onCancel }: PurposeFormProps) {
  const { state, pending, formProps } = useDialogForm(purpose ? updatePurposeAction : createPurposeAction, onDone);

  return (
    <form {...formProps} className="stack">
      {purpose && <input type="hidden" name="id" value={purpose.id} />}
      <input type="hidden" name="color" value={purpose ? selectableColor(purpose.color, defaultColor) : defaultColor} />
      <NameField defaultValue={purpose?.name} placeholder="例如：生活費、旅遊基金" />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={purpose ? "儲存" : "新增用途"} pendingLabel={purpose ? "儲存中…" : "新增中…"} icon={purpose ? "check" : "plus"} />
    </form>
  );
}
