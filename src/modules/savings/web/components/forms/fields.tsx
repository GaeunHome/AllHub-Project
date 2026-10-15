"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";
import { Icon, type UiIconName } from "@/core/ui/icon";
import { MIN_DATE } from "../../../lib/dates";
import { NAME_MAX_LENGTH, NOTE_MAX_LENGTH, PALETTE_LABELS, SELECTABLE_COLORS, type PaletteColor } from "../../../lib/kinds";
import { scheduleLabel, UNCATEGORIZED_LABEL } from "../../entry-display";
import { ColorDot } from "../color-dot";
import type { ChoiceAccount } from "./entry-choice";
import type { CategoryOption } from "./options";

// 瀏覽器只先擋空白與太長這類明顯的錯 金額與日期以伺服器的驗證為準

// legend 預設壓在 fieldset 框線上又不吃 gap 浮動後才跟其他標籤一樣排
const LEGEND_CLASS = "field-label float-left";

type AmountFieldProps = {
  name: string;
  label: ReactNode;
  defaultValue?: number | null;
  /** 要即時試算時改成受控 例如更新餘額的差額 發薪分配的剩餘 */
  value?: string;
  onValueChange?: (text: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  /** 記帳視窗的主角 字大一點也高一點 */
  large?: boolean;
  placeholder?: string;
  /** 欄位下面的說明 報讀器在欄位上會一起念 */
  hint?: ReactNode;
  /** 給信用卡填負的溢繳 iPhone 的數字鍵盤沒有負號 所以改用一般鍵盤 */
  allowNegative?: boolean;
};

/**
 * 用文字欄位不用 number 手機一樣跳數字鍵盤 滑鼠滾輪也不會改到數字
 * 金額只收整數元 可以打千分位
 */
export function AmountField({ name, label, defaultValue, value, onValueChange, required = false, autoFocus = false, large = false, placeholder, hint, allowNegative = false }: AmountFieldProps) {
  const id = useId();
  const controlled = value !== undefined ? { value, onChange: (event: ChangeEvent<HTMLInputElement>) => onValueChange?.(event.target.value) } : { defaultValue: defaultValue ?? undefined };
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative flex items-center">
        <span aria-hidden className={`pointer-events-none absolute left-3.5 font-semibold text-ink-soft ${large ? "text-xl" : ""}`}>
          $
        </span>
        <input
          id={id}
          name={name}
          inputMode={allowNegative ? undefined : "numeric"}
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          data-autofocus={autoFocus || undefined}
          {...controlled}
          className={`input pl-8 text-right font-semibold tabular-nums ${large ? "min-h-14 text-2xl" : ""}`}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

export function NameField({ defaultValue, placeholder }: { defaultValue?: string; placeholder: string }) {
  return (
    <label className="field">
      <span className="field-label">名稱</span>
      <input name="name" required maxLength={NAME_MAX_LENGTH} defaultValue={defaultValue} placeholder={placeholder} autoComplete="off" data-autofocus className="input" />
    </label>
  );
}

/**
 * 只能記到台北時間的今天 today 由伺服器算好傳進來
 * min 是帳戶開始記帳的日期 不知道時只擋太早的年份
 */
export function DateField({ defaultValue, today, min }: { defaultValue: string; today: string; min?: string }) {
  return (
    <label className="field">
      <span className="field-label">日期</span>
      <input type="date" name="date" required defaultValue={defaultValue} min={min ?? MIN_DATE} max={today} className="input" />
    </label>
  );
}

export function NoteField({ defaultValue, placeholder = "例如：午餐、高鐵票" }: { defaultValue?: string | null; placeholder?: string }) {
  return (
    <label className="field">
      <span className="field-label">備註（選填）</span>
      <input name="note" maxLength={NOTE_MAX_LENGTH} defaultValue={defaultValue ?? ""} placeholder={placeholder} autoComplete="off" className="input" />
    </label>
  );
}

/** kind 與扣款帳戶給繳卡費的連動用 選單本身只看名稱與停用 */
export type SelectableAccount = ChoiceAccount & { name: string; active?: boolean };

/** 受控才能讓轉帳即時避開同一個帳戶 停用的只在修改舊紀錄時出現 要標出來 */
export function AccountSelect({ name, label, accounts, value, onChange }: { name: string; label: string; accounts: readonly SelectableAccount[]; value: number | undefined; onChange: (id: number) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select name={name} required value={value ?? ""} onChange={(event) => onChange(Number(event.target.value))} className="input">
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.active === false ? `${account.name}（已停用）` : account.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// 寬螢幕 36px 觸控裝置 44px 選到的用主色框起來
// radio 藏起來但留在膠囊裡 鍵盤的方向鍵照樣能換
const CHOICE_CHIP =
  "relative inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface-solid px-3.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-soft)] has-[:checked]:font-semibold has-[:checked]:text-brand-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] pointer-coarse:min-h-11";

/** 最後一個未分類讓選錯的人可以取消 */
export function CategoryChips({ categories, value, onChange }: { categories: readonly CategoryOption[]; value: number | null; onChange: (id: number | null) => void }) {
  return (
    <fieldset className="field min-w-0">
      <legend className={LEGEND_CLASS}>分類</legend>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <label key={category.id} className={CHOICE_CHIP}>
            <input type="radio" name="categoryId" value={category.id} checked={value === category.id} onChange={() => onChange(category.id)} className="sr-only" />
            <ColorDot color={category.color} />
            {category.name}
          </label>
        ))}
        <label className={CHOICE_CHIP}>
          <input type="radio" name="categoryId" value="" checked={value === null} onChange={() => onChange(null)} className="sr-only" />
          {UNCATEGORIZED_LABEL}
        </label>
      </div>
    </fieldset>
  );
}

/**
 * 選到的外圈加框 不只靠顏色分辨
 * 灰色留給未分類與未設定用途 不能選
 */
export function ColorSwatches({ defaultValue }: { defaultValue: PaletteColor }) {
  return (
    <fieldset className="field min-w-0">
      <legend className={LEGEND_CLASS}>顏色</legend>
      {/* 七欄一列 手機的視窗也放得下 44px 更窄時每格跟著縮 */}
      <div className="grid grid-cols-7 justify-items-center">
        {SELECTABLE_COLORS.map((color) => (
          <label
            key={color}
            title={PALETTE_LABELS[color]}
            className="relative grid aspect-square w-full max-w-11 cursor-pointer place-items-center rounded-full outline-offset-1 hover:bg-surface-muted has-[:checked]:outline-2 has-[:checked]:outline-[var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
          >
            <input type="radio" name="color" value={color} required defaultChecked={color === defaultValue} className="sr-only" />
            <ColorDot color={color} className="size-7" />
            <span className="sr-only">{PALETTE_LABELS[color]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

type DayOfMonthSelectProps = {
  name: string;
  label: string;
  defaultValue?: number | null;
  /** 要即時顯示下次日期時改成受控 */
  value?: number;
  onValueChange?: (day: number) => void;
  /** 信用卡的繳款日可以不設 */
  allowEmpty?: boolean;
  hint?: ReactNode;
};

/** 固定收支的日期與信用卡的繳款日 */
export function DayOfMonthSelect({ name, label, defaultValue, value, onValueChange, allowEmpty = false, hint }: DayOfMonthSelectProps) {
  const id = useId();
  const controlled = value !== undefined ? { value, onChange: (event: ChangeEvent<HTMLSelectElement>) => onValueChange?.(Number(event.target.value)) } : { defaultValue: defaultValue ?? "" };
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} name={name} required={!allowEmpty} aria-describedby={hint ? `${id}-hint` : undefined} {...controlled} className="input">
        {allowEmpty && <option value="">未設定</option>}
        {DAYS.map((day) => (
          <option key={day} value={day}>
            {scheduleLabel(day)}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * 成功訊息獨佔最後一整列 才不會把同一排的按鈕拆開
 * 對齊跟著那一排 靠右的工具列訊息也靠右
 */
export const ROW_MESSAGE_CLASS = "flex basis-full order-last [justify-content:inherit]";

type FormButtonsProps = { pending: boolean; onCancel: () => void; label: string; pendingLabel: string; icon?: UiIconName; disabled?: boolean };

/** 取消不會送出表單 送出中兩個都停用 */
export function FormButtons({ pending, onCancel, label, pendingLabel, icon = "check", disabled = false }: FormButtonsProps) {
  return (
    <div className="button-row justify-end">
      <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost">
        取消
      </button>
      <button disabled={pending || disabled} className="btn-primary">
        <Icon name={icon} className="size-4" />
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
