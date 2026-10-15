"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import { MoreMenu } from "@/core/ui/more-menu";
import { formatDay } from "../../../lib/dates";
import { deleteTransactionAction, updateTransactionAction } from "../../actions";
import { AMOUNT_TONE_CLASS, entryDetails, entryTitle, signedAmount } from "../../entry-display";
import { choosableAccounts } from "../../form-math";
import type { RecordItem } from "../../record-filter";
import { ColorDot } from "../color-dot";
import { EntryForm } from "../forms/entry-form";
import type { AccountChoice, CategoryOption } from "../forms/options";
import { TRANSACTION_KIND_ICONS } from "../kind-icon";
import { DeleteMenuItem } from "../row-controls";

// 手機上修改鈕只留圖示 整列才放得下
// 調整那一列放一個看不見的 金額才跟其他列對齊
const EDIT_BUTTON = "btn-ghost btn-sm btn-icon sm:w-auto sm:px-3";

type RecordRowProps = {
  record: RecordItem;
  accounts: readonly AccountChoice[];
  categories: readonly CategoryOption[];
  today: string;
  /** 刪除後這一列會跟選單一起消失 訊息交給清單上方 */
  onDeleted: (message: string) => void;
};

/** 刪除收在選單裡 選單收起時面板會卸載 所以修改的視窗不能放在裡面 */
export function RecordRow({ record, accounts, categories, today, onDeleted }: RecordRowProps) {
  const edit = useDialog();
  // 信用卡的調整照未繳的方向寫 要知道帳戶類型
  const accountKind = accounts.find((account) => account.id === record.accountId)?.kind;
  const title = entryTitle(record, accountKind);
  const amount = signedAmount(record.kind, record.amount, accountKind);
  // 調整只能刪除 不能修改
  const entryKind = record.kind === "adjust" ? null : record.kind;
  const detail = entryDetails(record).join(" · ");

  return (
    <li className="card-row stack">
      {/* 寬螢幕排成一行 帳戶與備註在名稱後面同一欄 每一列才對齊 */}
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] lg:grid-cols-[1.25rem_minmax(0,15rem)_minmax(0,1fr)_auto_auto]">
        <span className="col-start-1 row-span-2 row-start-1 grid place-items-center lg:row-span-1">
          {record.categoryColor ? <ColorDot color={record.categoryColor} className="size-3" /> : <Icon name={TRANSACTION_KIND_ICONS[record.kind]} className="size-4 text-ink-soft" />}
        </span>
        <p className="col-start-2 row-start-1 flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-ink">{title}</span>
          {record.recurring && (
            <span className="chip shrink-0">
              <Icon name="repeat" className="size-3" />
              自動
            </span>
          )}
        </p>
        {detail && <p className="col-start-2 row-start-2 truncate text-sm text-ink-soft lg:col-start-3 lg:row-start-1">{detail}</p>}
        <span className={`col-start-3 row-start-1 text-right font-semibold tabular-nums sm:row-span-2 lg:col-start-4 lg:row-span-1 ${AMOUNT_TONE_CLASS[amount.tone]}`}>{amount.text}</span>
        <div className="col-start-3 row-start-2 flex items-center justify-end gap-1 sm:col-start-4 sm:row-span-2 sm:row-start-1 lg:col-start-5 lg:row-span-1">
          {entryKind ? (
            <button {...edit.triggerProps} aria-label={`修改：${title} ${amount.text}`} className={EDIT_BUTTON}>
              <Icon name="pencil" className="size-4" />
              <span className="hidden sm:inline">修改</span>
            </button>
          ) : (
            <span aria-hidden className={`invisible ${EDIT_BUTTON}`}>
              <Icon name="pencil" className="size-4" />
              <span className="hidden sm:inline">修改</span>
            </span>
          )}
          <MoreMenu label={`「${title}」${amount.text} 的選項`}>
            {!entryKind && <p className="px-3 py-1.5 text-sm text-ink-soft">更新餘額的調整不能修改；記錯了可以刪除，再更新一次餘額。</p>}
            <DeleteMenuItem
              action={deleteTransactionAction}
              id={record.id}
              confirmMessage={`確定刪除 ${formatDay(record.date)}的「${title} ${amount.text}」？刪除後無法復原。`}
              label="刪除這筆紀錄"
              deletedMessage={`已刪除：${title} ${amount.text}`}
              onDeleted={onDeleted}
            />
          </MoreMenu>
        </div>
      </div>
      <DialogMessage {...edit.messageProps} />
      {entryKind && (
        <Dialog {...edit.dialogProps} title="修改紀錄" icon={<Icon name="pencil" />}>
          <EntryForm
            accounts={choosableAccounts(accounts, record.accountId, record.counterAccountId)}
            categories={categories}
            today={today}
            action={updateTransactionAction}
            entry={{ ...record, kind: entryKind }}
            onDone={edit.done}
            onCancel={edit.close}
          />
        </Dialog>
      )}
    </li>
  );
}
