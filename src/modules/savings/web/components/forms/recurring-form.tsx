"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { formatDay } from "../../../lib/dates";
import { nextRunDate } from "../../../lib/recurring";
import { createRecurringAction, updateRecurringAction } from "../../actions";
import { pickAccount, pickOtherAccount } from "../../last-used";
import { EntryFields, useEntryChoice } from "./entry-form";
import { DayOfMonthSelect, FormButtons, NoteField, type SelectableAccount } from "./fields";
import type { CategoryOption, RecurringDraft } from "./options";

type RecurringFormProps = {
  /** 修改時帶入原本的固定收支 */
  rule?: RecurringDraft;
  accounts: readonly SelectableAccount[];
  categories: readonly CategoryOption[];
  today: string;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 跟記帳一樣 但日期改成每月幾日 下面即時寫出下次會記在哪天 */
export function RecurringForm({ rule, accounts, categories, today, onDone, onCancel }: RecurringFormProps) {
  const choice = useEntryChoice(
    accounts,
    categories,
    () => {
      const account = rule?.accountId ?? pickAccount(accounts);
      return { kind: rule?.kind ?? "expense", accountId: account, counterAccountId: rule?.counterAccountId ?? pickOtherAccount(accounts, account), categoryId: rule?.categoryId ?? null };
    },
    !rule,
  );
  const [day, setDay] = useState(() => rule?.dayOfMonth ?? Number(today.slice(8, 10)));
  const { state, pending, formProps } = useDialogForm(rule ? updateRecurringAction : createRecurringAction, onDone);

  // 新增的從今天起算 之前的日期不補記
  // 用伺服器給的台北今天而不看裝置時鐘 才跟伺服器算的一樣
  const createdAt = rule ? new Date(rule.createdAt) : new Date(`${today}T00:00:00+08:00`);
  const next = formatDay(nextRunDate({ dayOfMonth: day, lastPostedMonth: rule?.lastPostedMonth ?? null, createdAt }, today));
  const monthEnd = day > 28 ? "；沒有這一天的月份記在月底" : "";
  const hint = rule && !rule.active ? `已停用：恢復後才會自動記${monthEnd}` : `下次自動記：${next}${monthEnd}`;

  return (
    <form {...formProps} className="stack">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <EntryFields
        choice={choice}
        accounts={accounts}
        categories={categories}
        amount={rule?.amount}
        when={<DayOfMonthSelect name="dayOfMonth" label="日期" value={day} onValueChange={setDay} hint={hint} />}
      />
      <NoteField defaultValue={rule?.note} placeholder="例如：房租、定期定額" />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={rule ? "儲存" : "新增"} pendingLabel={rule ? "儲存中…" : "新增中…"} icon={rule ? "check" : "plus"} disabled={choice.cannotTransfer} />
    </form>
  );
}
