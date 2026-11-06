"use client";

import { ActionButton } from "@/core/ui/action-button";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, DialogButton, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { MoreMenu } from "@/core/ui/more-menu";
import type { TripMember } from "../../service/trips";
import { deleteExpenseAction, settleTransferAction, undoSettlementAction } from "../actions";
import type { ExpenseBoard, ExpenseRow, TransferRow } from "../expense-view";
import { ExpenseForm } from "./expense-form";

type ExpensePanelProps = { tripId: number; userId: string; members: TripMember[]; board: ExpenseBoard };

function AddExpense({ tripId, userId, members, rates }: { tripId: number; userId: string; members: TripMember[]; rates: ExpenseBoard["rates"] }) {
  return (
    <DialogButton
      label={
        <>
          <Icon name="plus" className="size-4" />
          記一筆
        </>
      }
      buttonClassName="btn-secondary btn-sm"
      title="記一筆帳"
      size="sm"
    >
      {({ done, close }) => <ExpenseForm tripId={tripId} people={members} userId={userId} rates={rates} onDone={done} onCancel={close} />}
    </DialogButton>
  );
}

function Transfer({ tripId, transfer }: { tripId: number; transfer: TransferRow }) {
  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 break-words text-ink">{transfer.text}</span>
      <span className="font-semibold text-ink tabular-nums">{transfer.money}</span>
      <ActionButton action={settleTransferAction} fields={{ tripId, from: transfer.from, to: transfer.to, amount: transfer.amount }} successMessage="已結清" className="btn-secondary btn-sm">
        已結清
      </ActionButton>
    </li>
  );
}

function Expense({ tripId, userId, row, rates }: { tripId: number; userId: string; row: ExpenseRow; rates: ExpenseBoard["rates"] }) {
  const edit = useDialog();
  return (
    <li className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words text-ink">{row.title}</p>
        <p className="break-words text-ink tabular-nums">{row.paid}</p>
        <p className="break-words text-ink">{row.split}</p>
      </div>
      <span className="font-semibold text-ink tabular-nums">{row.twd}</span>
      <MoreMenu label={`「${row.title}」的選項`}>
        <button {...edit.triggerProps} className="menu-item">
          <Icon name="pencil" className="size-4" />
          修改
        </button>
        <DeleteMenuItem action={deleteExpenseAction.bind(null, tripId)} fields={{ id: row.id }} confirmMessage={`確定刪除「${row.title}」？`} label="刪除" deletedMessage={`已刪除「${row.title}」`} />
      </MoreMenu>
      <Dialog {...edit.dialogProps} title={`修改「${row.title}」`} size="sm">
        <ExpenseForm tripId={tripId} people={row.people} userId={userId} rates={rates} expense={row.draft} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}

/** 帳都在同一區 金額一律是換算後的台幣 結清也用台幣 */
export function ExpensePanel({ tripId, userId, members, board }: ExpensePanelProps) {
  const add = <AddExpense tripId={tripId} userId={userId} members={members} rates={board.rates} />;
  return (
    <details className="card trv-fold @container lg:col-span-2">
      <summary>
        <h2>分帳</h2>
        {board.summary && <span className="tabular-nums">{board.summary}</span>}
      </summary>
      {board.rows.length === 0 ? (
        <EmptyState compact icon="receipt" title="還沒有帳" action={add} />
      ) : (
        <div className="grid items-start gap-6 @3xl:grid-cols-2">
          <section aria-labelledby="trv-transfers" className="stack">
            <h3 id="trv-transfers" className="font-semibold text-ink">
              誰給誰
            </h3>
            {board.transfers.length > 0 ? (
              <ul className="stack">
                {board.transfers.map((transfer) => (
                  <Transfer key={transfer.key} tripId={tripId} transfer={transfer} />
                ))}
              </ul>
            ) : (
              <p className="text-ink">都結清了</p>
            )}
            {board.settled.length > 0 && (
              <details className="disclosure">
                <summary>已結清（{board.settled.length}）</summary>
                <ul className="stack">
                  {board.settled.map((settled) => (
                    <li key={settled.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 break-words text-ink">{settled.text}</span>
                      <span className="text-ink tabular-nums">{settled.money}</span>
                      <ActionButton action={undoSettlementAction} fields={{ tripId, settlementId: settled.id }} successMessage="已復原" className="btn-ghost btn-sm">
                        復原
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section aria-labelledby="trv-expenses" className="stack">
            <div className="flex items-center gap-2">
              <h3 id="trv-expenses" className="flex-1 font-semibold text-ink">
                每一筆
                <InfoTip label="分帳怎麼算">平分後四捨五入到元，回程 7 天後跟旅程一起刪掉</InfoTip>
              </h3>
              {add}
            </div>
            <ul className="stack">
              {board.rows.map((row) => (
                <Expense key={row.id} tripId={tripId} userId={userId} row={row} rates={board.rates} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </details>
  );
}
