"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { CURRENCIES, EXPENSE_CATEGORIES, HOME_CURRENCY, SPLIT_MODES, allocate, centsOf, isCurrency, rateMicrosOf, twdOf, type SplitMode } from "../../lib/expenses";
import type { TripMember } from "../../service/trips";
import { addExpenseAction, updateExpenseAction } from "../actions";
import { amountText, moneyText, type ExpenseDraft } from "../expense-view";
import { deviceClock } from "../today-view";

// 使用者選的分段切換 預設跟以前一樣一個人付 大家平分 要不平分或好幾個人付才多填

type ExpenseFormProps = { tripId: number; people: TripMember[]; userId: string; rates: Record<string, string>; expense?: ExpenseDraft; onDone: (message: string | undefined) => void; onCancel: () => void };
type PayerMode = ExpenseDraft["payerMode"];

const SPLIT_OPTIONS = Object.entries(SPLIT_MODES).map(([id, label]) => ({ id: id as SplitMode, label }));

/** 外幣打字時先換算給使用者看 還不完整時不顯示 */
function previewOf(amount: string, rate: string): string | null {
  const [cents, micros] = [centsOf(amount), rateMicrosOf(rate)];
  return cents && micros ? `約 ${moneyText(twdOf(cents, micros))}` : null;
}

/** 每個人填的加起來跟這一筆比 差多少直接寫出來 */
function sumStatus(values: Readonly<Record<string, string>>, total: number | null, currency: string): string | null {
  if (total === null) return null;
  const sum = Object.values(values).reduce((acc, text) => acc + (centsOf(text) ?? 0), 0);
  const gap = total - sum;
  return `合計 ${amountText(sum, currency)}，${gap === 0 ? "剛好" : `${gap > 0 ? "還差" : "多了"} ${amountText(Math.abs(gap), currency)}`}`;
}

/** 平分或照比例時 每個人旁邊先寫他分到多少 */
function sharePreview(total: number | null, weights: ReadonlyMap<string, number>, currency: string): Map<string, string> {
  if (total === null || [...weights.values()].every((weight) => weight <= 0)) return new Map();
  return new Map([...allocate(total, weights)].map(([id, cents]) => [id, amountText(cents, currency)]));
}

/** 付的與分的格子都寫名字 報讀器另外念這一格是什麼 */
function PersonInput({ name, label, spoken, value, onChange, preview, decimal }: { name: string; label: string; spoken: string; value: string; onChange: (value: string) => void; preview?: string; decimal: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-ink">
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {preview && <span className="text-ink tabular-nums">{preview}</span>}
      <input name={name} aria-label={spoken} value={value} onChange={(event) => onChange(event.target.value)} inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" className="input w-28 shrink-0 text-right tabular-nums" />
    </label>
  );
}

