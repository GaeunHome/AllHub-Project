type SegmentedOption<T extends string> = { id: T; label: string };

type SegmentedControlProps<T extends string> = {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span aria-hidden className="text-sm text-muted">
        {label}：
      </span>
      <div className="segmented">
        {options.map((option) => (
          <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)} className="segmented-option">
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
