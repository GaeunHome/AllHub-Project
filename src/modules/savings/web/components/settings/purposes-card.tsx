"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import type { PaletteColor } from "../../../lib/kinds";
import { deletePurposeAction, movePurposeAction } from "../../actions";
import { nextFreeColor } from "../../form-math";
import { purposeDeleteWarning } from "../../settings-display";
import { PurposeForm, type PurposeDraft } from "../forms/purpose-form";
import { DeleteMenuItem, LIST_ROW_MESSAGE, ListRow, MoveMenuItems, useRemovalNotice } from "../row-controls";

/** accountCount 是用到它的帳戶數 刪除前提醒這些會改成未設定 */
export type PurposeItem = PurposeDraft & { accountCount: number };

export function PurposesCard({ purposes }: { purposes: PurposeItem[] }) {
  const add = useDialog();
  const removal = useRemovalNotice();
  // 畫面不顯示顏色 但資料表要一個 分到不同的顏色以後要用時才分得出來
  const freeColor = nextFreeColor(purposes.map((purpose) => purpose.color));

  return (
    <section aria-labelledby="savings-purposes" className="card stack overflow-hidden">
      <CardHeader
        id="savings-purposes"
        actions={
          <button {...add.triggerProps} aria-label="新增用途" className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增
          </button>
        }
      >
        用途
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title="新增用途" size="sm">
        <PurposeForm defaultColor={freeColor} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {purposes.length === 0 ? (
        <p className="text-ink">還沒有用途，按「新增」加一個，例如生活費、緊急預備金。</p>
      ) : (
        <ul className="card-list">
          {purposes.map((purpose, index) => (
            <PurposeRow key={purpose.id} purpose={purpose} isFirst={index === 0} isLast={index === purposes.length - 1} freeColor={freeColor} onDeleted={removal.report} />
          ))}
        </ul>
      )}
    </section>
  );
}

type PurposeRowProps = { purpose: PurposeItem; isFirst: boolean; isLast: boolean; freeColor: PaletteColor; onDeleted: (message: string) => void };

function PurposeRow({ purpose, isFirst, isLast, freeColor, onDeleted }: PurposeRowProps) {
  const edit = useDialog();

  return (
    <ListRow
      title={purpose.name}
      detail={purpose.accountCount > 0 ? `${purpose.accountCount} 個帳戶` : "沒有帳戶使用"}
      trigger={edit.triggerProps}
      actionLabel="修改"
      menu={
        <MoreMenu label={`「${purpose.name}」的選項`}>
          <MoveMenuItems action={movePurposeAction} id={purpose.id} isFirst={isFirst} isLast={isLast} />
          <DeleteMenuItem
            action={deletePurposeAction}
            id={purpose.id}
            confirmMessage={purposeDeleteWarning(purpose.name, purpose.accountCount)}
            label="刪除用途"
            deletedMessage={`已刪除「${purpose.name}」`}
            onDeleted={onDeleted}
          />
        </MoreMenu>
      }
    >
      <DialogMessage {...edit.messageProps} className={LIST_ROW_MESSAGE} />
      <Dialog {...edit.dialogProps} title={`修改「${purpose.name}」`} size="sm">
        <PurposeForm purpose={purpose} defaultColor={freeColor} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </ListRow>
  );
}
