"use client";

import { DialogButton, useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import type { TripSummary } from "../../service/trips";
import { createTripAction, updateTripAction } from "../actions";

type TripFormProps = { trip?: TripSummary; onDone: (message: string | undefined) => void; onCancel: () => void };

/** 新增成功後伺服器導到旅程頁 修改留在原地 */
export function TripForm({ trip, onDone, onCancel }: TripFormProps) {
  const { state, pending, formProps } = useDialogForm(trip ? updateTripAction : createTripAction, onDone);
  return (
    <form {...formProps} className="stack">
      {trip && <input type="hidden" name="tripId" value={trip.id} />}
      <label className="field">
        <span className="field-label">旅程名稱</span>
        <input name="title" required defaultValue={trip?.title} placeholder="例如：京都五日遊" autoComplete="off" data-autofocus className="input" />
      </label>
      <label className="field">
        <span className="field-label">目的地（選填，查地圖時會帶上）</span>
        <input name="destination" defaultValue={trip?.destination ?? ""} placeholder="例如：京都" autoComplete="off" className="input" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">
          <span className="field-label">出發</span>
          <input name="startDate" type="date" required defaultValue={trip?.startDate} className="input" />
        </label>
        <label className="field">
          <span className="field-label">回程</span>
          <input name="endDate" type="date" required defaultValue={trip?.endDate} className="input" />
        </label>
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}

export function NewTripButton() {
  return (
    <DialogButton
      label={
        <>
          <Icon name="plus" className="size-4" />
          新增旅程
        </>
      }
      buttonClassName="btn-primary"
      title="新增旅程"
      size="sm"
    >
      {({ done, close }) => <TripForm onDone={done} onCancel={close} />}
    </DialogButton>
  );
}
