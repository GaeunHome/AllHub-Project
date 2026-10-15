"use client";

import { useMemo, useReducer, type ReactNode } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback, type FormState } from "@/core/ui/form-message";
import { ENTRY_KINDS, TRANSACTION_KIND_LABELS, type EntryKind } from "../../../lib/kinds";
import { lastAccountPref, lastTransferToPref, pickAccount, pickOtherAccount } from "../../last-used";
import { TRANSACTION_KIND_ICONS } from "../kind-icon";
import { Segmented } from "../segmented";
import { cannotTransfer, entryChoiceReducer, entryStartDate, initialEntryChoice, type ChoiceStart } from "./entry-choice";
import { AccountSelect, AmountField, CategoryChips, DateField, FormButtons, NoteField, type SelectableAccount } from "./fields";
import type { CategoryOption, EntryDraft } from "./options";

const ENTRY_KIND_OPTIONS = ENTRY_KINDS.map((kind) => ({ id: kind, label: TRANSACTION_KIND_LABELS[kind], icon: TRANSACTION_KIND_ICONS[kind] }));

/** 記帳與固定收支共用 連動的規則在 entry-choice.ts */
export function useEntryChoice(accounts: readonly SelectableAccount[], categories: readonly CategoryOption[], start: () => ChoiceStart, arrange: boolean) {
  const reducer = useMemo(() => entryChoiceReducer(accounts, categories), [accounts, categories]);
  // 視窗打開才算繪 預設值只算一次 這時也讀得到上次用的帳戶
  const [choice, dispatch] = useReducer(reducer, undefined, () => initialEntryChoice(start(), accounts, arrange));

  return {
    ...choice,
    cannotTransfer: cannotTransfer(choice),
    changeKind: (kind: EntryKind) => dispatch({ type: "kind", kind }),
    changeAccount: (id: number) => dispatch({ type: "account", id }),
    changeCounter: (id: number) => dispatch({ type: "counter", id }),
    setCategoryId: (id: number | null) => dispatch({ type: "category", id }),
  };
}

type EntryChoiceControls = ReturnType<typeof useEntryChoice>;

/** when 是帳戶旁邊的日期欄位 記帳是日期 固定收支是每月幾日 */
export function EntryFields({ choice, accounts, categories, amount, when }: { choice: EntryChoiceControls; accounts: readonly SelectableAccount[]; categories: readonly CategoryOption[]; amount?: number; when: ReactNode }) {
  const isTransfer = choice.kind === "transfer";
  return (
    <>
      <Segmented label="類型" name="kind" options={ENTRY_KIND_OPTIONS} value={choice.kind} onChange={choice.changeKind} />
      <AmountField name="amount" label="金額（元）" defaultValue={amount} required autoFocus large placeholder="0" />
      {isTransfer ? (
        choice.cannotTransfer ? (
          <p className="notice">要有兩個以上的帳戶才能轉帳，請先到設定新增帳戶。</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AccountSelect name="accountId" label="從（轉出）" accounts={accounts} value={choice.accountId} onChange={choice.changeAccount} />
            <AccountSelect name="counterAccountId" label="到（轉入）" accounts={accounts} value={choice.counterId} onChange={choice.changeCounter} />
          </div>
        )
      ) : (
        <CategoryChips categories={categories.filter((category) => category.kind === choice.kind)} value={choice.categoryId} onChange={choice.setCategoryId} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {!isTransfer && <AccountSelect name="accountId" label="帳戶" accounts={accounts} value={choice.accountId} onChange={choice.changeAccount} />}
        {when}
      </div>
    </>
  );
}

export type EntryFormProps = {
  accounts: readonly SelectableAccount[];
  categories: readonly CategoryOption[];
  today: string;
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** 修改時帶入原本的紀錄 送出時帶著它的 id */
  entry?: EntryDraft;
  /** 從帳戶卡片打開時帶入這個帳戶 */
  accountId?: number;
  defaultKind?: EntryKind;
  /** 快速記帳 成功後記住這次用的帳戶 下次預設帶入 */
  remember?: boolean;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

/** 支出 收入與轉帳共用一張表單 換類型時打好的金額 日期 備註留著 */
export function EntryForm({ accounts, categories, today, action, entry, accountId, defaultKind = "expense", remember = false, onDone, onCancel }: EntryFormProps) {
  const choice = useEntryChoice(
    accounts,
    categories,
    () => {
      const account = entry?.accountId ?? pickAccount(accounts, accountId, remember ? lastAccountPref.read() : undefined);
      return {
        kind: entry?.kind ?? defaultKind,
        accountId: account,
        counterAccountId: entry?.counterAccountId ?? pickOtherAccount(accounts, account, remember ? lastTransferToPref.read() : undefined),
        categoryId: entry?.categoryId ?? null,
      };
    },
    !entry,
  );
  // 只在成功後記住 失敗時視窗留著 這次的選擇還不算數
  const { state, pending, formProps } = useDialogForm(action, (message) => {
    if (remember && choice.accountId) lastAccountPref.save(choice.accountId);
    if (remember && choice.kind === "transfer" && choice.counterId) lastTransferToPref.save(choice.counterId);
    onDone(message);
  });

  return (
    <form {...formProps} className="stack">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <EntryFields
        choice={choice}
        accounts={accounts}
        categories={categories}
        amount={entry?.amount}
        when={<DateField defaultValue={entry?.date ?? today} today={today} min={entryStartDate(choice, accounts)} />}
      />
      <NoteField defaultValue={entry?.note} />
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={entry ? "儲存" : "記錄"} pendingLabel={entry ? "儲存中…" : "記錄中…"} disabled={choice.cannotTransfer} />
    </form>
  );
}
