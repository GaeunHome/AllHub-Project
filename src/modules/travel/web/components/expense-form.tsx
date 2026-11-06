"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { CURRENCIES, HOME_CURRENCY, isCurrency, parseExpense, twdOf } from "../../lib/expenses";
import type { TripMember } from "../../service/trips";
import { addExpenseAction, updateExpenseAction } from "../actions";
import { moneyText, type ExpenseDraft } from "../expense-view";

type ExpenseFormProps = { tripId: number; people: TripMember[]; userId: string; rates: Record<string, string>; expense?: ExpenseDraft; onDone: (message: string | undefined) => void; onCancel: () => void };

/** 打字時先算給使用者看 還不完整時不顯示 */
function previewOf(amount: string, currency: string, rate: string): string | null {
  const parsed = parseExpense({ title: "預覽", amount, currency, rate });
  return parsed.ok ? `約 ${moneyText(twdOf(parsed.value.amountCents, parsed.value.rateMicros))}` : null;
}

export function ExpenseForm({ tripId, people, userId, rates, expense, onDone, onCancel }: ExpenseFormProps) {
  const { state, pending, formProps } = useDialogForm(expense ? updateExpenseAction : addExpenseAction, onDone);
  const [currency, setCurrency] = useState(expense?.currency ?? HOME_CURRENCY);
  const [amount, setAmount] = useState(expense?.amount ?? "");
  const [rate, setRate] = useState(expense?.rate ?? "");
  const foreign = currency !== HOME_CURRENCY;
  const preview = foreign ? previewOf(amount, currency, rate) : null;

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="tripId" value={tripId} />
      {expense && <input type="hidden" name="expenseId" value={expense.id} />}
      <label className="field">
        <span className="field-label">項目</span>
        <input name="title" required defaultValue={expense?.title} placeholder="例如：晚餐、車票" autoComplete="off" data-autofocus className="input" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="field">
          <span className="field-label">金額</span>
          <input name="amount" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} autoComplete="off" className="input tabular-nums" />
        </label>
        <label className="field">
          <span className="field-label">貨幣</span>
          <select
            name="currency"
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setRate(rates[event.target.value] ?? "");
            }}
            className="input"
          >
            {Object.entries(CURRENCIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {foreign && (
        <label className="field">
          <span className="field-label">匯率：1 {isCurrency(currency) ? CURRENCIES[currency] : currency} 等於幾台幣</span>
          <input name="rate" required inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} autoComplete="off" className="input tabular-nums" />
          {preview && <span className="font-medium text-ink tabular-nums">{preview}</span>}
        </label>
      )}
      <label className="field">
        <span className="field-label">誰付的</span>
        <select name="paidBy" defaultValue={expense?.paidBy ?? userId} className="input">
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="field">
        <legend className="field-label">哪些人平分</legend>
        {people.map((person) => (
          <label key={person.id} className="flex min-h-11 items-center gap-3 text-ink">
            <input type="checkbox" name="shares" value={person.id} defaultChecked={expense ? expense.shares.includes(person.id) : true} className="size-4.5 shrink-0" />
            {person.name}
          </label>
        ))}
      </fieldset>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
