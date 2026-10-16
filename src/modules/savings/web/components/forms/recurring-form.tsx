"use client";

import { useId, useReducer, useState, type ReactNode } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { HOLIDAY_RULES, HOLIDAY_RULE_LABELS, INTERVAL_LABELS, INTERVAL_MONTHS, NAME_MAX_LENGTH, RECURRING_MODES, RECURRING_MODE_LABELS, type RecurringMode } from "../../../lib/kinds";
import { dateToMonth, formatMonth, monthToDate } from "../../../lib/month";
import { createRecurringAction, updateRecurringAction } from "../../actions";
import { defaultIncomeCategory, nextRunText } from "../../form-math";
import { pickAccount, pickOtherAccount } from "../../last-used";
import { Segmented } from "../segmented";
import { TransferAccounts, useEntryChoice } from "./entry-form";
import { AccountSelect, AmountField, CategoryChips, CheckboxField, DayOfMonthSelect, FormButtons, type SelectableAccount } from "./fields";
import type { CategoryOption, HoldingOption, RecurringDraft } from "./options";
import {
  RECURRING_TYPES,
  RECURRING_TYPE_LABELS,
  effectiveMode,
  entryKindOf,
  modeLockedBy,
  parseHolidayRule,
  parseInterval,
  parseMode,
  recurringFormReducer,
  recurringTypeOf,
  startMonthOptions,
  type RecurringType,
} from "./recurring-choice";

