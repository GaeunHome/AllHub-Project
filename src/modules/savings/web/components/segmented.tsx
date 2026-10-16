"use client";

type SegmentedOption<T extends string> = { id: T; label: string };

type SegmentedProps<T extends string> = {
  /** 報讀器聽到的名稱 旁邊已經有標題或標籤 所以不另外顯示 */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 給了就把選到的值放進隱藏欄位一起送出 */
  name?: string;
};

/** 表單裡撐滿寬度選項平分 不用 core 的 SegmentedControl 因為它前面會多一個看得到的標籤 */
export function Segmented<T extends string>({ label, options, value, onChange, name }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="segmented flex w-full">
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)} className="segmented-option flex-1 gap-1.5">
          {option.label}
        </button>
      ))}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
