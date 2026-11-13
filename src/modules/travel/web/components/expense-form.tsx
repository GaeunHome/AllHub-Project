"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { InfoTip } from "@/core/ui/info-tip";
import { CURRENCIES, EXPENSE_CATEGORIES, HOME_CURRENCY, centsOf, isCurrency, rateMicrosOf, twdOf, type SplitMode } from "../../lib/expenses";
import type { TripMember } from "../../service/trips";
import { addExpenseAction, updateExpenseAction } from "../actions";
import { moneyText, type ExpenseDraft } from "../expense-view";
import { deviceClock } from "../today-view";
import { useAutoRate } from "../use-auto-rate";
import { PayerFields, SplitFields } from "./expense-split-fields";

// 使用者選的分段切換 預設跟以前一樣一個人付 大家平分 要不平分或好幾個人付才多填

type ExpenseFormProps = { tripId: number; people: TripMember[]; userId: string; expense?: ExpenseDraft; onDone: (message: string | undefined) => void; onCancel: () => void };
type PayerMode = ExpenseDraft["payerMode"];

/** 外幣打字時先換算給使用者看 還不完整時不顯示 */
function previewOf(amount: string, rate: string): string | null {
  const [cents, micros] = [centsOf(amount), rateMicrosOf(rate)];
  return cents && micros ? `約 ${moneyText(twdOf(cents, micros))}` : null;
}

export function ExpenseForm({ tripId, people, userId, expense, onDone, onCancel }: ExpenseFormProps) {
  const { state, pending, formProps } = useDialogForm(expense ? updateExpenseAction : addExpenseAction, onDone);
  const [currency, setCurrency] = useState(expense?.currency ?? HOME_CURRENCY);
  const [amount, setAmount] = useState(expense?.amount ?? "");
  const { rate, note: rateNote, typeRate, changeCurrency, changeDate } = useAutoRate(expense?.rate ?? "");
  const [payerMode, setPayerMode] = useState<PayerMode>(expense?.payerMode ?? "one");
  const [paid, setPaid] = useState<Record<string, string>>(expense?.paid ?? {});
  const [split, setSplit] = useState<SplitMode>(expense?.split ?? "even");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(expense ? expense.shares : people.map(({ id }) => id)));
  // 照金額與照比例各自一組 切換時不會把金額當成份數 照比例預設每人一份
  const [amounts, setAmounts] = useState<Record<string, string>>(expense?.split === "amount" ? expense.portions : {});
  const [units, setUnits] = useState<Record<string, string>>(expense?.split === "ratio" ? expense.portions : Object.fromEntries(people.map(({ id }) => [id, "1"])));
  const [portions, setPortions] = split === "amount" ? [amounts, setAmounts] : [units, setUnits];
  // 視窗打開時才算繪 用手機的日期 人在國外也對
  const [spentOn, setSpentOn] = useState(() => expense?.spentOn || deviceClock(new Date()).date);
  const foreign = currency !== HOME_CURRENCY;
  const total = centsOf(amount);
  const unit = isCurrency(currency) ? CURRENCIES[currency] : currency;

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
              changeCurrency(event.target.value, spentOn);
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
        <div className="field">
          <span className="flex items-center gap-1">
            <label htmlFor="trv-rate" className="field-label">
              匯率：1 {unit} 等於幾台幣
            </label>
            <InfoTip label="匯率的說明">自動帶入那天的國際中間價，比銀行賣出價低一點，可以自己改</InfoTip>
          </span>
          <input id="trv-rate" name="rate" required inputMode="decimal" value={rate} onChange={(event) => typeRate(event.target.value)} autoComplete="off" className="input tabular-nums" />
          <span role="status" className="text-ink empty:hidden">
            {rateNote}
          </span>
          {previewOf(amount, rate) && <span className="font-medium text-ink tabular-nums">{previewOf(amount, rate)}</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <label className="field">
          <span className="field-label">日期</span>
          <input
            type="date"
            name="spentOn"
            required
            value={spentOn}
            onChange={(event) => {
              setSpentOn(event.target.value);
              changeDate(currency, event.target.value);
            }}
            className="input"
          />
        </label>
        <label className="field">
          <span className="field-label">類別</span>
          <select name="category" defaultValue={expense?.category ?? "food"} className="input">
            {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PayerFields people={people} defaultPaidBy={expense?.paidBy ?? userId} payerMode={payerMode} onPayerMode={setPayerMode} paid={paid} onPaid={setPaid} total={total} currency={currency} />
      <SplitFields people={people} split={split} onSplit={setSplit} checked={checked} onChecked={setChecked} portions={portions} onPortions={setPortions} total={total} currency={currency} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
