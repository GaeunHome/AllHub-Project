"use client";

import { Dialog, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { WORLD_CITIES } from "../../lib/cities";
import { COUNTIES } from "../../lib/counties";
import { addPlaceAction } from "../actions";

const PLACE_GROUPS = [
  { label: "台灣", names: COUNTIES },
  { label: "國外", names: WORLD_CITIES.map((place) => place.name) },
];

export function PlaceForm({ onDone, onCancel }: { onDone: (message: string | undefined) => void; onCancel: () => void }) {
  const { state, pending, formProps } = useDialogForm(addPlaceAction, onDone);

  return (
    <form {...formProps} className="stack">
      <label className="field">
        <span className="field-label">城市</span>
        <select name="choice" required defaultValue="" data-autofocus className="input">
          <option value="" disabled>
            請選擇
          </option>
          {PLACE_GROUPS.map(({ label, names }) => (
            <optgroup key={label} label={label}>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="新增" pendingLabel="新增中…" icon="plus" />
    </form>
  );
}

export function AddPlaceButton({ className = "wx-chip" }: { className?: string }) {
  const dialog = useDialog();
  return (
    <>
      <button {...dialog.triggerProps} className={className}>
        <Icon name="plus" className="size-4" />
        新增城市
      </button>
      <Dialog {...dialog.dialogProps} title="新增城市" size="sm">
        <PlaceForm onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}
