"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { CardHeader } from "@/core/ui/page-header";
import type { PaletteColor } from "../../../lib/kinds";
import { deletePurposeAction, movePurposeAction } from "../../actions";
import { nextFreeColor } from "../../form-math";
import { purposeDeleteWarning } from "../../settings-display";
import { ColorDot } from "../color-dot";
import { PurposeForm, type PurposeDraft } from "../forms/purpose-form";
import { DeleteMenuItem, EditButton, MoveButtons, MoveMenuItems, useRemovalNotice } from "../row-controls";

/** accountCount 是用到它的帳戶數 刪除前提醒這些會改成未設定 */
export type PurposeItem = PurposeDraft & { accountCount: number };

export function PurposesCard({ purposes }: { purposes: PurposeItem[] }) {
  const add = useDialog();
  const removal = useRemovalNotice();
  // 新增時預先選好還沒用過的顏色 修改灰色的舊用途也改用它
  const freeColor = nextFreeColor(purposes.map((purpose) => purpose.color));

  return (
    <section aria-labelledby="savings-purposes" className="card stack">
      <CardHeader
        id="savings-purposes"
        icon={<Icon name="target" />}
        actions={
          <button {...add.triggerProps} className="btn-secondary btn-sm">
            <Icon name="plus" className="size-4" />
            新增用途
          </button>
        }
      >
        用途
      </CardHeader>
      <DialogMessage {...add.messageProps} />
      <DialogMessage {...removal.messageProps} />
      <Dialog {...add.dialogProps} title="新增用途" icon={<Icon name="plus" />} size="sm">
        <PurposeForm defaultColor={freeColor} onDone={add.done} onCancel={add.close} />
      </Dialog>
      {purposes.length === 0 ? (
        <EmptyState compact icon="target" title="還沒有用途" hint="例如生活費、緊急預備金、投資；總覽的資產圓餅圖可以依用途分組。" />
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
    <li className="card-row stack">
      <div className="flex items-center gap-3">
        <ColorDot color={purpose.color} className="size-3" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words text-ink">{purpose.name}</span>
          <span className="text-sm text-ink-soft">{purpose.accountCount > 0 ? `${purpose.accountCount} 個帳戶` : "沒有帳戶使用"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MoveButtons action={movePurposeAction} id={purpose.id} name={purpose.name} isFirst={isFirst} isLast={isLast} />
          <EditButton name={purpose.name} {...edit.triggerProps} />
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
        </div>
      </div>
      <DialogMessage {...edit.messageProps} />
      <Dialog {...edit.dialogProps} title={`修改「${purpose.name}」`} icon={<Icon name="pencil" />} size="sm">
        <PurposeForm purpose={purpose} defaultColor={freeColor} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}
