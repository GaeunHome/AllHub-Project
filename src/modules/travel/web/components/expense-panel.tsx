"use client";

import { ActionButton } from "@/core/ui/action-button";
import { CopyButton } from "@/core/ui/copy-button";
import { DeleteMenuItem } from "@/core/ui/delete-menu-item";
import { Dialog, DialogButton, useDialog } from "@/core/ui/dialog";
import { EmptyState } from "@/core/ui/empty-state";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { InfoTip } from "@/core/ui/info-tip";
import { MoreMenu } from "@/core/ui/more-menu";
import type { ExpenseCategory } from "../../lib/expenses";
import type { TripMember } from "../../service/trips";
import { deleteExpenseAction, settleTransferAction, undoSettlementAction } from "../actions";
import type { DetailLine, ExpenseBoard, ExpenseRow, PersonRow, TransferRow } from "../expense-view";
import { ExpenseForm } from "./expense-form";
import { RepaymentForm } from "./repayment-form";

// 使用者選的由上到下四段 總共與類別 每個人 誰給誰 每一筆照日期分組

type ExpensePanelProps = { tripId: number; userId: string; members: TripMember[]; people: TripMember[]; board: ExpenseBoard };

const CATEGORY_ICONS: Record<ExpenseCategory, UiIconName> = {
  food: "utensils",
  transport: "train-front",
  lodging: "house",
  tickets: "ticket",
  shopping: "shopping-bag",
  fun: "sparkles",
  souvenirs: "gift",
  other: "receipt",
};

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
      size="md"
    >
      {({ done, close }) => <ExpenseForm tripId={tripId} people={members} userId={userId} rates={rates} onDone={done} onCancel={close} />}
    </DialogButton>
  );
}

function Lines({ title, lines }: { title: string; lines: DetailLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="stack gap-2">
      <h3 className="font-semibold text-ink">{title}</h3>
      <ul className="stack gap-2">
        {lines.map((line, index) => (
          <li key={index} className="flex items-start gap-3 text-ink">
            <span className="min-w-0 flex-1 break-words">{line.text}</span>
            <span className="tabular-nums">{line.money}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 參考分帳龍寶寶的帳目明細 點名字看他付的 分到的與還款 */
function Person({ person }: { person: PersonRow }) {
  const { paid, shares, repayments } = person.detail;
  const empty = paid.length + shares.length + repayments.length === 0;
  return (
    <tr>
      <th scope="row">
        <DialogButton
          label={
            <>
              <span className="min-w-0 break-words">{person.name}</span>
              <Icon name="chevron-right" className="size-3.5 shrink-0" />
            </>
          }
          buttonClassName="trv-person"
          title={`${person.name}的帳`}
          size="sm"
        >
          {empty ? (
            <p className="text-ink">還沒有這個人的帳</p>
          ) : (
            <div className="stack">
              <Lines title="付的" lines={paid} />
              <Lines title="分到的" lines={shares} />
              <Lines title="還款" lines={repayments} />
            </div>
          )}
        </DialogButton>
      </th>
      <td>{person.paid}</td>
      <td>{person.share}</td>
      <td className="font-semibold">{person.balance}</td>
    </tr>
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
      <span className="trv-category" aria-hidden="true">
        <Icon name={CATEGORY_ICONS[row.category]} className="size-4" />
      </span>
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
      <Dialog {...edit.dialogProps} title={`修改「${row.title}」`} size="md">
        <ExpenseForm tripId={tripId} people={row.people} userId={userId} rates={rates} expense={row.draft} onDone={edit.done} onCancel={edit.close} />
      </Dialog>
    </li>
  );
}

/** 帳都在同一區 金額一律是換算後的台幣 還款也用台幣 */
export function ExpensePanel({ tripId, userId, members, people, board }: ExpensePanelProps) {
  const add = <AddExpense tripId={tripId} userId={userId} members={members} rates={board.rates} />;
  return (
    <details className="card trv-fold @container lg:col-span-2">
      <summary>
        <h2>分帳</h2>
        {board.summary && <span className="tabular-nums">{board.summary}</span>}
      </summary>
      {board.days.length === 0 ? (
        <EmptyState compact icon="receipt" title="還沒有帳" action={add} />
      ) : (
        // 寬螢幕上名字跟金額不要隔太遠 內容限寬
        <div className="stack max-w-3xl gap-6">
          <section aria-labelledby="trv-total" className="stack gap-3">
            <h3 id="trv-total" className="text-lg font-semibold text-ink">
              這趟總共 <span className="tabular-nums">{board.total}</span>
            </h3>
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {board.categories.map(({ category, label, money }) => (
                <li key={category} className="flex items-center gap-1.5 text-ink">
                  <Icon name={CATEGORY_ICONS[category]} className="size-4" />
                  {label}
                  <span className="font-semibold tabular-nums">{money}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="trv-people" className="trv-money-part stack gap-3">
            <h3 id="trv-people" className="flex items-center gap-1 font-semibold text-ink">
              每個人
              <InfoTip label="每個人的帳怎麼算">點名字看明細，差額已經扣掉還過的錢</InfoTip>
            </h3>
            <table className="trv-people">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">名字</span>
                  </th>
                  <th scope="col">付了</th>
                  <th scope="col">分攤</th>
                  <th scope="col">差額</th>
                </tr>
              </thead>
              <tbody>
                {board.people.map((person) => (
                  <Person key={person.id} person={person} />
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="trv-transfers" className="trv-money-part stack gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="trv-transfers" className="flex-1 font-semibold text-ink">
                誰給誰
              </h3>
              <div className="button-row">
                {board.copyText && <CopyButton text={board.copyText} label="複製結算" />}
                <DialogButton
                  label={
                    <>
                      <Icon name="banknote" className="size-4" />
                      記還款
                    </>
                  }
                  buttonClassName="btn-secondary btn-sm"
                  title="記還款"
                  size="sm"
                >
                  {({ done, close }) => <RepaymentForm tripId={tripId} userId={userId} people={people} transfers={board.transfers} onDone={done} onCancel={close} />}
                </DialogButton>
              </div>
            </div>
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
                <summary>還款紀錄（{board.settled.length}）</summary>
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

          <section aria-labelledby="trv-expenses" className="trv-money-part stack gap-3">
            <div className="flex items-center gap-2">
              <h3 id="trv-expenses" className="flex flex-1 items-center gap-1 font-semibold text-ink">
                每一筆
                <InfoTip label="分帳怎麼算">照比例分後四捨五入到元，回程 7 天後跟旅程一起刪掉</InfoTip>
              </h3>
              {add}
            </div>
            {board.days.map((day) => (
              <section key={day.key} aria-label={day.label} className="stack gap-3">
                <h4 className="font-semibold text-ink">{day.label}</h4>
                <ul className="stack">
                  {day.rows.map((row) => (
                    <Expense key={row.id} tripId={tripId} userId={userId} row={row} rates={board.rates} />
                  ))}
                </ul>
              </section>
            ))}
          </section>
        </div>
      )}
    </details>
  );
}
