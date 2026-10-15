"use client";

import Link from "next/link";
import { useId, useReducer } from "react";
import { Dialog, DialogMessage, useDialog, useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { formatTwd } from "../../../lib/money";
import { allocateSalaryAction } from "../../actions";
import { defaultIncomeCategory, salaryFormReducer, salaryPreview, salaryStartDate, type SalaryLine } from "../../form-math";
import { lastSalaryAccountPref, pickAccount } from "../../last-used";
import { SAVINGS_PATHS } from "../../paths";
import { UNCATEGORIZED_LABEL } from "../../entry-display";
import { AccountSelect, AmountField, DateField, FormButtons, NoteField, ROW_MESSAGE_CLASS } from "./fields";
import type { CategoryOption, SalaryAccountOption } from "./options";

export type SalaryButtonProps = { accounts: SalaryAccountOption[]; categories: CategoryOption[]; today: string };

/** 薪水只能進存款或投資帳戶 一個都沒有時不顯示 */
export function SalaryButton({ accounts, categories, today }: SalaryButtonProps) {
  const dialog = useDialog();
  if (!accounts.some((account) => account.kind !== "credit")) return null;

  return (
    <>
      <button {...dialog.triggerProps} className="btn-secondary">
        <Icon name="banknote" className="size-4" />
        發薪分配
      </button>
      <DialogMessage {...dialog.messageProps} className={ROW_MESSAGE_CLASS} />
      <Dialog {...dialog.dialogProps} title="發薪分配" icon={<Icon name="banknote" />} size="lg">
        <SalaryForm accounts={accounts} categories={categories} today={today} onDone={dialog.done} onCancel={dialog.close} />
      </Dialog>
    </>
  );
}

type SalaryFormProps = SalaryButtonProps & { onDone: (message: string | undefined) => void; onCancel: () => void };

function SalaryForm({ accounts, categories, today, onDone, onCancel }: SalaryFormProps) {
  const receivers = accounts.filter((account) => account.kind !== "credit");
  // 視窗打開才算繪 這時讀得到上次入帳的帳戶
  const [form, dispatch] = useReducer(salaryFormReducer, undefined, () => ({ receivingId: pickAccount(receivers, lastSalaryAccountPref.read()) ?? receivers[0].id, salaryText: "", edits: {} }));
  const { state, pending, formProps } = useDialogForm(allocateSalaryAction, (message) => {
    lastSalaryAccountPref.save(form.receivingId);
    onDone(message);
  });

  const preview = salaryPreview(accounts, form.receivingId, form.salaryText, form.edits);
  const receiving = accounts.find((account) => account.id === form.receivingId)?.name ?? "";
  const incomeCategories = categories.filter((category) => category.kind === "income");

  return (
    <form {...formProps} className="stack">
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField name="amount" label="薪水（元）" value={form.salaryText} onValueChange={(text) => dispatch({ type: "salary", text })} required autoFocus large placeholder="0" />
        <AccountSelect name="accountId" label="入帳帳戶" accounts={receivers} value={form.receivingId} onChange={(id) => dispatch({ type: "receiving", id })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">分類</span>
          <select name="categoryId" defaultValue={defaultIncomeCategory(categories) ?? ""} className="input">
            {incomeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value="">{UNCATEGORIZED_LABEL}</option>
          </select>
        </label>
        <DateField defaultValue={today} today={today} min={salaryStartDate(accounts, form.receivingId, preview.lines)} />
      </div>
      <NoteField placeholder="例如：10 月薪水" />

      <fieldset className="stack min-w-0">
        <legend className="float-left font-semibold text-ink">轉到各帳戶</legend>
        {preview.lines.length === 0 ? (
          <p className="notice">
            <Icon name="info" />
            <span>
              還沒有帳戶設定每月規劃，薪水會全部留在「{receiving}」。可以到
              <Link href={SAVINGS_PATHS.accounts} className="link">
                設定
              </Link>
              幫帳戶加上每月規劃。
            </span>
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {preview.lines.map((line) => (
              <AllocationRow
                key={line.accountId}
                line={line}
                account={accounts.find((account) => account.id === line.accountId)}
                onChange={(text) => dispatch({ type: "edit", accountId: line.accountId, text })}
              />
            ))}
          </ul>
        )}
      </fieldset>

      <Remainder receiving={receiving} remainder={preview.remainder} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label="記錄並分配" pendingLabel="分配中…" disabled={preview.blocked} />
    </form>
  );
}

function reasonOf(line: SalaryLine, account: SalaryAccountOption | undefined): string {
  const plan = account?.monthlyPlan ? `每月規劃 ${formatTwd(account.monthlyPlan)}` : "";
  if (line.reason === "target-reached") return `已達目標${account?.targetAmount ? ` ${formatTwd(account.targetAmount)}` : ""}，這次不用再轉`;
  if (line.reason === "target-capped") return `離目標只差 ${formatTwd(line.suggested)}（${plan}）`;
  return plan;
}

/** 清空當成不轉 打錯的要標出來 伺服器不收 不能當成 0 悄悄送出 */
function AllocationRow({ line, account, onChange }: { line: SalaryLine; account: SalaryAccountOption | undefined; onChange: (text: string) => void }) {
  const id = useId();
  const name = account?.name ?? "";
  return (
    <li className="flex flex-col gap-1.5 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <input type="hidden" name="transferAccountId" value={line.accountId} />
        <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold break-words text-ink">{name}</span>
          <span className={`text-sm ${line.reason === "plan" ? "text-ink-soft" : "text-success"}`}>{reasonOf(line, account)}</span>
        </label>
        <div className="relative flex w-32 shrink-0 items-center">
          <span aria-hidden className="pointer-events-none absolute left-3 font-semibold text-ink-soft">
            $
          </span>
          <input
            id={id}
            name="transferAmount"
            inputMode="numeric"
            autoComplete="off"
            value={line.text}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={line.invalid || undefined}
            aria-describedby={line.invalid ? `${id}-error` : undefined}
            className="input pl-7 text-right font-semibold tabular-nums"
          />
        </div>
      </div>
      {line.invalid && (
        <p id={`${id}-error`} className="flex items-center justify-end gap-1.5 text-sm text-danger">
          <Icon name="circle-alert" className="size-4" />
          金額只能是整數（單位：元），不轉就清空
        </p>
      )}
    </li>
  );
}

/** 分出去的比薪水多時改成警告並停用按鈕 伺服器也會擋 */
function Remainder({ receiving, remainder }: { receiving: string; remainder: number | null }) {
  const over = remainder !== null && remainder < 0;
  return (
    <div aria-live="polite" className={`panel flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${over ? "bg-[var(--danger-soft)] text-danger" : "text-ink"}`}>
      <span className="flex items-center gap-2 font-medium">
        {over && <Icon name="circle-alert" className="size-4" />}
        {over ? "分出去的比薪水多：" : `留在「${receiving}」：`}
      </span>
      <span className="text-lg font-semibold tabular-nums">{remainder === null ? "輸入薪水後試算" : formatTwd(Math.abs(remainder))}</span>
    </div>
  );
}
