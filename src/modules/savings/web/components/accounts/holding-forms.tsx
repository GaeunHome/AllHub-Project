"use client";

import { useId } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { formatSlashDate, type DateKey } from "../../../lib/dates";
import { buyHoldingAction, createHoldingAction, sellHoldingAction, updateHoldingAction } from "../../actions";
import { formatShares, priceText, type HoldingView } from "../../dashboard-view";
import { pickAccount } from "../../last-used";
import { AccountSelect, AmountField, DateField, FormButtons, NoteField } from "../forms/fields";
import type { AccountOption } from "../forms/options";

type DoneProps = { onDone: (message: string | undefined) => void; onCancel: () => void };

type SharesFieldProps = {
  name?: string;
  label?: string;
  defaultValue?: number | null;
  autoFocus?: boolean;
  hint?: string;
  /** 說明寫在欄位外面時給它的 id 報讀器一樣會念 */
  describedBy?: string;
};

/** 台股最小單位是 1 股 只收整數 用文字欄位 手機一樣跳數字鍵盤 */
export function SharesField({ name = "shares", label = "股數", defaultValue, autoFocus = false, hint, describedBy }: SharesFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        required
        defaultValue={defaultValue ?? undefined}
        data-autofocus={autoFocus || undefined}
        aria-describedby={hint ? `${id}-hint` : describedBy}
        className="input text-right font-semibold tabular-nums"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

/** 照券商 App 的庫存頁填 代號找不到時伺服器會說 */
export function AddHoldingForm({ accountId, onDone, onCancel }: { accountId: number } & DoneProps) {
  const { state, pending, formProps } = useDialogForm(createHoldingAction, onDone);
  const symbolId = useId();
  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="field">
        <label htmlFor={symbolId} className="field-label">
          代號
        </label>
        <input id={symbolId} name="symbol" required maxLength={6} autoComplete="off" autoCapitalize="characters" placeholder="例如 006208" data-autofocus className="input uppercase" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SharesField label="目前股數" />
        <AmountField name="cost" label="目前總成本（元）" required />
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="新增" pendingLabel="查詢代號中…" />
    </form>
  );
}

/** 配股或跟券商 App 對不上時直接改 不產生紀錄 */
export function EditHoldingForm({ holding, onDone, onCancel }: { holding: HoldingView } & DoneProps) {
  const { state, pending, formProps } = useDialogForm(updateHoldingAction, onDone);
  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="id" value={holding.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SharesField label="目前股數" defaultValue={holding.shares} autoFocus />
        <AmountField name="cost" label="目前總成本（元）" defaultValue={holding.cost} required />
      </div>
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="儲存" pendingLabel="儲存中…" />
    </form>
  );
}

type BuySellFormProps = {
  side: "buy" | "sell";
  holding: HoldingView;
  /** 啟用中的存款帳戶 買進從這裡扣款 賣出入帳到這裡 */
  accounts: AccountOption[];
  today: DateKey;
  minDate: DateKey;
} & DoneProps;

/** 金額照券商的成交填 買進含手續費 賣出是實際入帳 */
export function BuySellForm({ side, holding, accounts, today, minDate, onDone, onCancel }: BuySellFormProps) {
  const buy = side === "buy";
  const { state, pending, formProps } = useDialogForm(buy ? buyHoldingAction : sellHoldingAction, onDone);

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="holdingId" value={holding.id} />
      <p className="text-ink-soft">
        目前 {formatShares(holding.shares)}
        {holding.closeCents !== null && holding.quoteDate !== null && ` · ${formatSlashDate(holding.quoteDate)} 收盤 ${priceText(holding.closeCents)}`}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SharesField label={buy ? "買進股數" : "賣出股數"} autoFocus />
        <AmountField name="amount" label={buy ? "實際扣款（含手續費）" : "實際入帳"} required />
      </div>
      <AccountSelect name={buy ? "fromAccountId" : "toAccountId"} label={buy ? "扣款帳戶" : "入帳帳戶"} accounts={accounts} defaultValue={pickAccount(accounts, holding.settlementAccountId)} />
      <DateField defaultValue={today} today={today} min={minDate} />
      <NoteField placeholder={`留空會寫「${buy ? "買進" : "賣出"} ${holding.symbol} N 股」`} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={buy ? "記下買進" : "記下賣出"} pendingLabel="記錄中…" />
    </form>
  );
}
