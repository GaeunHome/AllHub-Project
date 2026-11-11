"use client";

import { useState } from "react";
import { useDialogForm } from "@/core/ui/dialog";
import { FormButtons } from "@/core/ui/form-buttons";
import { FormFeedback } from "@/core/ui/form-message";
import { SegmentedControl } from "@/core/ui/segmented-control";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, type AccountKind, type CardStyle } from "../../../lib/kinds";
import { shownFigure } from "../../../lib/ledger";
import { createAccountAction, updateAccountAction } from "../../actions";
import { pausedName } from "../../format";
import { CardStyleField } from "../accounts/card-face";
import { AmountField, CheckboxField, DayOfMonthSelect, LabelField, NameField, StartDateField } from "./fields";

/** 修改時帶入的原本設定 信用卡的 openingBalance 負的是欠款 正的是溢繳 */
export type AccountDraft = {
  id: number;
  name: string;
  kind: AccountKind;
  /** 用途 例如生活費 */
  label?: string | null;
  /** 信用卡的卡面顏色 null 是照順序配色 */
  cardStyle?: CardStyle | null;
  openingBalance: number;
  openingCost: number | null;
  monthlyPlan: number | null;
  targetAmount: number | null;
  statementDay: number | null;
  payFromAccountId: number | null;
  autopay: boolean;
  /** 開始記帳的那天 舊帳戶是建立那天 */
  startDate: string;
};

type AccountFormProps = {
  account?: AccountDraft;
  /** 新增時固定是這種帳戶 沒給才讓人選類型 */
  kind?: AccountKind;
  /** 信用卡的扣款帳戶只能是存款帳戶 */
  payFromAccounts: readonly { id: number; name: string; active: boolean }[];
  /** 台北時間的今天 開始記帳日不能更晚 新增時預設這天 */
  today: string;
  onDone: (message: string | undefined) => void;
  onCancel: () => void;
};

const KIND_OPTIONS = ACCOUNT_KINDS.map((kind) => ({ id: kind, label: ACCOUNT_KIND_LABELS[kind] }));

// 只要自己認得的名字 提醒放在範例裡 不另外多一段說明
const NAME_PLACEHOLDERS: Record<AccountKind, string> = { deposit: "例如：台銀（不用填帳號）", investment: "例如：臺銀證券", credit: "例如：國泰卡（不用填卡號）" };
const LABEL_PLACEHOLDERS: Record<Exclude<AccountKind, "credit">, string> = { deposit: "例如：生活費、緊急預備金", investment: "例如：長期投資" };

// 從今天開始記帳時填現在的數字 選了過去或建立後改的是開始記帳那天的數字 對帳要用更新餘額
const OPENING_LABELS: Record<AccountKind, { create: string; edit: string }> = {
  deposit: { create: "目前餘額（元）", edit: "起始餘額（元）" },
  investment: { create: "目前市值（元）", edit: "起始市值（元）" },
  credit: { create: "目前未繳（元）", edit: "起始未繳（元）" },
};
const CREDIT_HINT = "多繳（溢繳）時填負數";
// 截止日每期照帳單填 這裡只設結帳日
const STATEMENT_TIP = "設了之後，每次結帳後「這個月要做的事」會提醒你填帳單";
const EDIT_TIPS: Record<AccountKind, string> = {
  deposit: "這是開始記帳時的數字，要對帳請按帳戶上的「更新餘額」",
  investment: "這是開始記帳時的數字，目前的市值看「投資」頁",
  credit: "這是開始記帳時的數字，要對帳請照銀行的帳單「填帳單」",
};

/** 新增與修改帳戶 欄位依類型不同 類型建立後不能改 */
export function AccountForm({ account, kind: fixedKind, payFromAccounts, today, onDone, onCancel }: AccountFormProps) {
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? fixedKind ?? "deposit");
  const [startDate, setStartDate] = useState(account?.startDate ?? today);
  const { state, pending, formProps } = useDialogForm(account ? updateAccountAction : createAccountAction, onDone);
  const opening = OPENING_LABELS[kind];
  // 表單填的是銀行 App 上的數字 信用卡是未繳 存的卻是負的餘額
  const openingValue = account ? shownFigure(account.kind, account.openingBalance) : undefined;
  // 停用的存款帳戶不能再選 但原本選的留著 儲存時才不會默默改掉
  const payFrom = payFromAccounts.filter((option) => option.id !== account?.id && (option.active || option.id === account?.payFromAccountId));

  return (
    <form {...formProps} className="stack">
      {account ? (
        <>
          <input type="hidden" name="id" value={account.id} />
          <p className="text-ink">{ACCOUNT_KIND_LABELS[kind]}帳戶（類型建立後不能改）</p>
        </>
      ) : fixedKind ? (
        <input type="hidden" name="kind" value={fixedKind} />
      ) : (
        <SegmentedControl variant="field" label="帳戶類型" name="kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      )}
      <NameField defaultValue={account?.name} placeholder={NAME_PLACEHOLDERS[kind]} />
      {kind !== "credit" && <LabelField defaultValue={account?.label} placeholder={LABEL_PLACEHOLDERS[kind]} />}
      <StartDateField defaultValue={startDate} today={today} onChange={setStartDate} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          key={`opening-${kind}`}
          name="openingBalance"
          label={account || startDate !== today ? opening.edit : opening.create}
          defaultValue={openingValue}
          placeholder="0"
          hint={kind === "credit" ? CREDIT_HINT : undefined}
          tip={account ? EDIT_TIPS[kind] : undefined}
          allowNegative={kind === "credit"}
        />
        {kind === "investment" && <AmountField name="openingCost" label="成本（元，選填）" defaultValue={account?.openingCost} />}
      </div>
      {kind === "credit" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <DayOfMonthSelect name="statementDay" label="結帳日" defaultValue={account?.statementDay} allowEmpty tip={STATEMENT_TIP} />
            <label className="field self-start">
              <span className="field-label">扣款帳戶</span>
              <select name="payFromAccountId" defaultValue={account?.payFromAccountId ?? ""} className="input">
                <option value="">未設定</option>
                {payFrom.map((option) => (
                  <option key={option.id} value={option.id}>
                    {pausedName(option.name, option.active)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CheckboxField name="autopay" label="自動扣繳" defaultChecked={account?.autopay} />
          <CardStyleField defaultValue={account?.cardStyle ?? null} />
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AmountField name="monthlyPlan" label="每月規劃（元，選填）" defaultValue={account?.monthlyPlan} />
          <AmountField name="targetAmount" label="目標金額（元，選填）" defaultValue={account?.targetAmount} />
        </div>
      )}
      {!pending && <FormFeedback state={{ error: state.error }} />}
      <FormButtons
        pending={pending}
        onCancel={onCancel}
        label={account ? "儲存" : kind === "credit" ? "新增信用卡" : "新增帳戶"}
        pendingLabel={account ? "儲存中…" : "新增中…"}
        icon={account ? "check" : "plus"}
      />
    </form>
  );
}