type RecurringFormProps = {
  /** 修改時帶入原本的固定收支 */
  rule?: RecurringDraft;
  accounts: readonly SelectableAccount[];
  categories: readonly CategoryOption[];
  /** 定期定額能選的持股 啟用中的投資帳戶裡的 修改時多列原本選的 */
  holdings: readonly HoldingOption[];
  today: string;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

const TYPE_OPTIONS = RECURRING_TYPES.map((type) => ({ id: type, label: RECURRING_TYPE_LABELS[type] }));

const NAME_PLACEHOLDERS: Record<RecurringType, string> = { expense: "例如：Netflix、房租", income: "例如：薪水", transfer: "例如：每月存錢", regular: "例如：006208 定期定額" };

const LOCKED_HINTS = { regular: "定期定額要確認股數", salary: "薪水要確認實際金額" } as const;

/** 下面一行即時寫出下一期的日期 含假日調整 */
export function RecurringForm({ rule, accounts, categories, holdings, today, onDone, onCancel }: RecurringFormProps) {
  const choice = useEntryChoice(
    accounts,
    categories,
    () => {
      const account = rule?.accountId ?? pickAccount(accounts);
      const kind = rule?.kind ?? "expense";
      return { kind, accountId: account, counterAccountId: rule?.counterAccountId ?? pickOtherAccount(accounts, account), categoryId: rule?.categoryId ?? null };
    },
    !rule,
  );
  const [form, dispatch] = useReducer(recurringFormReducer, undefined, () => ({
    type: rule ? recurringTypeOf(rule) : "expense",
    intervalMonths: parseInterval(rule?.intervalMonths ?? 1),
    startMonth: rule?.startMonth ? dateToMonth(rule.startMonth) : dateToMonth(today),
    day: rule?.dayOfMonth ?? Number(today.slice(8, 10)),
    holidayRule: rule?.holidayRule ?? "none",
    // 新增時預設要確認 金額不固定也不會記錯
    mode: rule?.mode ?? "confirm",
    allocate: rule?.allocate ?? false,
    suggest: !rule,
  }));
  const { state, pending, formProps } = useDialogForm(rule ? updateRecurringAction : createRecurringAction, onDone);

  const deposits = accounts.filter((account) => account.kind === "deposit");
  const [regularAccount, setRegularAccount] = useState(() => pickAccount(deposits, rule?.holdingId ? rule.accountId : undefined));
  const [holdingId, setHoldingId] = useState(() => pickAccount(holdings, rule?.holdingId));
  const holding = holdings.find((option) => option.id === holdingId);

  const changeType = (type: RecurringType) => {
    dispatch({ type: "type", value: type });
    if (type !== "regular") choice.changeKind(type);
  };
  const changeAllocate = (checked: boolean) => {
    dispatch({ type: "allocate", value: checked });
    // 薪水多半記在薪水這個分類 還沒選分類時幫忙選好
    if (checked && choice.categoryId === null) {
      const salary = defaultIncomeCategory(categories);
      if (salary !== undefined) choice.setCategoryId(salary);
    }
  };

  const locked = modeLockedBy(form);
  const mode = effectiveMode(form);
  const isRegular = form.type === "regular";
  const cannotRegular = isRegular && (holdings.length === 0 || deposits.length === 0);
  // 新增的從今天起算 之前的日期不補 用伺服器給的台北今天才跟伺服器算的一樣
  const createdAt = rule ? new Date(rule.createdAt) : new Date(`${today}T00:00:00+08:00`);
  const startMonth = form.intervalMonths === 1 ? null : monthToDate(form.startMonth);
  const next =
    rule && !rule.active
      ? "已停用：恢復後才會記帳"
      : nextRunText({ dayOfMonth: form.day, intervalMonths: form.intervalMonths, startMonth, holidayRule: form.holidayRule, lastPostedMonth: rule?.lastPostedMonth ?? null, createdAt, mode }, today, !rule);

  return (
    <form {...formProps} className="stack">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      {/* 表單不再顯示備註 修改舊規則時原樣送回 */}
      {rule?.note && <input type="hidden" name="note" value={rule.note} />}
      <input type="hidden" name="kind" value={entryKindOf(form.type)} />
      <Segmented label="類型" options={TYPE_OPTIONS} value={form.type} onChange={changeType} />
      <label className="field">
        <span className="field-label">名稱（選填）</span>
        <input name="name" maxLength={NAME_MAX_LENGTH} defaultValue={rule?.name ?? ""} placeholder={NAME_PLACEHOLDERS[form.type]} autoComplete="off" data-autofocus className="input" />
      </label>
      <AmountField name="amount" label={isRegular ? "約定金額（元）" : "預計金額（元）"} defaultValue={rule?.amount} required placeholder="0" />
      {isRegular ? (
        <RegularFields deposits={deposits} holdings={holdings} accountId={regularAccount} onAccountChange={setRegularAccount} holdingId={holdingId} onHoldingChange={setHoldingId} />
      ) : form.type === "transfer" ? (
        choice.cannotTransfer ? (
          <p className="notice">要有兩個以上的帳戶才能轉帳，請先新增帳戶。</p>
        ) : (
          <TransferAccounts choice={choice} accounts={accounts} />
        )
      ) : (
        <>
          <AccountSelect name="accountId" label="帳戶" accounts={accounts} value={choice.accountId} onChange={choice.changeAccount} />
          <CategoryChips categories={categories.filter((category) => category.kind === choice.kind)} value={choice.categoryId} onChange={choice.setCategoryId} />
          {form.type === "income" && <CheckboxField name="allocate" label="這是薪水：入帳後分配到各帳戶" checked={form.allocate} onCheckedChange={changeAllocate} />}
        </>
      )}
      {isRegular && holding && <input type="hidden" name="counterAccountId" value={holding.accountId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">多久一次</span>
          <select name="intervalMonths" value={form.intervalMonths} onChange={(event) => dispatch({ type: "interval", value: parseInterval(Number(event.target.value)) })} className="input">
            {INTERVAL_MONTHS.map((months) => (
              <option key={months} value={months}>
                {INTERVAL_LABELS[months]}
              </option>
            ))}
          </select>
        </label>
        {form.intervalMonths !== 1 && (
          <label className="field">
            <span className="field-label">從哪個月開始</span>
            <select name="startMonth" value={form.startMonth} onChange={(event) => dispatch({ type: "startMonth", value: event.target.value })} className="input">
              {startMonthOptions(today, rule?.startMonth ? dateToMonth(rule.startMonth) : null).map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </label>
        )}
        <DayOfMonthSelect name="dayOfMonth" label="日期" value={form.day} onValueChange={(day) => dispatch({ type: "day", value: day })} />
        <label className="field">
          <span className="field-label">遇假日</span>
          <select name="holidayRule" value={form.holidayRule} onChange={(event) => dispatch({ type: "holidayRule", value: parseHolidayRule(event.target.value) })} className="input">
            {HOLIDAY_RULES.map((value) => (
              <option key={value} value={value}>
                {HOLIDAY_RULE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* 改日期或遇假日時馬上念出新的日子 */}
      <p aria-live="polite" className="text-ink">
        {next}
      </p>
      <ModeSelect mode={mode} locked={locked ? LOCKED_HINTS[locked] : null} onChange={(value) => dispatch({ type: "mode", value })} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={rule ? "儲存" : "新增"} pendingLabel={rule ? "儲存中…" : "新增中…"} icon={rule ? "check" : "plus"} disabled={(form.type === "transfer" && choice.cannotTransfer) || cannotRegular} />
    </form>
  );
}

type RegularFieldsProps = {
  deposits: readonly SelectableAccount[];
  holdings: readonly HoldingOption[];
  accountId: number | undefined;
  onAccountChange: (id: number) => void;
  holdingId: number | undefined;
  onHoldingChange: (id: number) => void;
};

/** 從存款帳戶扣款 買進投資帳戶裡的一檔 轉入的帳戶由伺服器照持股決定 */
function RegularFields({ deposits, holdings, accountId, onAccountChange, holdingId, onHoldingChange }: RegularFieldsProps): ReactNode {
  if (holdings.length === 0) return <p className="notice">先到總覽打開投資帳戶，新增要定期定額的那一檔。</p>;
  if (deposits.length === 0) return <p className="notice">要有存款帳戶才能扣款，請先新增帳戶。</p>;
  // 只有一個投資帳戶時不必寫帳戶 選單才放得下名稱
  const manyAccounts = new Set(holdings.map((holding) => holding.accountId)).size > 1;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AccountSelect name="accountId" label="扣款帳戶" accounts={deposits} value={accountId} onChange={onAccountChange} />
      <label className="field">
        <span className="field-label">哪一檔</span>
        <select name="holdingId" required value={holdingId ?? ""} onChange={(event) => onHoldingChange(Number(event.target.value))} className="input">
          {holdings.map((holding) => (
            <option key={holding.id} value={holding.id}>
              {holding.symbol} {holding.name}
              {holding.active ? (manyAccounts ? `（${holding.accountName}）` : "") : `（${holding.accountName}，已停用）`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** 鎖住時選單停用 停用的欄位不會送出 所以另外放隱藏欄位 */
function ModeSelect({ mode, locked, onChange }: { mode: RecurringMode; locked: string | null; onChange: (mode: RecurringMode) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        記帳方式
      </label>
      <select
        id={id}
        name={locked ? undefined : "mode"}
        value={mode}
        disabled={locked !== null}
        aria-describedby={locked ? `${id}-hint` : undefined}
        onChange={(event) => onChange(parseMode(event.target.value))}
        className="input disabled:cursor-not-allowed disabled:opacity-60"
      >
        {RECURRING_MODES.map((value) => (
          <option key={value} value={value}>
            {RECURRING_MODE_LABELS[value]}
          </option>
        ))}
      </select>
      {locked && (
        <>
          <input type="hidden" name="mode" value="confirm" />
          <p id={`${id}-hint`} className="text-sm text-ink-soft">
            {locked}
          </p>
        </>
      )}
    </div>
  );
}
