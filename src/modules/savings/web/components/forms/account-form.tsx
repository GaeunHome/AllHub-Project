"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormFeedback } from "@/core/ui/form-message";
import { Icon } from "@/core/ui/icon";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, type AccountKind } from "../../../lib/kinds";
import { shownFigure } from "../../../lib/ledger";
import { createAccountAction, updateAccountAction } from "../../actions";
import { AccountKindIcon, ACCOUNT_KIND_ICONS } from "../kind-icon";
import { Segmented } from "../segmented";
import { AmountField, DayOfMonthSelect, FormButtons, NameField } from "./fields";

/** 修改時帶入的原本設定 信用卡的 openingBalance 負的是欠款 正的是溢繳 */
export type AccountDraft = {
  id: number;
  name: string;
  kind: AccountKind;
  purposeId: number | null;
  openingBalance: number;
  openingCost: number | null;
  monthlyPlan: number | null;
  targetAmount: number | null;
  dueDay: number | null;
  payFromAccountId: number | null;
};

type AccountFormProps = {
  account?: AccountDraft;
  purposes: readonly { id: number; name: string }[];
  /** 信用卡的扣款帳戶只能是存款帳戶 */
  payFromAccounts: readonly { id: number; name: string; active: boolean }[];
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

const KIND_OPTIONS = ACCOUNT_KINDS.map((kind) => ({ id: kind, label: ACCOUNT_KIND_LABELS[kind], icon: ACCOUNT_KIND_ICONS[kind] }));

const NAME_PLACEHOLDERS: Record<AccountKind, string> = { deposit: "例如：國泰、郵局", investment: "例如：元大證券", credit: "例如：國泰信用卡" };

// 新增時填現在的數字 建立後改的是開始記帳時的數字 對帳要用更新餘額
const OPENING_LABELS: Record<AccountKind, { create: string; edit: string; hint: string }> = {
  deposit: { create: "起始餘額（元）", edit: "起始餘額（元）", hint: "開始記帳前帳戶裡就有的錢，沒填是 0。" },
  investment: { create: "目前市值（元）", edit: "起始市值（元）", hint: "開始記帳時的市值，沒填是 0。" },
  credit: { create: "目前未繳（元）", edit: "起始未繳（元）", hint: "還沒繳的卡費，沒填是 0；多繳（溢繳）時填負數。" },
};
const EDIT_OPENING_HINT = "改這裡會改到建立以來每個月的餘額；要跟銀行 App 對帳，請用帳戶卡片上的「更新餘額」。";
const EDIT_CREDIT_HINT = "多繳（溢繳）時填負數。";

/** 新增與修改帳戶 欄位依類型不同 類型建立後不能改 */
export function AccountForm({ account, purposes, payFromAccounts, onDone, onCancel }: AccountFormProps) {
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "deposit");
  const { state, pending, formProps } = useDialogForm(account ? updateAccountAction : createAccountAction, onDone);
  const opening = OPENING_LABELS[kind];
  // 表單填的是銀行 App 上的數字 信用卡是未繳 存的卻是負的餘額
  const openingValue = account ? shownFigure(account.kind, account.openingBalance) : undefined;
  const openingHint = account ? (kind === "credit" ? `${EDIT_CREDIT_HINT}${EDIT_OPENING_HINT}` : EDIT_OPENING_HINT) : opening.hint;
  // 停用的存款帳戶不能再選 但原本選的留著 儲存時才不會默默改掉
  const payFrom = payFromAccounts.filter((option) => option.id !== account?.id && (option.active || option.id === account?.payFromAccountId));

  return (
    <form {...formProps} className="stack">
      {account ? (
        <>
          <input type="hidden" name="id" value={account.id} />
          <p className="flex items-center gap-2 text-ink">
            <AccountKindIcon kind={kind} className="size-4 text-accent" />
            {ACCOUNT_KIND_LABELS[kind]}帳戶（類型建立後不能改）
          </p>
        </>
      ) : (
        <Segmented label="帳戶類型" name="kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      )}
      <NameField defaultValue={account?.name} placeholder={NAME_PLACEHOLDERS[kind]} />
      <p className="notice">
        <Icon name="shield-check" />
        <span>取一個自己認得的名字就好，不用填帳號或卡號。</span>
      </p>
      {kind !== "credit" && (
        <label className="field">
          <span className="field-label">用途</span>
          <select name="purposeId" defaultValue={account?.purposeId ?? ""} className="input">
            <option value="">未設定</option>
            {purposes.map((purpose) => (
              <option key={purpose.id} value={purpose.id}>
                {purpose.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          key={`opening-${kind}`}
          name="openingBalance"
          label={account ? opening.edit : opening.create}
          defaultValue={openingValue}
          placeholder="0"
          hint={openingHint}
          allowNegative={kind === "credit"}
        />
        {kind === "investment" && <AmountField name="openingCost" label="成本（元，選填）" defaultValue={account?.openingCost} hint="投入的本金；沒填就當成跟市值一樣。" />}
      </div>
      {kind === "credit" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DayOfMonthSelect name="dueDay" label="繳款日（選填）" defaultValue={account?.dueDay} allowEmpty />
          <label className="field">
            <span className="field-label">扣款帳戶（選填）</span>
            <select name="payFromAccountId" defaultValue={account?.payFromAccountId ?? ""} className="input">
              <option value="">未設定</option>
              {payFrom.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.active ? option.name : `${option.name}（已停用）`}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-ink-soft sm:col-span-2">兩個都設定後，總覽會算出扣款帳戶繳完卡費還剩多少，不夠時提醒你。</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField name="monthlyPlan" label="每月規劃（元，選填）" defaultValue={account?.monthlyPlan} hint="發薪分配時建議每月轉進來的錢。" />
          <AmountField name="targetAmount" label="目標金額（元，選填）" defaultValue={account?.targetAmount} hint="存到目標後，發薪分配就不再轉進來。" />
        </div>
      )}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons pending={pending} onCancel={onCancel} label={account ? "儲存" : "新增帳戶"} pendingLabel={account ? "儲存中…" : "新增中…"} icon={account ? "check" : "plus"} />
    </form>
  );
}
