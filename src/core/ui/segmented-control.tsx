type SegmentedOption<T extends string> = { id: T; label: string };

type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * toolbar 前面有看得到的標籤 例如篩選
   * field 給表單用 撐滿寬度選項平分 旁邊已經有欄位標籤 label 只給報讀器
   */
  variant?: "toolbar" | "field";
  /** 給了就把選到的值放進隱藏欄位 跟表單一起送出 */
  name?: string;
};

export function SegmentedControl<T extends string>({ label, options, value, onChange, variant = "toolbar", name }: SegmentedControlProps<T>) {
  const field = variant === "field";
  const buttons = options.map((option) => (
    <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)} className={field ? "segmented-option flex-1 gap-1.5" : "segmented-option"}>
      {option.label}
    </button>
  ));
  const hidden = name && <input type="hidden" name={name} value={value} />;

  if (field) {
    return (
      <div role="group" aria-label={label} className="segmented flex w-full">
        {buttons}
        {hidden}
      </div>
    );
  }
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span aria-hidden className="text-sm text-ink-soft">
        {label}：
      </span>
      <div className="segmented">{buttons}</div>
      {hidden}
    </div>
  );
}