export function ExpenseForm({ tripId, people, userId, rates, expense, onDone, onCancel }: ExpenseFormProps) {
  const { state, pending, formProps } = useDialogForm(expense ? updateExpenseAction : addExpenseAction, onDone);
  const [currency, setCurrency] = useState(expense?.currency ?? HOME_CURRENCY);
  const [amount, setAmount] = useState(expense?.amount ?? "");
  const [rate, setRate] = useState(expense?.rate ?? "");
  const [payerMode, setPayerMode] = useState<PayerMode>(expense?.payerMode ?? "one");
  const [paid, setPaid] = useState<Record<string, string>>(expense?.paid ?? {});
  const [split, setSplit] = useState<SplitMode>(expense?.split ?? "even");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(expense ? expense.shares : people.map(({ id }) => id)));
  // 照金額與照比例各自一組 切換時不會把金額當成份數 照比例預設每人一份
  const [amounts, setAmounts] = useState<Record<string, string>>(expense?.split === "amount" ? expense.portions : {});
  const [units, setUnits] = useState<Record<string, string>>(expense?.split === "ratio" ? expense.portions : Object.fromEntries(people.map(({ id }) => [id, "1"])));
  const [portions, setPortions] = split === "amount" ? [amounts, setAmounts] : [units, setUnits];
  // 視窗打開時才算繪 用手機的日期 人在國外也對
  const [spentOn] = useState(() => expense?.spentOn || deviceClock(new Date()).date);
  const foreign = currency !== HOME_CURRENCY;
  const total = centsOf(amount);
  const unit = isCurrency(currency) ? CURRENCIES[currency] : currency;
  const weights = split === "even" ? new Map([...checked].map((id) => [id, 1])) : new Map(people.map(({ id }) => [id, Number(portions[id] ?? 0) || 0]));
  const previews = split === "amount" ? new Map<string, string>() : sharePreview(total, weights, currency);

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
          <span className="field-label">匯率：1 {unit} 等於幾台幣</span>
          <input name="rate" required inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} autoComplete="off" className="input tabular-nums" />
          {previewOf(amount, rate) && <span className="font-medium text-ink tabular-nums">{previewOf(amount, rate)}</span>}
        </label>
      )}
      <div className="grid grid-cols-2 gap-4">
        <label className="field">
          <span className="field-label">日期</span>
          <input type="date" name="spentOn" required defaultValue={spentOn} className="input" />
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

      <fieldset className="field">
        <legend className="field-label">誰付的</legend>
        <div className="flex flex-wrap gap-x-6">
          {(["one", "many"] as const).map((mode) => (
            <label key={mode} className="flex min-h-11 items-center gap-2 text-ink">
              <input type="radio" name="payerMode" value={mode} checked={payerMode === mode} onChange={() => setPayerMode(mode)} className="size-4.5" />
              {mode === "one" ? "一個人" : "好幾個人"}
            </label>
          ))}
        </div>
        {payerMode === "one" ? (
          <select name="paidBy" defaultValue={expense?.paidBy ?? userId} aria-label="付錢的人" className="input">
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            {people.map((person) => (
              <PersonInput key={person.id} name={`paid:${person.id}`} label={person.name} spoken={`${person.name}付了多少`} value={paid[person.id] ?? ""} onChange={(value) => setPaid({ ...paid, [person.id]: value })} decimal />
            ))}
            <p className="font-medium text-ink tabular-nums">{sumStatus(paid, total, currency)}</p>
          </>
        )}
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">怎麼分</legend>
        <SegmentedControl label="怎麼分" options={SPLIT_OPTIONS} value={split} onChange={setSplit} variant="field" name="split" />
        {split === "even"
          ? people.map((person) => (
              <label key={person.id} className="flex min-h-11 items-center gap-3 text-ink">
                <input
                  type="checkbox"
                  name="shares"
                  value={person.id}
                  checked={checked.has(person.id)}
                  onChange={(event) => setChecked(new Set(event.target.checked ? [...checked, person.id] : [...checked].filter((id) => id !== person.id)))}
                  className="size-4.5 shrink-0"
                />
                <span className="min-w-0 flex-1 break-words">{person.name}</span>
                {previews.get(person.id) && <span className="text-ink tabular-nums">{previews.get(person.id)}</span>}
              </label>
            ))
          : people.map((person) => (
              <PersonInput
                key={person.id}
                name={`portion:${person.id}`}
                label={split === "ratio" ? `${person.name}（份）` : person.name}
                spoken={split === "ratio" ? `${person.name}幾份` : `${person.name}分多少`}
                value={portions[person.id] ?? ""}
                onChange={(value) => setPortions({ ...portions, [person.id]: value })}
                preview={previews.get(person.id)}
                decimal={split === "amount"}
              />
            ))}
        {split === "amount" && <p className="font-medium text-ink tabular-nums">{sumStatus(portions, total, currency)}</p>}
        {split === "ratio" && <p className="text-ink">不分的人填 0 或留空</p>}
      </fieldset>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} />
    </form>
  );
}
