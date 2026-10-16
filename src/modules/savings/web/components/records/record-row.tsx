"use client";

import { Dialog, DialogMessage, useDialog } from "@/core/ui/dialog";
import { MoreMenu } from "@/core/ui/more-menu";
import { formatDay } from "../../../lib/dates";
import { formatNumber } from "../../../lib/money";
import { deleteTransactionAction, updateTransactionAction } from "../../actions";
import { isTrade, recordDetails, recordIcon, recordTitle, signedAmount } from "../../entry-display";
import { choosableAccounts } from "../../form-math";
import type { RecordItem } from "../../record-filter";
import { BillRowForm } from "../forms/bill-row-form";
import { EntryForm } from "../forms/entry-form";
import type { AccountChoice, CategoryOption } from "../forms/options";
import { TradeForm } from "../forms/trade-form";
import { DeleteMenuItem, LIST_ROW_MESSAGE } from "../row-controls";
import { IconTile, Ticker } from "../visuals";

type RecordRowProps = {
  record: RecordItem;
  accounts: readonly AccountChoice[];
  categories: readonly CategoryOption[];
  today: string;
  /** 刪除後這一列會跟選單一起消失 訊息交給清單上方 */
  onDeleted: (message: string) => void;
};

// 手機兩行 寬螢幕排成一行 名稱固定寬 說明在中間一欄 每一列才對齊
const ROW_GRID = "grid min-h-14 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-3 pr-2 pl-5 text-left sm:pl-6 lg:grid-cols-[auto_minmax(0,16rem)_minmax(0,1fr)_auto]";

/** 刪掉後會連動的事寫在確認裡 沒有連動才是無法復原 */
function deleteConsequence(record: RecordItem, trade: boolean): string {
  const parts = [
    trade && "持股的股數和成本會跟著還原",
    record.backToPending && "這一期會回到總覽的「這個月要做的事」",
    record.cardBillId !== null && "這張帳單會一起撤銷，總覽會再請你填這一期的帳單",
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join("，")}。` : "刪除後無法復原。";
}

const NOT_EDITABLE = { adjust: "更新餘額的調整不能修改；記錯了可以刪除，再更新一次餘額。", bill: "帳單差額不能修改；要改請重填這一期的帳單。" };

/** 點一列修改 刪除收在 ⋮ 調整只能刪除 */
export function RecordRow({ record, accounts, categories, today, onDeleted }: RecordRowProps) {
  const edit = useDialog();
  // 信用卡的調整照未繳的方向寫 要知道帳戶類型
  const accountKind = accounts.find((account) => account.id === record.accountId)?.kind;
  const title = recordTitle(record, accountKind);
  const amount = signedAmount(record.kind, record.amount, accountKind);
  const detail = recordDetails(record).join(" · ");
  const trade = isTrade(record);
  // 調整只能刪除 不能修改
  const entryKind = record.kind === "adjust" ? null : record.kind;
  const editable = entryKind !== null;
  const content = (
    <>
      <span className="col-start-1 row-span-2 row-start-1 lg:row-span-1">
        <IconTile name={recordIcon(record)} size="sm" />
      </span>
      <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-1.5 font-medium text-ink">
        {trade && record.holdingSymbol ? <TradeTitle shares={record.shares ?? 0} symbol={record.holdingSymbol} /> : <span className="truncate">{title}</span>}
      </span>
      {detail && <span className="col-start-2 row-start-2 truncate text-sm text-ink-soft lg:col-start-3 lg:row-start-1">{detail}</span>}
      <span className="col-start-3 row-span-2 row-start-1 text-right font-medium text-ink tabular-nums lg:col-start-4 lg:row-span-1">{amount}</span>
    </>
  );

  return (
    <li className={`flex flex-col ${editable ? "transition-colors hover:bg-surface-muted" : ""}`}>
      <div className="flex items-center">
        {editable ? (
          <button {...edit.triggerProps} className={`${ROW_GRID} cursor-pointer focus-visible:-outline-offset-2`}>
            <span className="sr-only">修改：</span>
            {content}
          </button>
        ) : (
          <div className={ROW_GRID}>{content}</div>
        )}
        <div className="shrink-0 pr-3 sm:pr-4">
          <MoreMenu label={`「${title}」${amount} 的選項`}>
            {!editable && <p className="px-3 py-1.5 text-sm text-ink-soft">{record.cardBillId === null ? NOT_EDITABLE.adjust : NOT_EDITABLE.bill}</p>}
            <DeleteMenuItem
              action={deleteTransactionAction}
              id={record.id}
              confirmMessage={`確定刪除 ${formatDay(record.date)}的「${title} ${amount}」？${deleteConsequence(record, trade)}`}
              label="刪除這筆紀錄"
              deletedMessage={`已刪除：${title} ${amount}`}
              onDeleted={onDeleted}
            />
          </MoreMenu>
        </div>
      </div>
      <DialogMessage {...edit.messageProps} className={LIST_ROW_MESSAGE} />
      {entryKind && (
        <Dialog {...edit.dialogProps} title={trade ? `修改「${title}」` : "修改紀錄"}>
          {trade ? (
            <TradeForm record={record} accounts={accounts} today={today} onDone={edit.done} onCancel={edit.close} />
          ) : record.cardBillId !== null ? (
            <BillRowForm record={record} categories={categories} onDone={edit.done} onCancel={edit.close} />
          ) : (
            <EntryForm
              accounts={choosableAccounts(accounts, record.accountId, record.counterAccountId)}
              categories={categories}
              today={today}
              action={updateTransactionAction}
              entry={{ ...record, kind: entryKind }}
              onDone={edit.done}
              onCancel={edit.close}
            />
          )}
        </Dialog>
      )}
    </li>
  );
}

/** 買賣的名稱 代號用跟投資頁一樣的樣子 空白留給報讀器 畫面的間距交給 gap */
function TradeTitle({ shares, symbol }: { shares: number; symbol: string }) {
  return (
    <>
      {shares > 0 ? "買進" : "賣出"}{" "}
      <Ticker symbol={symbol} />{" "}
      <span className="truncate">{formatNumber(Math.abs(shares))} 股</span>
    </>
  );
}
