import { Icon, type UiIconName } from "@/core/ui/icon";

type PillChoiceProps<T extends string> = {
  label: string;
  icon?: UiIconName;
  text?: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** 一組互斥的選項收在同一顆膠囊裡 例如字幕語言與大小 */
export function PillChoice<T extends string>({ label, icon, text, options, value, onChange }: PillChoiceProps<T>) {
  return (
    <div role="group" aria-label={label} className="yt-segmented">
      {icon && <Icon name={icon} className="size-4" />}
      {text && <span aria-hidden>{text}</span>}
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
