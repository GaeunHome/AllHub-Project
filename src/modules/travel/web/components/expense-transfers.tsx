import { ActionButton } from "@/core/ui/action-button";
import { CopyButton } from "@/core/ui/copy-button";
import { DialogButton } from "@/core/ui/dialog";
import { Icon } from "@/core/ui/icon";
import type { TripMember } from "../../service/trips";
import { settleTransferAction, undoSettlementAction } from "../actions";
import type { ExpenseBoard, TransferRow } from "../expense-view";
import { RepaymentForm } from "./repayment-form";

// 分帳的誰給誰 已結清 記還款與還款紀錄

type TransfersSectionProps = { tripId: number; userId: string; people: TripMember[]; board: ExpenseBoard };

/** 筆數最少的結算 複製到 LINE 記還款 下面是可以復原的還款紀錄 */
export function TransfersSection({ tripId, userId, people, board }: TransfersSectionProps) {
  return (
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
