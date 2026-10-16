"use client";

import { useId, useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { StatusChip } from "@/core/ui/status-chip";
import { formatSlashDate, type DateKey } from "../../../lib/dates";
import { formatTwd } from "../../../lib/money";
import { enterCardBillAction, payCardAction } from "../../actions";
import type { BillDraft, BillHistoryRow } from "../../dashboard-view";
import { UNCATEGORIZED_LABEL } from "../../entry-display";
import { pickAccount } from "../../last-used";
import { AccountSelect, AmountField, CheckboxField, DateField, FormButtons } from "../forms/fields";
import type { AccountOption, CategoryOption } from "../forms/options";

type BillFormProps = {
  draft: BillDraft;
  /** 差額記成支出時的分類 只列支出的 */
  categories: readonly CategoryOption[];
  /** 同時記下繳款時從哪個存款帳戶繳 沒有存款帳戶就不能一起繳 */
  accounts: AccountOption[];
  today: DateKey;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 勾了同時記下繳款就交給 payCardAction 帳單與繳款在同一個交易裡 */
function submitBill(previous: FormState, formData: FormData): Promise<FormState> {
  return formData.has("billAmount") ? payCardAction(previous, formData) : enterCardBillAction(previous, formData);
}

/**
 * 照銀行 App 的帳單填 跟紀錄對不上的差額伺服器自動補一筆
 * 繳款金額沒動過就跟著帳單金額 通常是整張繳清
 */
export function BillForm({ draft, categories, accounts, today, onDone, onCancel }: BillFormProps) {
  const { state, pending, formProps } = useDialogForm(submitBill, onDone);
  const [billText, setBillText] = useState(draft.estimate > 0 ? String(draft.estimate) : "");
  const [payToo, setPayToo] = useState(false);
  const [payText, setPayText] = useState<string | null>(null);
  const label = draft.statementDate === null ? "這一期的帳單金額（元）" : `${formatSlashDate(draft.statementDate)} 結帳的帳單金額（元）`;

  return (
    <form {...formProps} className="stack">
      <input type="hidden" name="cardId" value={draft.cardId} />
      <AmountField
        name={payToo ? "billAmount" : "amount"}
        label={label}
        value={billText}
        onValueChange={setBillText}
        required
        autoFocus
        large
        placeholder="0"
        hint={`比紀錄上的 ${formatTwd(draft.estimate)} 多的部分，會記成一筆「未記錄的刷卡」。`}
      />
      <label className="field">
        <span className="field-label">差額的分類（選填）</span>
        <select name="categoryId" defaultValue="" className="input">
          <option value="">{UNCATEGORIZED_LABEL}</option>
          {categories
            .filter((category) => category.kind === "expense")
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
      </label>
      {accounts.length > 0 && <CheckboxField name="payToo" label="同時記下繳款" checked={payToo} onCheckedChange={setPayToo} />}
      {payToo && (
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField name="amount" label="繳款金額（元）" value={payText ?? billText} onValueChange={setPayText} required />
          <AccountSelect name="fromAccountId" label="從哪個帳戶繳" accounts={accounts} defaultValue={pickAccount(accounts, draft.payFromAccountId)} />
          <DateField defaultValue={today} today={today} min={draft.minDate} />
        </div>
      )}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="填帳單" pendingLabel="記錄中…" />
    </form>
  );
}

const STATUS_TEXT: Record<BillHistoryRow["status"], string> = { paid: "已繳清", unpaid: "未繳", overdue: "逾期" };

// 窄的時候每期兩行 夠寬時排成有欄位名稱的表格
const COLUMNS = "@xl:grid @xl:grid-cols-[minmax(0,1fr)_repeat(5,auto)] @xl:gap-x-5";
const ROW = "@xl:col-span-full @xl:grid-cols-subgrid @xl:gap-x-5";
const HEADERS = ["結帳日", "截止日", "帳單", "已繳", "最後繳款", "狀態"];

/** 填過的帳單 新的在前 逾期的才用標籤 */
export function BillHistory({ bills }: { bills: BillHistoryRow[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="stack @container">
      <h3 id={headingId} className="font-semibold text-ink">
        最近 {bills.length} 期
      </h3>
      <ul className={`flex flex-col divide-y divide-line border-y border-line ${COLUMNS}`}>
        {/* 欄位名稱給看得到的人 每一格另外帶報讀器念的名稱 */}
        <li aria-hidden="true" className={`hidden py-2 text-sm text-ink-soft @xl:grid ${ROW}`}>
          {HEADERS.map((header) => (
            <span key={header} className={header === "帳單" || header === "已繳" ? "text-right" : undefined}>
              {header}
            </span>
          ))}
        </li>
        {bills.map((bill) => (
          <li key={bill.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-3 ${ROW}`}>
            <span className="col-start-1 row-start-1 text-ink tabular-nums @xl:contents">
              <span className="@xl:col-start-1 @xl:row-start-1">
                {formatSlashDate(bill.statementDate)}
                <span className="@xl:sr-only"> 結帳</span>
              </span>
              <span aria-hidden="true" className="@xl:hidden">
                {" · "}
              </span>
              <span className="@xl:col-start-2 @xl:row-start-1">
                {formatSlashDate(bill.dueDate)}
                <span className="@xl:sr-only"> 截止</span>
              </span>
            </span>
            <span className="col-start-2 row-start-1 text-right font-medium text-ink tabular-nums @xl:col-start-3">
              <span className="sr-only">帳單 </span>
              {formatTwd(bill.amount)}
            </span>
            <span className="col-start-1 row-start-2 text-sm text-ink-soft tabular-nums @xl:contents @xl:text-base @xl:text-ink">
              <span className="@xl:col-start-4 @xl:row-start-1 @xl:text-right">
                <span className="@xl:sr-only">已繳 </span>
                {formatTwd(bill.paid)}
              </span>
              {bill.lastPaidOn && (
                <span aria-hidden="true" className="@xl:hidden">
                  {" · "}
                </span>
              )}
              <span className="@xl:col-start-5 @xl:row-start-1">
                {bill.lastPaidOn ? (
                  <>
                    {formatSlashDate(bill.lastPaidOn)}
                    <span className="@xl:sr-only"> 繳</span>
                  </>
                ) : (
                  <span className="hidden @xl:inline">—</span>
                )}
              </span>
            </span>
            <span className="col-start-2 row-start-2 flex justify-end @xl:col-start-6 @xl:row-start-1 @xl:justify-start">
              {bill.status === "overdue" ? <StatusChip badge={{ label: STATUS_TEXT.overdue, tone: "danger" }} /> : <span className={bill.status === "paid" ? "text-ink-soft" : "text-ink"}>{STATUS_TEXT[bill.status]}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
