"use client";

import Link from "next/link";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { formatTwd } from "../../../lib/money";
import { updateAllocationAction } from "../../actions";
import { SAVINGS_PATHS } from "../../paths";
import type { AllocationAccount } from "../../recurring-view";
import { AmountField, FormButtons } from "../forms/fields";

type AllocationFormProps = {
  /** 入帳帳戶以外 能轉進去的存款與投資帳戶 */
  accounts: AllocationAccount[];
  receivingName: string;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 一次改各帳戶的每月規劃與目標 清空就是不轉或不設目標 */
export function AllocationForm({ accounts, receivingName, onDone, onCancel }: AllocationFormProps) {
  const { state, pending, formProps } = useDialogForm(updateAllocationAction, onDone);

  if (accounts.length === 0) {
    return (
      <div className="stack">
        <p className="text-ink">
          除了「{receivingName}」還沒有別的帳戶可以轉。
          <Link href={SAVINGS_PATHS.addAccount} className="link">
            新增銀行帳戶
          </Link>
        </p>
        <div className="button-row justify-end">
          <button type="button" onClick={onCancel} className="btn-ghost">
            關閉
          </button>
        </div>
      </div>
    );
  }

  return (
    <form {...formProps} className="stack">
      <p className="text-ink">薪水入帳後照這裡的金額轉到各帳戶，剩下的留在「{receivingName}」。有目標的帳戶存到目標就不再轉。</p>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {accounts.map((account, index) => (
          <li key={account.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end">
            <input type="hidden" name="accountId" value={account.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:pb-2.5">
              <span className="font-medium break-words text-ink">{account.name}</span>
              <span className="text-sm text-ink-soft tabular-nums">目前 {formatTwd(account.balance)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:w-80 sm:shrink-0">
              <AmountField name={`monthlyPlan:${account.id}`} label={<Labelled name={account.name} text="每月轉" />} defaultValue={account.monthlyPlan} autoFocus={index === 0} placeholder="不轉" />
              <AmountField name={`targetAmount:${account.id}`} label={<Labelled name={account.name} text="存到（目標）" />} defaultValue={account.targetAmount} placeholder="不設" />
            </div>
          </li>
        ))}
      </ul>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="儲存分配" pendingLabel="儲存中…" />
    </form>
  );
}

/** 每一列的欄位名稱一樣 報讀器另外念出是哪個帳戶 */
function Labelled({ name, text }: { name: string; text: string }) {
  return (
    <>
      <span className="sr-only">{name} </span>
      {text}
    </>
  );
}
