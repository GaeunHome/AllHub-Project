"use client";

import { ActionButton } from "@/core/ui/action-button";
import { Dialog, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import type { TripSummary } from "../../service/trips";
import { deleteTripAction, leaveTripAction } from "../actions";
import { TripForm } from "./trip-form";

/** 成員都能改旅程 只有建立的人能刪 視窗放在選單外面才不會跟著收起 */
export function TripMenu({ trip, isManager }: { trip: TripSummary; isManager: boolean }) {
  const edit = useDialog();
  return (
    <>
      <MoreMenu label="旅程的選項" triggerClassName="scene-button">
        <button {...edit.triggerProps} className="menu-item">
          <Icon name="pencil" className="size-4" />
          修改旅程
        </button>
        <ActionButton action={leaveTripAction} fields={{ tripId: trip.id }} confirmMessage={`確定離開「${trip.title}」？`} formClassName="flex flex-col" className="menu-item">
          <Icon name="log-out" className="size-4" />
          離開旅程
        </ActionButton>
        {isManager && (
          <ActionButton action={deleteTripAction} fields={{ tripId: trip.id }} confirmMessage={`確定刪除「${trip.title}」？所有人都看不到了，無法復原。`} formClassName="flex flex-col" className="menu-item">
            <Icon name="trash-2" className="size-4" />
            刪除旅程
          </ActionButton>
        )}
      </MoreMenu>
      <Dialog {...edit.dialogProps} title="修改旅程" size="sm">
        <TripForm trip={trip} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </>
  );
}
