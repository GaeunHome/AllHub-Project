import { SegmentedControl } from "@/core/ui/segmented-control";
import { SPLIT_MODES, allocate, centsOf, type SplitMode } from "../../lib/expenses";
import type { TripMember } from "../../service/trips";
import { amountText, type ExpenseDraft } from "../expense-view";

// 記帳視窗的誰付的與怎麼分 狀態留在表單 這裡只畫欄位與試算

type PayerMode = ExpenseDraft["payerMode"];
type Amounts = Readonly<Record<string, string>>;

const SPLIT_OPTIONS = Object.entries(SPLIT_MODES).map(([id, label]) => ({ id: id as SplitMode, label }));

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

type PayerFieldsProps = {
  people: TripMember[];
  defaultPaidBy: string;
  payerMode: PayerMode;
  onPayerMode: (mode: PayerMode) => void;
  paid: Amounts;
  onPaid: (paid: Record<string, string>) => void;
  total: number | null;
  currency: string;
};

/** 預設一個人付 好幾個人付時每人填付了多少 加起來要剛好 */
export function PayerFields({ people, defaultPaidBy, payerMode, onPayerMode, paid, onPaid, total, currency }: PayerFieldsProps) {
  return (
    <fieldset className="field">
      <legend className="field-label">誰付的</legend>
      <div className="flex flex-wrap gap-x-6">
        {(["one", "many"] as const).map((mode) => (
          <label key={mode} className="flex min-h-11 items-center gap-2 text-ink">
            <input type="radio" name="payerMode" value={mode} checked={payerMode === mode} onChange={() => onPayerMode(mode)} className="size-4.5" />
            {mode === "one" ? "一個人" : "好幾個人"}
          </label>
        ))}
      </div>
      {payerMode === "one" ? (
        <select name="paidBy" defaultValue={defaultPaidBy} aria-label="付錢的人" className="input">
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      ) : (
        <>
          {people.map((person) => (
            <PersonInput key={person.id} name={`paid:${person.id}`} label={person.name} spoken={`${person.name}付了多少`} value={paid[person.id] ?? ""} onChange={(value) => onPaid({ ...paid, [person.id]: value })} decimal />
          ))}
          <p className="font-medium text-ink tabular-nums">{sumStatus(paid, total, currency)}</p>
        </>
      )}
    </fieldset>
  );
}

type SplitFieldsProps = {
  people: TripMember[];
  split: SplitMode;
  onSplit: (split: SplitMode) => void;
  checked: ReadonlySet<string>;
  onChecked: (checked: ReadonlySet<string>) => void;
  /** 照金額或照比例那一組格子 */
  portions: Amounts;
  onPortions: (portions: Record<string, string>) => void;
  total: number | null;
  currency: string;
};

/** 平分 照金額或照比例 平分與照比例時每個人旁邊先寫分到多少 */
export function SplitFields({ people, split, onSplit, checked, onChecked, portions, onPortions, total, currency }: SplitFieldsProps) {
  const weights = split === "even" ? new Map([...checked].map((id) => [id, 1])) : new Map(people.map(({ id }) => [id, Number(portions[id] ?? 0) || 0]));
  const previews = split === "amount" ? new Map<string, string>() : sharePreview(total, weights, currency);
  return (
    <fieldset className="field">
      <legend className="field-label">怎麼分</legend>
      <SegmentedControl label="怎麼分" options={SPLIT_OPTIONS} value={split} onChange={onSplit} variant="field" name="split" />
      {split === "even"
        ? people.map((person) => (
            <label key={person.id} className="flex min-h-11 items-center gap-3 text-ink">
              <input
                type="checkbox"
                name="shares"
                value={person.id}
                checked={checked.has(person.id)}
                onChange={(event) => onChecked(new Set(event.target.checked ? [...checked, person.id] : [...checked].filter((id) => id !== person.id)))}
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
              onChange={(value) => onPortions({ ...portions, [person.id]: value })}
              preview={previews.get(person.id)}
              decimal={split === "amount"}
            />
          ))}
      {split === "amount" && <p className="font-medium text-ink tabular-nums">{sumStatus(portions, total, currency)}</p>}
      {split === "ratio" && <p className="text-ink">不分的人填 0 或留空</p>}
    </fieldset>
  );
}
