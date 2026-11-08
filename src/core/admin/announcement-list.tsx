"use client";

import { useState } from "react";
import { AnnouncementChip } from "../announcements/announcement-chip";
import { ANNOUNCEMENT_KIND_LABELS, announcementWhen, dateTimeInputValue, isAnnouncementShown } from "../announcements/rules";
import type { AnnouncementKind, CoreAnnouncement } from "../db/schema";
import { DeleteMenuItem } from "../ui/delete-menu-item";
import { Dialog, DialogButton, useDialog, useDialogForm } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { FormButtons } from "../ui/form-buttons";
import { FormFeedback } from "../ui/form-message";
import { InfoTip } from "../ui/info-tip";
import { Icon } from "../ui/icon";
import { MoreMenu } from "../ui/more-menu";
import { SegmentedControl } from "../ui/segmented-control";
import { createAnnouncementAction, deleteAnnouncementAction, updateAnnouncementAction } from "./actions";

const KIND_OPTIONS = (Object.keys(ANNOUNCEMENT_KIND_LABELS) as AnnouncementKind[]).map((id) => ({ id, label: ANNOUNCEMENT_KIND_LABELS[id] }));

type FormProps = { row?: CoreAnnouncement; onDone: (message: string | undefined) => void; onCancel: () => void };

function AnnouncementForm({ row, onDone, onCancel }: FormProps) {
  const { state, pending, formProps } = useDialogForm(row ? updateAnnouncementAction : createAnnouncementAction, onDone);
  const [kind, setKind] = useState<AnnouncementKind>(row?.kind ?? "general");
  return (
    <form {...formProps} className="stack">
      {row && <input type="hidden" name="id" value={row.id} />}
      <div className="field">
        <span className="field-label">種類</span>
        <SegmentedControl variant="field" label="種類" name="kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      </div>
      <label className="field">
        <span className="field-label">標題</span>
        <input name="title" defaultValue={row?.title} required autoComplete="off" data-autofocus className="input" />
      </label>
      <label className="field">
        <span className="field-label">內文（選填）</span>
        <textarea name="body" rows={4} defaultValue={row?.body} className="input" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">開始時間（選填）</span>
          <input type="datetime-local" name="startsAt" defaultValue={row?.startsAt ? dateTimeInputValue(row.startsAt) : ""} className="input" />
        </label>
        <label className="field">
          <span className="field-label">結束時間（選填）</span>
          <input type="datetime-local" name="endsAt" defaultValue={row?.endsAt ? dateTimeInputValue(row.endsAt) : ""} className="input" />
        </label>
      </div>
      <div className="flex items-center gap-1">
        <label className="choice-card flex-1">
          <input type="checkbox" name="pinned" value="true" defaultChecked={row?.pinned} className="size-4 shrink-0" />
          置頂到跑馬燈
        </label>
        <InfoTip label="跑馬燈的說明">全站導覽列上面的一條 停止服務與維護開始前 3 天會自動放上去</InfoTip>
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={row ? "儲存" : "發布"} pendingLabel={row ? "儲存中…" : "發布中…"} />
    </form>
  );
}

function AnnouncementRow({ row, now }: { row: CoreAnnouncement; now: Date }) {
  const edit = useDialog();
  return (
    <li className="card-row flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2">
          <AnnouncementChip kind={row.kind} />
          {row.pinned && <span className="chip">置頂</span>}
          {!isAnnouncementShown(row, now) && <span className="chip">已結束</span>}
          <span className="font-medium break-words">{row.title}</span>
        </p>
        <p className="text-ink-soft tabular-nums">{announcementWhen(row)}</p>
      </div>
      <MoreMenu label={`${row.title}的選項`}>
        <button {...edit.triggerProps} className="menu-item">
          <Icon name="pencil" className="size-4" />
          修改
        </button>
        <DeleteMenuItem action={deleteAnnouncementAction} fields={{ id: row.id }} confirmMessage={`確定刪除公告「${row.title}」？`} label="刪除" />
      </MoreMenu>
      <Dialog {...edit.dialogProps} title="修改公告" size="md">
        <AnnouncementForm row={row} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}

/** 清單有快取 有沒有結束要用這次請求的時間 所以 now 由頁面傳進來 */
export function AnnouncementList({ rows, now }: { rows: CoreAnnouncement[]; now: Date }) {
  return (
    <>
      <div className="button-row">
        <DialogButton
          label={
            <>
              <Icon name="plus" className="size-4" />
              發布公告
            </>
          }
          title="發布公告"
          size="md"
        >
          {({ done, close }) => <AnnouncementForm onDone={done} onCancel={close} />}
        </DialogButton>
      </div>
      {rows.length === 0 ? (
        <EmptyState compact icon="bell" title="還沒有公告" />
      ) : (
        <ul aria-label="已發布的公告" className="card-list">
          {rows.map((row) => (
            <AnnouncementRow key={row.id} row={row} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}
